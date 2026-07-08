/**
 * Audit & Inspection — shared domain services: numbering allocation, module
 * settings, actor helpers. Grows with later phases (assignee resolution,
 * submit gate, auto-NC evaluation, notification dispatch).
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Request } from "express";
import {
  db,
  auditsTable,
  auditNumberingSchemesTable,
  auditAppSettingsTable,
  auditAttachmentPoliciesTable,
  auditEvidenceTable,
  auditNonConformancesTable,
  auditQuestionsTable,
  auditResponsesTable,
  auditSectionsTable,
  auditSeveritySlasTable,
  usersTable,
} from "@workspace/db";
import { putObject, getObjectUrl, isStorageConfigured } from "@workspace/storage";
import { httpError } from "./authz.js";
import { newId } from "./id.js";
import { notify } from "./notification-service.js";
import { appendAuditEvent, type DbLike } from "./audit-events.js";
import { applyAuditTransition, type TransitionActor } from "./audit-state.js";
import { resolveMultiplier, NON_SCORED_TYPES, type RatingScaleSnapshot, type ScoringQuestion } from "./audit-scoring.js";

export type NumberedObjectType = "AUDIT" | "NC" | "REPORT";

/**
 * Allocate the next human-readable number for an object type (FR-AD-06),
 * e.g. UNI-AUD-4501. The UPDATE … RETURNING row-lock serializes concurrent
 * allocations; call inside the same transaction as the insert so an aborted
 * insert doesn't burn visible numbers (gaps only on rolled-back txs, which is
 * acceptable and matches sequence semantics).
 */
export async function allocateNumber(
  tx: DbLike,
  objectType: NumberedObjectType,
): Promise<string> {
  const [scheme] = await tx
    .update(auditNumberingSchemesTable)
    .set({
      nextSeq: sql`${auditNumberingSchemesTable.nextSeq} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(auditNumberingSchemesTable.objectType, objectType))
    .returning();
  if (!scheme) {
    throw httpError(500, `No numbering scheme configured for ${objectType}`);
  }
  const seq = scheme.nextSeq - 1; // returning reflects the post-increment value
  const seqStr = scheme.padWidth
    ? String(seq).padStart(scheme.padWidth, "0")
    : String(seq);
  return (scheme.pattern || "{prefix}-{seq}")
    .replace("{prefix}", scheme.prefix)
    .replace("{seq}", seqStr);
}

/** Read a module setting with a typed fallback (audit_app_settings). */
export async function getAuditSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db
    .select()
    .from(auditAppSettingsTable)
    .where(eq(auditAppSettingsTable.key, key));
  if (!row || row.valueJson === null || row.valueJson === undefined) return fallback;
  return row.valueJson as T;
}

/** The event-trail actor for a request (route handlers always have req.user). */
export function auditActor(req: Request): TransitionActor {
  return { id: req.user?.id ?? null, role: req.user?.role ?? null };
}

/** The auditee responsible for a target: the property's active Unit Lead. */
export async function resolveAuditeeOfTarget(propertyId: string): Promise<string | null> {
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.role, "UNIT_LEAD"),
        eq(usersTable.propertyId, propertyId),
        eq(usersTable.isActive, true),
      ),
    )
    .limit(1);
  return user?.id ?? null;
}

export interface SeveritySla {
  capaDueHours: number;
  reminderLeadHours: number;
  escalationChainJson: { trigger: string; pct?: number; audience: string }[];
}

/** Severity → SLA row (FR-AD-03). Precedence template > org node > global. */
export async function getSeveritySla(
  severity: "CRITICAL" | "MAJOR" | "MINOR",
  scope?: { templateId?: string | null },
): Promise<SeveritySla> {
  const rows = await db
    .select()
    .from(auditSeveritySlasTable)
    .where(eq(auditSeveritySlasTable.severity, severity));
  const byTemplate = scope?.templateId ? rows.find((r) => r.templateId === scope.templateId) : undefined;
  const global = rows.find((r) => !r.templateId && !r.scopeLevel);
  const chosen = byTemplate ?? global ?? rows[0];
  if (!chosen) {
    // Fail-safe defaults matching spec §6.2 if config is missing.
    const fallback = { CRITICAL: 48, MAJOR: 168, MINOR: 720 }[severity];
    return { capaDueHours: fallback, reminderLeadHours: 12, escalationChainJson: [] };
  }
  return {
    capaDueHours: chosen.capaDueHours,
    reminderLeadHours: chosen.reminderLeadHours,
    escalationChainJson: (chosen.escalationChainJson ?? []) as SeveritySla["escalationChainJson"],
  };
}

export interface AutoNcRule {
  onAnswers?: string[];
  belowMultiplierPct?: number;
  severity: "CRITICAL" | "MAJOR" | "MINOR";
  ownerRule?: string;
}

/**
 * Does this answer trip the question's auto-NC rule (FRD-EXE-07)? Triggers on
 * matching answer values/option ids, a below-threshold multiplier, or an
 * out-of-range NUMERIC answer when a rule exists.
 */
export function evaluateAutoNc(
  question: {
    type: string;
    autoNcJson: unknown;
    optionsJson?: unknown;
    numericMin?: string | number | null;
    numericMax?: string | number | null;
    weight: number;
  },
  answerJson: unknown,
  snapshot: RatingScaleSnapshot | null,
): { triggered: boolean; rule: AutoNcRule | null } {
  const rule = (question.autoNcJson ?? null) as AutoNcRule | null;
  if (!rule || !rule.severity) return { triggered: false, rule: null };

  const a = (answerJson ?? {}) as Record<string, unknown>;
  const answered: string[] = [];
  if (a["value"] != null) answered.push(String(a["value"]).toUpperCase());
  if (a["optionId"] != null) answered.push(String(a["optionId"]));
  if (Array.isArray(a["optionIds"])) answered.push(...(a["optionIds"] as unknown[]).map(String));

  if (rule.onAnswers?.some((trigger) => answered.includes(trigger))) {
    return { triggered: true, rule };
  }
  const scoringQuestion: ScoringQuestion = {
    id: "",
    sectionId: "",
    mandatory: false,
    type: question.type,
    weight: question.weight,
    optionsJson: question.optionsJson as ScoringQuestion["optionsJson"],
    numericMin: question.numericMin != null ? Number(question.numericMin) : null,
    numericMax: question.numericMax != null ? Number(question.numericMax) : null,
  };
  const resolved = resolveMultiplier(scoringQuestion, answerJson, snapshot);
  if (!resolved.isNa && resolved.multiplierPct != null) {
    if (rule.belowMultiplierPct != null && resolved.multiplierPct < rule.belowMultiplierPct) {
      return { triggered: true, rule };
    }
    // NUMERIC out-of-range scores 0 — a rule on a numeric question means
    // "raise on out-of-range" (FRD-TAU-03 AC).
    if (question.type === "NUMERIC" && resolved.multiplierPct === 0) {
      return { triggered: true, rule };
    }
  }
  return { triggered: false, rule };
}

export interface CreateNcInput {
  auditId: string;
  propertyId: string;
  templateId?: string | null;
  responseId?: string | null;
  questionId?: string | null;
  severity: "CRITICAL" | "MAJOR" | "MINOR";
  category?: string | null;
  description: string;
  ownerId?: string | null;
  source: "AUTO" | "MANUAL" | "REVIEW";
  actor: TransitionActor;
}

/** Raise an NC (FRD-NCM-01): number it, stamp SLA due date, event it. */
export async function createNonConformance(
  tx: DbLike,
  input: CreateNcInput,
): Promise<typeof auditNonConformancesTable.$inferSelect> {
  const ownerId = input.ownerId ?? (await resolveAuditeeOfTarget(input.propertyId));
  if (!ownerId) {
    throw httpError(422, "No owner resolvable for this NC — the target property has no Unit Lead; pass ownerId explicitly");
  }
  const sla = await getSeveritySla(input.severity, { templateId: input.templateId });
  const ncNo = await allocateNumber(tx, "NC");
  const [nc] = await tx
    .insert(auditNonConformancesTable)
    .values({
      id: newId(),
      ncNo,
      auditId: input.auditId,
      responseId: input.responseId ?? null,
      questionId: input.questionId ?? null,
      severity: input.severity,
      category: input.category ?? null,
      description: input.description,
      ownerId,
      dueAt: new Date(Date.now() + sla.capaDueHours * 3_600_000),
      state: "OPEN",
      source: input.source,
      createdBy: input.actor.id,
    })
    .returning();
  await appendAuditEvent(tx, {
    entityType: "NC",
    entityId: nc!.id,
    auditId: input.auditId,
    actorId: input.actor.id,
    actorRole: input.actor.role ?? null,
    kind: "STATE_CHANGE",
    toState: "OPEN",
    reason: `${input.source === "AUTO" ? "Auto-raised" : "Raised"}: ${input.description.slice(0, 120)}`,
    afterJson: { ncNo, severity: input.severity, ownerId },
  });
  return nc!;
}

export interface SubmitBlocker {
  kind: "UNANSWERED_MANDATORY" | "MISSING_EVIDENCE" | "LIVE_PHOTO_REQUIRED" | "UNRESOLVED_SAVE";
  questionId?: string;
  sectionId?: string;
  prompt?: string;
}

/**
 * The submission gate (FRD-EXE-11/13): named, tappable list of everything
 * blocking submit — unanswered mandatory questions, missing mandatory
 * evidence, and the live geotagged submission photo (D-9).
 */
export async function computeSubmitBlockers(audit: {
  id: string;
  templateVersionId: string;
  subsetJson: unknown;
  startedAt: Date | null;
}): Promise<SubmitBlocker[]> {
  const blockers: SubmitBlocker[] = [];
  const { questions } = await loadExecutionQuestions(audit.templateVersionId, audit.subsetJson, audit.id);
  const responses = await db
    .select()
    .from(auditResponsesTable)
    .where(eq(auditResponsesTable.auditId, audit.id));
  const responseByQ = new Map(responses.map((r) => [r.questionId, r]));
  const evidence = await db
    .select()
    .from(auditEvidenceTable)
    .where(eq(auditEvidenceTable.auditId, audit.id));

  for (const q of questions) {
    if (q.type === "INSTRUCTION") continue;
    const response = responseByQ.get(q.id);
    const hasAnswer =
      response != null && (response.isNa || (response.answerJson != null && response.answerJson !== ""));
    if (q.mandatory && !hasAnswer) {
      blockers.push({ kind: "UNANSWERED_MANDATORY", questionId: q.id, sectionId: q.sectionId, prompt: q.prompt });
      continue;
    }
    if (!hasAnswer) continue;

    const rowEvidence = evidence.filter((e) => e.responseId === response!.id);
    const needsEvidence =
      q.evidenceRule === "ALWAYS_REQUIRED" ||
      (q.evidenceRule === "REQUIRED_ON_FAIL" && isFailingAnswer(q, response!));
    if (needsEvidence && rowEvidence.length === 0) {
      blockers.push({ kind: "MISSING_EVIDENCE", questionId: q.id, sectionId: q.sectionId, prompt: q.prompt });
    }
  }

  // Live geotagged submission photo (FRD-EXE-13): captured live, with GPS,
  // during the current in-progress session.
  const proof = evidence
    .filter(
      (e) =>
        e.kind === "SUBMISSION_PROOF" &&
        e.isLiveCapture &&
        e.geoLat != null &&
        e.geoLng != null &&
        (!audit.startedAt || e.createdAt >= audit.startedAt),
    )
    .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
  if (proof.length === 0) {
    blockers.push({ kind: "LIVE_PHOTO_REQUIRED" });
  }
  return blockers;
}

function isFailingAnswer(
  q: { type: string; optionsJson: unknown; numericMin: string | null; numericMax: string | null; weight: number },
  response: { answerJson: unknown; multiplierPct: string | null; isNa: boolean },
): boolean {
  if (response.isNa) return false;
  const pct = response.multiplierPct != null ? Number(response.multiplierPct) : null;
  return pct != null && pct < 50; // "fail" = bottom half of the scale
}

/**
 * The effective question set for an audit run: version content filtered to
 * the schedule's subset (FRD-SCH-01) plus this audit's ad-hoc items (X-7).
 */
export async function loadExecutionQuestions(
  templateVersionId: string,
  subsetJson: unknown,
  auditId: string,
): Promise<{
  sections: (typeof auditSectionsTable.$inferSelect)[];
  questions: (typeof auditQuestionsTable.$inferSelect)[];
}> {
  const sections = await db
    .select()
    .from(auditSectionsTable)
    .where(eq(auditSectionsTable.templateVersionId, templateVersionId))
    .orderBy(asc(auditSectionsTable.orderIndex));
  const sectionIds = sections.map((s) => s.id);
  let questions = sectionIds.length
    ? await db
        .select()
        .from(auditQuestionsTable)
        .where(
          and(
            inArray(auditQuestionsTable.sectionId, sectionIds),
            isNull(auditQuestionsTable.auditId),
          ),
        )
        .orderBy(asc(auditQuestionsTable.orderIndex))
    : [];

  const subset = (subsetJson ?? null) as { sectionIds?: string[]; questionIds?: string[] } | null;
  if (subset?.sectionIds?.length) {
    questions = questions.filter((q) => subset.sectionIds!.includes(q.sectionId));
  }
  if (subset?.questionIds?.length) {
    questions = questions.filter((q) => subset.questionIds!.includes(q.id));
  }

  const adHoc = await db
    .select()
    .from(auditQuestionsTable)
    .where(eq(auditQuestionsTable.auditId, auditId))
    .orderBy(asc(auditQuestionsTable.orderIndex));
  questions = [...questions, ...adHoc];

  const usedSectionIds = new Set(questions.map((q) => q.sectionId));
  return { sections: sections.filter((s) => usedSectionIds.has(s.id)), questions };
}

/** Attachment policy for a level, with permissive fallbacks (FR-AD-05). */
export async function getAttachmentPolicy(level: string): Promise<{
  maxFiles: number;
  maxSizeMb: number;
  allowedMime: string[];
}> {
  const [row] = await db
    .select()
    .from(auditAttachmentPoliciesTable)
    .where(eq(auditAttachmentPoliciesTable.level, level));
  return {
    maxFiles: row?.maxFiles ?? 5,
    maxSizeMb: row?.maxSizeMb ?? 25,
    allowedMime: (row?.allowedMimeJson as string[] | undefined) ?? ["image/jpeg", "image/png", "image/webp"],
  };
}

/* ── Evidence storage (FRD-EXE-06/13, FR-AD-05) ────────────────────────────── */

export const MAX_INLINE_FALLBACK_BYTES = 2 * 1024 * 1024;

export const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function parseDataUrl(
  dataUrl: unknown,
): { buffer: Buffer; contentType: string; ext: string } | null {
  if (typeof dataUrl !== "string") return null;
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!m) return null;
  const contentType = m[1]!.toLowerCase();
  const ext = IMAGE_EXT[contentType];
  if (!ext) return null;
  try {
    const buffer = Buffer.from(m[2]!, "base64");
    return buffer.length ? { buffer, contentType, ext } : null;
  } catch {
    return null;
  }
}

/**
 * Store evidence bytes. Without S3 config (local dev) small files fall back to
 * an inline data-URL "key" so the field flow stays fully testable; production
 * always has storage configured (deploy-time requirement).
 */
export async function storeEvidence(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  if (isStorageConfigured()) {
    await putObject(key, buffer, contentType);
    return key;
  }
  if (buffer.length > MAX_INLINE_FALLBACK_BYTES) {
    throw httpError(503, "File storage is not configured and the file exceeds the dev inline limit (2MB)");
  }
  return `inline:data:${contentType};base64,${buffer.toString("base64")}`;
}

export async function evidenceUrl(storageKey: string): Promise<string | null> {
  if (storageKey.startsWith("inline:")) return storageKey.slice("inline:".length);
  if (!isStorageConfigured()) return null;
  return getObjectUrl(storageKey, 3600);
}

/* ── Audit auto-close (FRD-REV-04) ─────────────────────────────────────────── */

const NC_TERMINAL_STATES = ["VERIFIED", "CLOSED", "WAIVED"] as const;

/**
 * Close an APPROVED audit once every NC on it is terminal (Verified/Closed/
 * Waived). Called synchronously after NC verify/waive, and by the safety-net
 * job (which additionally respects the `auto_close_days` setting). Returns
 * true when the audit was closed by this call.
 */
export async function maybeAutoCloseAudit(
  auditId: string,
  actor: TransitionActor,
): Promise<boolean> {
  const [audit] = await db.select().from(auditsTable).where(eq(auditsTable.id, auditId));
  if (!audit || audit.state !== "APPROVED") return false;

  const ncs = await db
    .select({
      ncNo: auditNonConformancesTable.ncNo,
      state: auditNonConformancesTable.state,
    })
    .from(auditNonConformancesTable)
    .where(eq(auditNonConformancesTable.auditId, auditId));
  if (ncs.some((nc) => !(NC_TERMINAL_STATES as readonly string[]).includes(nc.state))) {
    return false;
  }

  const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
  const reason = ncs.length
    ? `All findings resolved: ${ncs.map((nc) => `${nc.ncNo} (${label(nc.state)})`).join(", ")}`
    : "No open findings";

  await db.transaction(async (tx) => {
    await applyAuditTransition(tx, audit, "CLOSED", { actor, reason });
  });

  if (audit.assigneeId) {
    await notify({
      userId: audit.assigneeId,
      title: `Audit ${audit.ticketNo} closed`,
      body: reason,
      type: "AUDIT",
      link: `/audits/${audit.id}`,
      entityType: "AUDIT",
      entityId: audit.id,
    });
  }
  return true;
}

export { NON_SCORED_TYPES };

/** Default module settings, applied by the seed and used as code fallbacks. */
export const AUDIT_SETTING_DEFAULTS = {
  na_counts_against: false, // D-1
  publish_co_approval_required: false, // FR-TM-04
  lookahead_days: 7, // FR-AD-07 recurrence look-ahead
  auto_close_days: 0, // 0 = close as soon as all NCs terminal
  adhoc_default_weight: 3, // X-7: fixed, not auditor-editable
  manual_nudge_per_hour: 1, // FRD-NTF-04 rate limit
  report_share_ttl_hours: 72, // D-5 expiring links
  org_timezone: "Asia/Kolkata", // NFR-07 rendering timezone
} as const;
