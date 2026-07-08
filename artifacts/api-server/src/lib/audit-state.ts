/**
 * Audit & Inspection — guarded state machines (spec §4.1 / §4.2 / §5.7).
 *
 * Three transition maps as data (same idiom as food's DISPATCH_TRANSITIONS)
 * plus executors that validate the map, apply state-specific column updates
 * and append a hash-chained STATE_CHANGE event in the SAME transaction.
 * Illegal transitions throw 409 ILLEGAL_TRANSITION; callers log a
 * DENIED_ATTEMPT event outside the failed transaction (FRD-EXE-03 AC).
 *
 * `Overdue` is a derived flag on audits/NCs, never a state.
 */
import { eq } from "drizzle-orm";
import { auditsTable, auditNonConformancesTable } from "@workspace/db";
import { httpError } from "./authz.js";
import { appendAuditEvent, type DbLike } from "./audit-events.js";

export type AuditState =
  | "DRAFT"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "PAUSED"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "REJECTED"
  | "APPROVED"
  | "CLOSED"
  | "CANCELLED";

export type NcState =
  | "OPEN"
  | "IN_PROGRESS"
  | "EXTENSION_REQUESTED"
  | "RESOLVED"
  | "VERIFIED"
  | "REOPENED"
  | "WAIVED"
  | "CLOSED";

export type TemplateVersionLifecycle =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "PUBLISHED"
  | "DEPRECATED"
  | "ARCHIVED";

/**
 * Audit lifecycle (spec §4.1).
 * SUBMITTED→APPROVED is the review-disabled collapse (D-2); CLOSED→IN_PROGRESS
 * is the OE-only reopen (FRD-REV-06) — both additionally guarded by callers.
 */
export const AUDIT_TRANSITIONS: Record<AuditState, AuditState[]> = {
  DRAFT: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["PAUSED", "SUBMITTED", "CANCELLED"],
  PAUSED: ["IN_PROGRESS", "CANCELLED"],
  SUBMITTED: ["UNDER_REVIEW", "APPROVED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  REJECTED: ["IN_PROGRESS"],
  APPROVED: ["CLOSED"],
  CLOSED: ["IN_PROGRESS"],
  CANCELLED: [],
};

/** Non-conformance lifecycle (spec §4.2). */
export const NC_TRANSITIONS: Record<NcState, NcState[]> = {
  OPEN: ["IN_PROGRESS", "WAIVED"],
  IN_PROGRESS: ["RESOLVED", "EXTENSION_REQUESTED", "WAIVED"],
  EXTENSION_REQUESTED: ["IN_PROGRESS"],
  RESOLVED: ["VERIFIED", "REOPENED"],
  VERIFIED: ["CLOSED"],
  REOPENED: ["IN_PROGRESS"],
  WAIVED: [],
  CLOSED: [],
};

/** TemplateVersion lifecycle (spec §5.7). Published versions are immutable. */
export const TEMPLATE_VERSION_TRANSITIONS: Record<
  TemplateVersionLifecycle,
  TemplateVersionLifecycle[]
> = {
  DRAFT: ["PENDING_APPROVAL", "PUBLISHED", "ARCHIVED"],
  PENDING_APPROVAL: ["PUBLISHED", "DRAFT"],
  PUBLISHED: ["DEPRECATED"],
  DEPRECATED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function canTransition<S extends string>(
  map: Record<S, S[]>,
  from: S,
  to: S,
): boolean {
  return (map[from] ?? []).includes(to);
}

export function assertTransition<S extends string>(
  map: Record<S, S[]>,
  from: S,
  to: S,
  entity: string,
): void {
  if (!canTransition(map, from, to)) {
    throw httpError(409, "ILLEGAL_TRANSITION", {
      entity,
      from,
      to,
      allowed: map[from] ?? [],
    });
  }
}

export interface TransitionActor {
  /** Null = system actor (P6). */
  id: string | null;
  role?: string | null;
}

export interface AuditTransitionCtx {
  actor: TransitionActor;
  reason?: string | null;
  /** Auto-captured at Start/Submit (FRD-EXE-14); auditor-uneditable. */
  geo?: { lat: number; lng: number } | null;
}

/**
 * Apply a validated audit transition: state column, state-specific timestamp
 * side-effects, and the STATE_CHANGE event — all in the caller's transaction.
 * Business guards (submit gate, close gate, reopen authority) are enforced by
 * the calling service BEFORE this runs; this function owns only the machine.
 */
export async function applyAuditTransition(
  tx: DbLike,
  audit: { id: string; state: string; startedAt: Date | null; reopenCount: number },
  to: AuditState,
  ctx: AuditTransitionCtx,
): Promise<void> {
  const from = audit.state as AuditState;
  assertTransition(AUDIT_TRANSITIONS, from, to, "AUDIT");

  const now = new Date();
  const set: Record<string, unknown> = { state: to, updatedAt: now };

  if (to === "IN_PROGRESS" && from === "SCHEDULED") {
    set["startedAt"] = now;
    if (ctx.geo) {
      set["startGeoLat"] = ctx.geo.lat;
      set["startGeoLng"] = ctx.geo.lng;
    }
  }
  if (to === "IN_PROGRESS" && from === "CLOSED") {
    // OE reopen (FRD-REV-06): caller has verified authority + reason.
    set["reopenCount"] = audit.reopenCount + 1;
    set["closedAt"] = null;
  }
  if (to === "SUBMITTED" || (to === "APPROVED" && from === "SUBMITTED")) {
    // Atomic submit stamps submittedAt/geo/duration itself (it owns scoring);
    // only fill the basics here for safety if the caller didn't.
    set["isOverdue"] = false;
  }
  if (to === "APPROVED") set["approvedAt"] = now;
  if (to === "CLOSED") set["closedAt"] = now;
  if (to === "CANCELLED") {
    set["cancelledAt"] = now;
    if (ctx.reason) set["cancelReason"] = ctx.reason;
  }

  await tx.update(auditsTable).set(set).where(eq(auditsTable.id, audit.id));

  await appendAuditEvent(tx, {
    entityType: "AUDIT",
    entityId: audit.id,
    auditId: audit.id,
    actorId: ctx.actor.id,
    actorRole: ctx.actor.role ?? null,
    kind: "STATE_CHANGE",
    fromState: from,
    toState: to,
    reason: ctx.reason ?? null,
  });
}

export interface NcTransitionCtx {
  actor: TransitionActor;
  reason?: string | null;
  auditId: string;
}

/** Apply a validated NC transition + STATE_CHANGE event in the caller's tx. */
export async function applyNcTransition(
  tx: DbLike,
  nc: { id: string; state: string },
  to: NcState,
  ctx: NcTransitionCtx,
): Promise<void> {
  const from = nc.state as NcState;
  assertTransition(NC_TRANSITIONS, from, to, "NC");

  const now = new Date();
  const set: Record<string, unknown> = { state: to, updatedAt: now };
  if (to === "VERIFIED") set["verifiedAt"] = now;
  if (to === "CLOSED") set["closedAt"] = now;
  if (to === "IN_PROGRESS" && from === "REOPENED") {
    // no-op beyond state; reopenCount is bumped when entering REOPENED
  }

  await tx
    .update(auditNonConformancesTable)
    .set(set)
    .where(eq(auditNonConformancesTable.id, nc.id));

  await appendAuditEvent(tx, {
    entityType: "NC",
    entityId: nc.id,
    auditId: ctx.auditId,
    actorId: ctx.actor.id,
    actorRole: ctx.actor.role ?? null,
    kind: "STATE_CHANGE",
    fromState: from,
    toState: to,
    reason: ctx.reason ?? null,
  });
}
