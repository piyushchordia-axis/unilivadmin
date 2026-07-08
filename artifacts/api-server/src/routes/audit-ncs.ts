/**
 * Audit & Inspection — NC register & CAPA workflow (P4: FRD-NCM, FRD-CAP,
 * FRD-REV-04). Owner-facing actions (start, corrective actions, evidence,
 * extension requests) authorize on NC ownership rather than a coarse module
 * gate, because auditees/owners span platform roles (UNIT_LEAD holds
 * AUDIT_FINDINGS, CLUSTER_MANAGER only views AUDIT_NCS) — ownership is the
 * authority (FRD-NCM-02). Reviewer verdicts (verify/reject/waive/extension
 * decide) gate on AUDIT_REVIEW edit. Every state change runs through
 * applyNcTransition (409 ILLEGAL_TRANSITION on bad moves) inside a
 * transaction; notifications go out after commit.
 */
import express, { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  auditsTable,
  auditCorrectiveActionsTable,
  auditEvidenceTable,
  auditNcExtensionRequestsTable,
  auditNonConformancesTable,
  auditQuestionsTable,
  propertiesTable,
  usersTable,
} from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";
import { httpError } from "../lib/authz.js";
import { can, type UserRole } from "../lib/permissions.js";
import { getPagination, buildMeta } from "../lib/paginate.js";
import { newId } from "../lib/id.js";
import { notify } from "../lib/notification-service.js";
import { appendAuditEvent } from "../lib/audit-events.js";
import { applyNcTransition, type NcState } from "../lib/audit-state.js";
import {
  auditActor,
  evidenceUrl,
  getAttachmentPolicy,
  getSeveritySla,
  maybeAutoCloseAudit,
  parseDataUrl,
  storeEvidence,
} from "../lib/audit-service.js";
import {
  resolveAuditAccess,
  scopeAuditsCondition,
  scopesFor,
  canView,
  type AuditType,
} from "../lib/audit-access.js";

const router: IRouter = Router();

const SEVERITIES = ["CRITICAL", "MAJOR", "MINOR"] as const;
type Severity = (typeof SEVERITIES)[number];
const NC_TERMINAL = ["VERIFIED", "CLOSED", "WAIVED"] as const;

/* ── Shared loaders & guards ───────────────────────────────────────────────── */

async function loadNc(id: string) {
  const [nc] = await db
    .select()
    .from(auditNonConformancesTable)
    .where(eq(auditNonConformancesTable.id, id));
  if (!nc) throw httpError(404, "Non-conformance not found");
  return nc;
}

async function loadAuditOf(nc: { auditId: string }) {
  const [audit] = await db.select().from(auditsTable).where(eq(auditsTable.id, nc.auditId));
  if (!audit) throw httpError(500, "Parent audit missing");
  return audit;
}

function assertNcOwner(nc: { ownerId: string }, userId: string) {
  if (nc.ownerId !== userId) {
    throw httpError(403, "Only the NC owner may perform this action");
  }
}

/** Reviewers = active Ops Excellence users (D-11). */
async function activeReviewers(): Promise<{ id: string }[]> {
  return db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.role, "OPS_EXCELLENCE"), eq(usersTable.isActive, true)));
}

const ncLink = (id: string) => `/audits/ncs/${id}`;

/* ── Register (FRD-NCM-03) ─────────────────────────────────────────────────── */

type SlaState = "DUE_SOON" | "OVERDUE" | "ON_TRACK" | "AWAITING_VERIFICATION" | null;

function slaStateOf(
  nc: { state: string; isOverdue: boolean; dueAt: Date },
  reminderLeadHours: number,
  now: number,
): SlaState {
  if (nc.state === "RESOLVED") return "AWAITING_VERIFICATION";
  if ((NC_TERMINAL as readonly string[]).includes(nc.state)) return null;
  if (nc.isOverdue || now > nc.dueAt.getTime()) return "OVERDUE";
  if (now >= nc.dueAt.getTime() - reminderLeadHours * 3_600_000) return "DUE_SOON";
  return "ON_TRACK";
}

/**
 * NC register + "My Findings" queue. Gate: AUDIT_NCS view (register roles) OR
 * AUDIT_FINDINGS view (auditees — UNIT_LEAD has no AUDIT_NCS module). Callers
 * without any broad module scope (VIEWER/REVIEWER/AUDITOR grant or global
 * admin) are FORCED to owner scoping, so auditees only ever see their own.
 */
router.get("/", authenticate, async (req, res) => {
  const role = req.user!.role as UserRole;
  if (!can(role, "AUDIT_NCS", "view") && !can(role, "AUDIT_FINDINGS", "view")) {
    throw httpError(403, "Forbidden — insufficient permissions");
  }

  const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
  const q = req.query as Record<string, string | undefined>;
  const access = await resolveAuditAccess(req.user!);

  const conditions = [];
  const hasBroadScope =
    access.isGlobalAdmin || scopesFor(access, ["VIEWER", "REVIEWER", "AUDITOR"]).length > 0;
  if (!hasBroadScope || q["mine"] === "true") {
    conditions.push(eq(auditNonConformancesTable.ownerId, req.user!.id));
  } else {
    // Scoped register: same visibility rule as the audit register (FRD-ACC-05).
    const scope = scopeAuditsCondition(access);
    if (scope) conditions.push(scope);
  }

  if (q["severity"]) {
    const severities = q["severity"].split(",").filter(Boolean);
    if (severities.length) conditions.push(inArray(auditNonConformancesTable.severity, severities as never[]));
  }
  if (q["state"]) {
    const states = q["state"].split(",").filter(Boolean);
    if (states.length) conditions.push(inArray(auditNonConformancesTable.state, states as never[]));
  }
  if (q["ownerId"]) conditions.push(eq(auditNonConformancesTable.ownerId, q["ownerId"]));
  if (q["auditId"]) conditions.push(eq(auditNonConformancesTable.auditId, q["auditId"]));
  if (q["overdue"] === "true") conditions.push(eq(auditNonConformancesTable.isOverdue, true));
  const where = conditions.length ? and(...conditions) : undefined;

  const sortCol = q["sort"] === "dueAt" ? auditNonConformancesTable.dueAt : auditNonConformancesTable.createdAt;
  const order = q["dir"] === "asc" ? asc(sortCol) : desc(sortCol);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditNonConformancesTable)
    .innerJoin(auditsTable, eq(auditsTable.id, auditNonConformancesTable.auditId))
    .where(where);
  const rows = await db
    .select({
      nc: auditNonConformancesTable,
      ticketNo: auditsTable.ticketNo,
      auditTitle: auditsTable.title,
      propertyId: auditsTable.propertyId,
      propertyName: propertiesTable.name,
      ownerName: usersTable.name,
    })
    .from(auditNonConformancesTable)
    .innerJoin(auditsTable, eq(auditsTable.id, auditNonConformancesTable.auditId))
    .leftJoin(propertiesTable, eq(propertiesTable.id, auditsTable.propertyId))
    .leftJoin(usersTable, eq(usersTable.id, auditNonConformancesTable.ownerId))
    .where(where)
    .orderBy(order)
    .limit(limit)
    .offset(offset);

  const sla = {
    CRITICAL: await getSeveritySla("CRITICAL"),
    MAJOR: await getSeveritySla("MAJOR"),
    MINOR: await getSeveritySla("MINOR"),
  };
  const now = Date.now();

  res.json({
    success: true,
    data: rows.map((r) => ({
      ...r.nc,
      ticketNo: r.ticketNo,
      auditTitle: r.auditTitle,
      propertyId: r.propertyId,
      propertyName: r.propertyName,
      ownerName: r.ownerName,
      slaState: slaStateOf(r.nc, sla[r.nc.severity as Severity].reminderLeadHours, now),
    })),
    meta: buildMeta(countRow?.count ?? 0, page, limit),
  });
});

/* ── Detail (FRD-NCM-02) ───────────────────────────────────────────────────── */

router.get("/:id", authenticate, async (req, res) => {
  const nc = await loadNc(req.params["id"] as string);
  const audit = await loadAuditOf(nc);

  const access = await resolveAuditAccess(req.user!);
  const isOwner = nc.ownerId === req.user!.id;
  if (!isOwner && !canView(access, audit.auditType as AuditType, audit.propertyId)) {
    throw httpError(403, "Outside your audit access scope");
  }

  const [property] = await db
    .select({ name: propertiesTable.name })
    .from(propertiesTable)
    .where(eq(propertiesTable.id, audit.propertyId));
  const [question] = nc.questionId
    ? await db
        .select({ prompt: auditQuestionsTable.prompt, type: auditQuestionsTable.type })
        .from(auditQuestionsTable)
        .where(eq(auditQuestionsTable.id, nc.questionId))
    : [];

  const actions = await db
    .select({ action: auditCorrectiveActionsTable, submittedByName: usersTable.name })
    .from(auditCorrectiveActionsTable)
    .leftJoin(usersTable, eq(usersTable.id, auditCorrectiveActionsTable.submittedBy))
    .where(eq(auditCorrectiveActionsTable.ncId, nc.id))
    .orderBy(asc(auditCorrectiveActionsTable.createdAt));

  const extensions = await db
    .select({ request: auditNcExtensionRequestsTable, requestedByName: usersTable.name })
    .from(auditNcExtensionRequestsTable)
    .leftJoin(usersTable, eq(usersTable.id, auditNcExtensionRequestsTable.requestedBy))
    .where(eq(auditNcExtensionRequestsTable.ncId, nc.id))
    .orderBy(asc(auditNcExtensionRequestsTable.createdAt));

  const evidence = await db
    .select()
    .from(auditEvidenceTable)
    .where(and(eq(auditEvidenceTable.ncId, nc.id), inArray(auditEvidenceTable.kind, ["NC", "CAPA"])))
    .orderBy(asc(auditEvidenceTable.createdAt));
  const evidenceWithUrls = await Promise.all(
    evidence.map(async (e) => ({
      ...e,
      url: await evidenceUrl(e.storageKey),
      thumbUrl: e.thumbStorageKey ? await evidenceUrl(e.thumbStorageKey) : null,
    })),
  );

  const nameIds = [...new Set([nc.ownerId, nc.createdBy].filter(Boolean))] as string[];
  const names = nameIds.length
    ? await db
        .select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable)
        .where(inArray(usersTable.id, nameIds))
    : [];
  const nameMap = new Map(names.map((u) => [u.id, u.name]));

  res.json({
    success: true,
    data: {
      ...nc,
      ownerName: nameMap.get(nc.ownerId) ?? null,
      createdByName: nc.createdBy ? nameMap.get(nc.createdBy) ?? null : "System",
      audit: {
        id: audit.id,
        ticketNo: audit.ticketNo,
        title: audit.title,
        propertyId: audit.propertyId,
        propertyName: property?.name ?? null,
      },
      questionPrompt: question?.prompt ?? null,
      questionType: question?.type ?? null,
      actions: actions.map((a) => ({ ...a.action, submittedByName: a.submittedByName })),
      extensionRequests: extensions.map((e) => ({ ...e.request, requestedByName: e.requestedByName })),
      evidence: evidenceWithUrls,
    },
  });
});

/* ── Edits + severity change (FRD-NCM-04) ──────────────────────────────────── */

router.patch("/:id", authenticate, async (req, res) => {
  const nc = await loadNc(req.params["id"] as string);
  const role = req.user!.role as UserRole;
  const isOwner = nc.ownerId === req.user!.id;
  if (!isOwner && !can(role, "AUDIT_NCS", "edit")) {
    throw httpError(403, "Forbidden — insufficient permissions");
  }

  const set: Record<string, unknown> = {};
  if (typeof req.body?.description === "string") {
    const description = req.body.description.trim();
    if (!description) throw httpError(422, "description cannot be empty");
    if (description.length > 2000) throw httpError(422, "description too long (≤2000)");
    set["description"] = description;
  }
  if (req.body?.category !== undefined) {
    set["category"] = req.body.category ? String(req.body.category).slice(0, 120) : null;
  }

  // Severity change is a reviewer-only act that re-stamps the SLA due date and
  // is separately evented with before/after (FRD-NCM-04).
  const requestedSeverity = req.body?.severity ? String(req.body.severity).toUpperCase() : null;
  const severityChanged = requestedSeverity !== null && requestedSeverity !== nc.severity;
  let newDueAt: Date | null = null;
  if (severityChanged) {
    if (!(SEVERITIES as readonly string[]).includes(requestedSeverity)) {
      throw httpError(400, "severity must be CRITICAL | MAJOR | MINOR");
    }
    if (!can(role, "AUDIT_REVIEW", "edit")) {
      throw httpError(403, "Severity can only be changed by reviewers (FRD-NCM-04)");
    }
    if ((NC_TERMINAL as readonly string[]).includes(nc.state)) {
      throw httpError(409, "Severity is frozen once the NC is terminal", { state: nc.state });
    }
    const sla = await getSeveritySla(requestedSeverity as Severity);
    newDueAt = new Date(nc.createdAt.getTime() + sla.capaDueHours * 3_600_000);
    set["severity"] = requestedSeverity;
    set["dueAt"] = newDueAt;
    if (Date.now() < newDueAt.getTime()) set["isOverdue"] = false;
  }

  if (Object.keys(set).length === 0) throw httpError(400, "Nothing to update");

  const actor = auditActor(req);
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(auditNonConformancesTable)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(auditNonConformancesTable.id, nc.id))
      .returning();
    if (severityChanged) {
      await appendAuditEvent(tx, {
        entityType: "NC",
        entityId: nc.id,
        auditId: nc.auditId,
        actorId: actor.id,
        actorRole: actor.role,
        kind: "CONFIG_CHANGE",
        beforeJson: { severity: nc.severity, dueAt: nc.dueAt.toISOString() },
        afterJson: { severity: requestedSeverity, dueAt: newDueAt!.toISOString() },
        reason:
          (typeof req.body?.reason === "string" && req.body.reason.trim()) ||
          `Severity changed ${nc.severity} → ${requestedSeverity}; due date re-stamped from the ${requestedSeverity} SLA`,
      });
    }
    return row!;
  });
  res.json({ success: true, data: updated });
});

/* ── Owner actions (FRD-NCM-02 / FRD-CAP-01/02) ────────────────────────────── */

router.post("/:id/start", authenticate, async (req, res) => {
  const nc = await loadNc(req.params["id"] as string);
  assertNcOwner(nc, req.user!.id);
  await db.transaction(async (tx) => {
    await applyNcTransition(tx, nc, "IN_PROGRESS", {
      actor: auditActor(req),
      auditId: nc.auditId,
      reason: "Owner started corrective work",
    });
  });
  res.json({ success: true, data: await loadNc(nc.id) });
});

/** Does resolving this NC require evidence (CAP-02)? */
async function resolutionNeedsEvidence(nc: {
  severity: string;
  questionId: string | null;
}): Promise<boolean> {
  if (nc.severity === "CRITICAL") return true;
  if (!nc.questionId) return false;
  const [question] = await db
    .select({ evidenceRule: auditQuestionsTable.evidenceRule })
    .from(auditQuestionsTable)
    .where(eq(auditQuestionsTable.id, nc.questionId));
  return question?.evidenceRule === "REQUIRED_ON_FAIL" || question?.evidenceRule === "ALWAYS_REQUIRED";
}

router.post("/:id/actions", authenticate, async (req, res) => {
  const nc = await loadNc(req.params["id"] as string);
  assertNcOwner(nc, req.user!.id);
  if (!["OPEN", "IN_PROGRESS", "REOPENED"].includes(nc.state)) {
    throw httpError(409, "Corrective actions can be added while the NC is open", { state: nc.state });
  }

  const description = String(req.body?.description ?? "").trim();
  if (!description) throw httpError(422, "description required");
  if (description.length > 2000) throw httpError(422, "description too long (≤2000)");
  const completedAt = req.body?.completedAt ? new Date(String(req.body.completedAt)) : null;
  if (completedAt && Number.isNaN(completedAt.getTime())) throw httpError(400, "Invalid completedAt");
  const resolve = req.body?.resolve === true;

  if (resolve && (await resolutionNeedsEvidence(nc))) {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditEvidenceTable)
      .where(and(eq(auditEvidenceTable.ncId, nc.id), inArray(auditEvidenceTable.kind, ["NC", "CAPA"])));
    if ((countRow?.count ?? 0) === 0) {
      throw httpError(422, "RESOLUTION_EVIDENCE_REQUIRED", {
        reason: "Attach at least one evidence photo/document before resolving this finding (CAP-02)",
      });
    }
  }

  const actor = auditActor(req);
  const action = await db.transaction(async (tx) => {
    let state = nc.state as NcState;
    if (state === "OPEN" || (state === "REOPENED" && resolve)) {
      await applyNcTransition(tx, { id: nc.id, state }, "IN_PROGRESS", {
        actor,
        auditId: nc.auditId,
        reason: state === "OPEN" ? "Corrective work started" : "Rework started after reopen",
      });
      state = "IN_PROGRESS";
    }
    const [row] = await tx
      .insert(auditCorrectiveActionsTable)
      .values({ id: newId(), ncId: nc.id, description, completedAt, submittedBy: req.user!.id })
      .returning();
    if (resolve) {
      await applyNcTransition(tx, { id: nc.id, state }, "RESOLVED", {
        actor,
        auditId: nc.auditId,
        reason: `Resolved: ${description.slice(0, 120)}`,
      });
    }
    return row!;
  });

  if (resolve) {
    for (const reviewer of await activeReviewers()) {
      await notify({
        userId: reviewer.id,
        title: `NC ${nc.ncNo} resolved — awaiting verification`,
        body: `${description.slice(0, 140)}`,
        type: "AUDIT_NC",
        link: ncLink(nc.id),
        entityType: "NC",
        entityId: nc.id,
      });
    }
  }
  res.status(201).json({ success: true, data: { action, nc: await loadNc(nc.id) } });
});

/* ── NC/CAPA evidence (FR-AD-05, CAP-02) ───────────────────────────────────── */

const evidenceJson = express.json({ limit: "40mb" });

router.post("/:id/evidence", authenticate, evidenceJson, async (req, res) => {
  const nc = await loadNc(req.params["id"] as string);
  const audit = await loadAuditOf(nc);
  const isOwner = nc.ownerId === req.user!.id;
  const isAssignee = audit.assigneeId === req.user!.id;
  if (!isOwner && !isAssignee) {
    throw httpError(403, "Only the NC owner or the audit assignee may attach evidence");
  }
  if ((NC_TERMINAL as readonly string[]).includes(nc.state)) {
    throw httpError(409, "Evidence is frozen once the NC is terminal", { state: nc.state });
  }

  const kind = String(req.body?.kind ?? "NC").toUpperCase();
  if (!["NC", "CAPA"].includes(kind)) throw httpError(400, "kind must be NC | CAPA");

  const parsedFile = parseDataUrl(req.body?.dataUrl);
  if (!parsedFile) throw httpError(400, "dataUrl must be a base64 image/pdf data URL");

  const policy = await getAttachmentPolicy(kind);
  if (!policy.allowedMime.includes(parsedFile.contentType)) {
    throw httpError(422, `File type ${parsedFile.contentType} not allowed for ${kind}`, { allowed: policy.allowedMime });
  }
  if (parsedFile.buffer.length > policy.maxSizeMb * 1024 * 1024) {
    throw httpError(422, `File exceeds the ${policy.maxSizeMb}MB limit for ${kind}`);
  }
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditEvidenceTable)
    .where(and(eq(auditEvidenceTable.ncId, nc.id), eq(auditEvidenceTable.kind, kind as never)));
  if ((countRow?.count ?? 0) >= policy.maxFiles) {
    throw httpError(422, `Attachment limit reached (${policy.maxFiles} for ${kind})`, { maxFiles: policy.maxFiles });
  }

  const correctiveActionId = req.body?.correctiveActionId ? String(req.body.correctiveActionId) : null;
  if (correctiveActionId) {
    const [action] = await db
      .select({ id: auditCorrectiveActionsTable.id })
      .from(auditCorrectiveActionsTable)
      .where(
        and(
          eq(auditCorrectiveActionsTable.id, correctiveActionId),
          eq(auditCorrectiveActionsTable.ncId, nc.id),
        ),
      );
    if (!action) throw httpError(404, "Corrective action not found on this NC");
  }

  const evidenceId = newId();
  const key = `audit-evidence/${nc.auditId}/${evidenceId}.${parsedFile.ext}`;
  const storageKey = await storeEvidence(key, parsedFile.buffer, parsedFile.contentType);

  let thumbStorageKey: string | null = null;
  const thumb = parseDataUrl(req.body?.thumbDataUrl);
  if (thumb && thumb.buffer.length <= 512 * 1024) {
    thumbStorageKey = await storeEvidence(
      `audit-evidence/${nc.auditId}/${evidenceId}.thumb.${thumb.ext}`,
      thumb.buffer,
      thumb.contentType,
    );
  }

  const geo = req.body?.geo as { lat?: number; lng?: number; accuracyM?: number } | undefined;
  const capturedAt = req.body?.capturedAt ? new Date(String(req.body.capturedAt)) : null;
  const [row] = await db
    .insert(auditEvidenceTable)
    .values({
      id: evidenceId,
      auditId: nc.auditId,
      kind: kind as never,
      ncId: nc.id,
      correctiveActionId,
      storageKey,
      thumbStorageKey,
      mime: parsedFile.contentType,
      sizeBytes: parsedFile.buffer.length,
      originalName: (req.body?.originalName as string) ?? null,
      geoLat: typeof geo?.lat === "number" ? geo.lat : null,
      geoLng: typeof geo?.lng === "number" ? geo.lng : null,
      geoAccuracyM: typeof geo?.accuracyM === "number" ? String(geo.accuracyM) : null,
      capturedAt: capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt : null,
      isLiveCapture: req.body?.isLiveCapture === true,
      uploadedBy: req.user!.id,
    })
    .returning();

  res.status(201).json({
    success: true,
    data: {
      ...row,
      url: await evidenceUrl(row!.storageKey),
      thumbUrl: row!.thumbStorageKey ? await evidenceUrl(row!.thumbStorageKey) : null,
    },
  });
});

/* ── Extension requests (FRD-CAP-04) ───────────────────────────────────────── */

router.post("/:id/extensions", authenticate, async (req, res) => {
  const nc = await loadNc(req.params["id"] as string);
  assertNcOwner(nc, req.user!.id);

  const requestedDueAt = req.body?.requestedDueAt ? new Date(String(req.body.requestedDueAt)) : null;
  if (!requestedDueAt || Number.isNaN(requestedDueAt.getTime())) {
    throw httpError(400, "requestedDueAt (date) required");
  }
  if (requestedDueAt.getTime() <= Date.now()) {
    throw httpError(422, "requestedDueAt must be in the future");
  }
  const justification = String(req.body?.justification ?? "").trim();
  if (!justification) throw httpError(422, "justification required");
  if (!["OPEN", "IN_PROGRESS"].includes(nc.state)) {
    throw httpError(409, "Extensions can be requested while the NC is In Progress", { state: nc.state });
  }

  const actor = auditActor(req);
  const request = await db.transaction(async (tx) => {
    let state = nc.state as NcState;
    if (state === "OPEN") {
      await applyNcTransition(tx, { id: nc.id, state }, "IN_PROGRESS", {
        actor,
        auditId: nc.auditId,
        reason: "Auto-started on extension request",
      });
      state = "IN_PROGRESS";
    }
    const [row] = await tx
      .insert(auditNcExtensionRequestsTable)
      .values({
        id: newId(),
        ncId: nc.id,
        requestedBy: req.user!.id,
        requestedDueAt,
        justification,
        status: "PENDING",
      })
      .returning();
    await applyNcTransition(tx, { id: nc.id, state }, "EXTENSION_REQUESTED", {
      actor,
      auditId: nc.auditId,
      reason: `Extension requested to ${requestedDueAt.toISOString()}: ${justification.slice(0, 120)}`,
    });
    return row!;
  });

  for (const reviewer of await activeReviewers()) {
    await notify({
      userId: reviewer.id,
      title: `Extension requested: ${nc.ncNo}`,
      body: `New due date ${requestedDueAt.toLocaleString("en-IN")} — ${justification.slice(0, 120)}`,
      type: "AUDIT_NC",
      link: ncLink(nc.id),
      entityType: "NC",
      entityId: nc.id,
    });
  }
  res.status(201).json({ success: true, data: request });
});

router.post(
  "/extensions/:eid/decide",
  authenticate,
  authorize("AUDIT_REVIEW", "edit"),
  async (req, res) => {
    const [request] = await db
      .select()
      .from(auditNcExtensionRequestsTable)
      .where(eq(auditNcExtensionRequestsTable.id, req.params["eid"] as string));
    if (!request) throw httpError(404, "Extension request not found");
    if (request.status !== "PENDING") {
      throw httpError(409, "Extension request already decided", { status: request.status });
    }
    if (typeof req.body?.approve !== "boolean") throw httpError(400, "approve (boolean) required");
    const approve = req.body.approve as boolean;
    const comment = req.body?.comment ? String(req.body.comment).slice(0, 500) : null;

    const nc = await loadNc(request.ncId);
    const actor = auditActor(req);
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(auditNcExtensionRequestsTable)
        .set({
          status: approve ? "APPROVED" : "DENIED",
          decidedBy: actor.id,
          decidedAt: now,
          decisionComment: comment,
        })
        .where(eq(auditNcExtensionRequestsTable.id, request.id));
      await applyNcTransition(tx, nc, "IN_PROGRESS", {
        actor,
        auditId: nc.auditId,
        reason: `Extension ${approve ? "approved" : "denied"}${comment ? `: ${comment}` : ""}`,
      });
      if (approve) {
        // New due date resets the whole SLA machinery: overdue flag, reminder/
        // breach dedupe stamps and the escalation chain start over.
        await tx
          .update(auditNonConformancesTable)
          .set({
            dueAt: request.requestedDueAt,
            isOverdue: false,
            escalationLevelSent: 0,
            dueSoonNotifiedAt: null,
            breachNotifiedAt: null,
            updatedAt: now,
          })
          .where(eq(auditNonConformancesTable.id, nc.id));
      }
    });

    await notify({
      userId: nc.ownerId,
      title: `Extension ${approve ? "approved" : "denied"}: ${nc.ncNo}`,
      body: approve
        ? `New due date: ${request.requestedDueAt.toLocaleString("en-IN")}.`
        : `The original due date ${nc.dueAt.toLocaleString("en-IN")} stands${comment ? ` — ${comment}` : ""}.`,
      type: "AUDIT_NC",
      link: ncLink(nc.id),
      entityType: "NC",
      entityId: nc.id,
    });
    res.json({ success: true, data: await loadNc(nc.id) });
  },
);

/* ── Reviewer verdicts (FRD-CAP-05, FRD-NCM-05, FRD-REV-04) ────────────────── */

router.post(
  "/:id/verify",
  authenticate,
  authorize("AUDIT_REVIEW", "edit"),
  async (req, res) => {
    const nc = await loadNc(req.params["id"] as string);
    const actor = auditActor(req);
    const now = new Date();

    await db.transaction(async (tx) => {
      await applyNcTransition(tx, nc, "VERIFIED", {
        actor,
        auditId: nc.auditId,
        reason: (typeof req.body?.comment === "string" && req.body.comment.trim()) || "Resolution verified",
      });
      await tx
        .update(auditNonConformancesTable)
        .set({ verifiedBy: actor.id, updatedAt: now })
        .where(eq(auditNonConformancesTable.id, nc.id));
      // Verified findings close immediately — VERIFIED exists as a trail state.
      await applyNcTransition(tx, { id: nc.id, state: "VERIFIED" }, "CLOSED", {
        actor,
        auditId: nc.auditId,
        reason: "Closed on verification",
      });
    });

    await notify({
      userId: nc.ownerId,
      title: `Finding ${nc.ncNo} verified & closed`,
      body: "Your resolution was verified by the review team.",
      type: "AUDIT_NC",
      link: ncLink(nc.id),
      entityType: "NC",
      entityId: nc.id,
    });
    await maybeAutoCloseAudit(nc.auditId, actor);
    res.json({ success: true, data: await loadNc(nc.id) });
  },
);

router.post(
  "/:id/reject",
  authenticate,
  authorize("AUDIT_REVIEW", "edit"),
  async (req, res) => {
    const nc = await loadNc(req.params["id"] as string);
    const comment = String(req.body?.comment ?? "").trim();
    if (!comment) throw httpError(422, "comment required to reject a resolution (FRD-CAP-05)");

    const actor = auditActor(req);
    await db.transaction(async (tx) => {
      await applyNcTransition(tx, nc, "REOPENED", {
        actor,
        auditId: nc.auditId,
        reason: `Resolution rejected: ${comment.slice(0, 200)}`,
      });
      await tx
        .update(auditNonConformancesTable)
        .set({ reopenCount: nc.reopenCount + 1, updatedAt: new Date() })
        .where(eq(auditNonConformancesTable.id, nc.id));
    });

    await notify({
      userId: nc.ownerId,
      title: `Finding ${nc.ncNo} reopened`,
      body: `Resolution rejected: ${comment.slice(0, 140)}`,
      type: "AUDIT_NC",
      link: ncLink(nc.id),
      entityType: "NC",
      entityId: nc.id,
    });
    res.json({ success: true, data: await loadNc(nc.id) });
  },
);

router.post(
  "/:id/waive",
  authenticate,
  authorize("AUDIT_REVIEW", "edit"),
  async (req, res) => {
    const nc = await loadNc(req.params["id"] as string);
    const justification = String(req.body?.justification ?? "").trim();
    if (!justification) throw httpError(422, "justification required to waive a finding");

    const actor = auditActor(req);
    await db.transaction(async (tx) => {
      let state = nc.state as NcState;
      if (state === "EXTENSION_REQUESTED") {
        // WAIVED is only reachable from OPEN/IN_PROGRESS in the map — step back
        // to IN_PROGRESS first. RESOLVED (and terminal) states 409 below.
        await applyNcTransition(tx, { id: nc.id, state }, "IN_PROGRESS", {
          actor,
          auditId: nc.auditId,
          reason: "Extension request superseded by waiver",
        });
        state = "IN_PROGRESS";
      }
      await applyNcTransition(tx, { id: nc.id, state }, "WAIVED", {
        actor,
        auditId: nc.auditId,
        reason: `Waived: ${justification.slice(0, 200)}`,
      });
      await tx
        .update(auditNonConformancesTable)
        .set({ waiverReason: justification, waivedBy: actor.id, updatedAt: new Date() })
        .where(eq(auditNonConformancesTable.id, nc.id));
    });

    await notify({
      userId: nc.ownerId,
      title: `Finding ${nc.ncNo} waived`,
      body: justification.slice(0, 140),
      type: "AUDIT_NC",
      link: ncLink(nc.id),
      entityType: "NC",
      entityId: nc.id,
    });
    await maybeAutoCloseAudit(nc.auditId, actor);
    res.json({ success: true, data: await loadNc(nc.id) });
  },
);

export { router as auditNcsRouter };
