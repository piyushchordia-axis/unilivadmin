/**
 * Audit & Inspection — audit register & work queues (FA-07) + detail (FA-08).
 * P1 scope: scoped register list, "My audits" queue, detail with Activity
 * events. State actions, execution grid, responses, evidence and submit land
 * in P3; one-off creation in P2/P3.
 *
 * Every list composes scopeAuditsCondition() so scoped-out rows are absent
 * everywhere including counts (FRD-ACC-05 AC).
 */
import express, { Router, type IRouter } from "express";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  auditsTable,
  auditBankCandidatesTable,
  auditCommentsTable,
  auditEventsTable,
  auditEvidenceTable,
  auditNonConformancesTable,
  auditQuestionsTable,
  auditReportsTable,
  auditResponsesTable,
  auditTemplatesTable,
  auditTemplateVersionsTable,
  auditPerformanceBandsTable,
  propertiesTable,
  roomsTable,
  usersTable,
} from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";
import { httpError } from "../lib/authz.js";
import { getPagination, buildMeta } from "../lib/paginate.js";
import { newId } from "../lib/id.js";
import { notify } from "../lib/notification-service.js";
import { appendAuditEvent, recordAuditEvent } from "../lib/audit-events.js";
import { applyAuditTransition, canTransition, AUDIT_TRANSITIONS, type AuditState } from "../lib/audit-state.js";
import {
  resolveAuditAccess,
  scopeAuditsCondition,
  canView,
  canConduct,
  visibleAuditTypes,
  conductableAuditTypes,
  conductablePropertyIds,
  type AuditType,
} from "../lib/audit-access.js";
import {
  auditActor,
  allocateNumber,
  getAuditSetting,
  getAttachmentPolicy,
  computeSubmitBlockers,
  createNonConformance,
  evaluateAutoNc,
  evidenceUrl,
  loadExecutionQuestions,
  parseDataUrl,
  resolveAuditeeOfTarget,
  storeEvidence,
  AUDIT_SETTING_DEFAULTS,
} from "../lib/audit-service.js";
import { scoreAudit, resolveMultiplier, type RatingScaleSnapshot } from "../lib/audit-scoring.js";
import { resolveAssignee, type AssigneeRule } from "../lib/audit-jobs.js";

const router: IRouter = Router();

const ACTIVE_STATES = ["SCHEDULED", "IN_PROGRESS", "PAUSED", "REJECTED"] as const;
const COMPLETED_STATES = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "CLOSED"] as const;

async function enrich(rows: (typeof auditsTable.$inferSelect)[]) {
  if (rows.length === 0) return [];
  const propertyIds = [...new Set(rows.map((r) => r.propertyId))];
  const assigneeIds = [...new Set(rows.map((r) => r.assigneeId).filter(Boolean))] as string[];
  const roomIds = [...new Set(rows.map((r) => r.roomId).filter(Boolean))] as string[];

  const props = propertyIds.length
    ? await db.select({ id: propertiesTable.id, name: propertiesTable.name, city: propertiesTable.city }).from(propertiesTable).where(inArray(propertiesTable.id, propertyIds))
    : [];
  const users = assigneeIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name, role: usersTable.role }).from(usersTable).where(inArray(usersTable.id, assigneeIds))
    : [];
  const rooms = roomIds.length
    ? await db.select({ id: roomsTable.id, number: roomsTable.number }).from(roomsTable).where(inArray(roomsTable.id, roomIds))
    : [];

  const propMap = new Map(props.map((p) => [p.id, p]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));

  return rows.map((r) => ({
    ...r,
    propertyName: propMap.get(r.propertyId)?.name ?? null,
    propertyCity: propMap.get(r.propertyId)?.city ?? null,
    roomNumber: r.roomId ? roomMap.get(r.roomId)?.number ?? null : null,
    assigneeName: r.assigneeId ? userMap.get(r.assigneeId)?.name ?? null : null,
    assigneeRole: r.assigneeId ? userMap.get(r.assigneeId)?.role ?? null : null,
  }));
}

/** Register (FRD-REG-01/02/03): server pagination, segments, filters. */
router.get(
  "/",
  authenticate,
  authorize("AUDIT_REGISTER", "view"),
  async (req, res) => {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const q = req.query as Record<string, string | undefined>;
    const access = await resolveAuditAccess(req.user!);

    const conditions = [];
    const scope = scopeAuditsCondition(access);
    if (scope) conditions.push(scope);

    const segment = q["segment"];
    if (segment === "active") conditions.push(inArray(auditsTable.state, [...ACTIVE_STATES]));
    if (segment === "completed") conditions.push(inArray(auditsTable.state, [...COMPLETED_STATES]));
    if (q["state"]) {
      const states = q["state"].split(",").filter(Boolean);
      if (states.length) conditions.push(inArray(auditsTable.state, states as never[]));
    }
    if (q["auditType"]) conditions.push(eq(auditsTable.auditType, q["auditType"] as AuditType));
    if (q["propertyId"]) conditions.push(eq(auditsTable.propertyId, q["propertyId"]));
    if (q["assigneeId"]) conditions.push(eq(auditsTable.assigneeId, q["assigneeId"]));
    if (q["overdue"] === "true") conditions.push(eq(auditsTable.isOverdue, true));
    if (q["q"]) {
      const like = "%" + q["q"] + "%";
      conditions.push(
        sql`(${auditsTable.ticketNo} ILIKE ${like} OR ${auditsTable.title} ILIKE ${like})`,
      );
    }
    if (q["from"]) conditions.push(sql`${auditsTable.createdAt} >= ${new Date(q["from"])}`);
    if (q["to"]) {
      const to = new Date(q["to"]);
      to.setHours(23, 59, 59, 999);
      conditions.push(sql`${auditsTable.createdAt} <= ${to}`);
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const sortCol = q["sort"] === "dueAt" ? auditsTable.dueAt : auditsTable.createdAt;
    const order = q["dir"] === "asc" ? asc(sortCol) : desc(sortCol);

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditsTable)
      .where(where);
    const rows = await db
      .select()
      .from(auditsTable)
      .where(where)
      .orderBy(order)
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: await enrich(rows),
      meta: buildMeta(countRow?.count ?? 0, page, limit),
    });
  },
);

/** Audit types the caller may see — drives type pickers and dashboard tabs. */
router.get(
  "/visible-types",
  authenticate,
  authorize("AUDIT_REGISTER", "view"),
  async (req, res) => {
    const access = await resolveAuditAccess(req.user!);
    res.json({ success: true, data: visibleAuditTypes(access) });
  },
);

/**
 * One-off / ad-hoc audit creation (FRD-SCH-01). This is the ONLY path for CX
 * audits — they are ad-hoc "surprise" audits, never scheduler-generated (C-3).
 * The caller must have conduct access (AUDITOR/ADMin grant, or global admin)
 * for the audit's type at the target property.
 */
const oneOffSchema = z.object({
  templateVersionId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  targetType: z.enum(["PROPERTY", "ROOM"]),
  propertyId: z.string().nullish(),
  roomId: z.string().nullish(),
  assigneeId: z.string().nullish(),
  assigneeRule: z.enum(["UNIT_LEAD", "CLUSTER_MANAGER"]).nullish(),
  scheduledFor: z.coerce.date().nullish(),
  dueAt: z.coerce.date().nullish(),
  reminderOffsetMinutes: z.number().int().min(0).max(600).nullish(),
  subsetJson: z
    .object({ sectionIds: z.array(z.string()).optional(), questionIds: z.array(z.string()).optional() })
    .nullish(),
});

router.post(
  "/",
  authenticate,
  authorize("AUDIT_EXECUTION", "create"),
  async (req, res) => {
    const parsed = oneOffSchema.safeParse(req.body);
    if (!parsed.success) throw httpError(400, "Invalid audit", parsed.error.flatten());
    const data = parsed.data;

    // Resolve the pinned published version + its template (audit type, target type).
    const [version] = await db
      .select()
      .from(auditTemplateVersionsTable)
      .where(eq(auditTemplateVersionsTable.id, data.templateVersionId));
    if (!version) throw httpError(404, "Template version not found");
    if (version.lifecycle !== "PUBLISHED") {
      throw httpError(422, "Audits can only run a PUBLISHED template version");
    }
    const [template] = await db
      .select()
      .from(auditTemplatesTable)
      .where(eq(auditTemplatesTable.id, version.templateId));
    if (!template) throw httpError(404, "Template not found");

    // Resolve + validate the target, deriving the parent property for scoping.
    let propertyId: string;
    let roomId: string | null = null;
    if (template.targetType === "ROOM") {
      if (!data.roomId) throw httpError(422, "This template audits rooms — roomId is required");
      const [room] = await db
        .select({ id: roomsTable.id, propertyId: roomsTable.propertyId })
        .from(roomsTable)
        .where(eq(roomsTable.id, data.roomId));
      if (!room) throw httpError(404, "Room not found");
      propertyId = room.propertyId;
      roomId = room.id;
    } else {
      if (!data.propertyId) throw httpError(422, "propertyId is required");
      const [prop] = await db
        .select({ id: propertiesTable.id })
        .from(propertiesTable)
        .where(eq(propertiesTable.id, data.propertyId));
      if (!prop) throw httpError(404, "Property not found");
      propertyId = prop.id;
    }

    // Conduct-access gate (FRD-ACC-05): the caller must be allowed to conduct
    // this audit type at this property. CX flows through here for the CX team.
    const access = await resolveAuditAccess(req.user!);
    if (!canConduct(access, template.auditType as AuditType, propertyId)) {
      await recordAuditEvent({
        entityType: "AUDIT",
        entityId: "new",
        actorId: req.user!.id,
        actorRole: req.user!.role,
        kind: "DENIED_ATTEMPT",
        reason: `Attempt to create ${template.auditType} audit at ${propertyId} without conduct access`,
      });
      throw httpError(403, `You cannot conduct ${template.auditType} audits at this property`);
    }

    // Resolve the assignee: explicit user, a role-at-target rule, or the creator.
    let assigneeId: string | null = data.assigneeId ?? null;
    if (!assigneeId && data.assigneeRule) {
      const rule: AssigneeRule = { kind: "ROLE_AT_TARGET", role: data.assigneeRule };
      assigneeId = await resolveAssignee(rule, propertyId);
    }
    if (!assigneeId) assigneeId = req.user!.id; // self-assign ad-hoc audits by default
    const [assignee] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, assigneeId));
    if (!assignee) throw httpError(404, "Assignee not found");

    const now = new Date();
    const scheduledFor = data.scheduledFor ?? now;
    // Ad-hoc audits are actionable immediately: SCHEDULED (not DRAFT/Upcoming).
    const actor = auditActor(req);
    const created = await db.transaction(async (tx) => {
      const ticketNo = await allocateNumber(tx, "AUDIT");
      const [audit] = await tx
        .insert(auditsTable)
        .values({
          id: newId(),
          ticketNo,
          auditType: template.auditType,
          templateVersionId: version.id,
          scheduleId: null,
          occurrenceKey: null,
          targetType: template.targetType,
          propertyId,
          roomId,
          title: data.title,
          description: data.description ?? null,
          state: "SCHEDULED",
          assigneeId,
          scheduledFor,
          dueAt: data.dueAt ?? scheduledFor,
          reminderOffsetMinutes: data.reminderOffsetMinutes ?? null,
          subsetJson: data.subsetJson ?? null,
          reviewRequired: version.reviewRequired,
          createdBy: actor.id,
        })
        .returning();
      await appendAuditEvent(tx, {
        entityType: "AUDIT",
        entityId: audit!.id,
        auditId: audit!.id,
        actorId: actor.id,
        actorRole: actor.role,
        kind: "STATE_CHANGE",
        toState: "SCHEDULED",
        reason: `Ad-hoc ${template.auditType} audit created`,
      });
      return audit!;
    });

    // Notify the assignee if it isn't the creator.
    if (created.assigneeId && created.assigneeId !== actor.id) {
      await notify({
        userId: created.assigneeId,
        title: `Audit assigned: ${created.ticketNo}`,
        body: `${created.title} — ${template.auditType} audit`,
        type: "AUDIT",
        link: `/audits/${created.id}`,
        entityType: "AUDIT",
        entityId: created.id,
      });
    }

    res.status(201).json({ success: true, data: created });
  },
);

/**
 * Read helpers backing the create-audit form (FRD-SCH-01). These are gated on
 * AUDIT_EXECUTION so a conductor (e.g. the CX team) who has no template/property
 * module permission can still pick what to audit — the results are filtered to
 * exactly what the caller may conduct (resolveAuditAccess), so this exposes
 * nothing beyond their conduct scope.
 */
router.get(
  "/conductable-templates",
  authenticate,
  authorize("AUDIT_EXECUTION", "create"),
  async (req, res) => {
    const access = await resolveAuditAccess(req.user!);
    const types = conductableAuditTypes(access);
    if (types.length === 0) {
      res.json({ success: true, data: [] });
      return;
    }
    // Latest PUBLISHED version per template, for the caller's conductable types.
    const templates = await db
      .select()
      .from(auditTemplatesTable)
      .where(and(inArray(auditTemplatesTable.auditType, types), isNull(auditTemplatesTable.archivedAt)));
    const data = [];
    for (const t of templates) {
      const [latest] = await db
        .select({ id: auditTemplateVersionsTable.id, versionNo: auditTemplateVersionsTable.versionNo })
        .from(auditTemplateVersionsTable)
        .where(and(eq(auditTemplateVersionsTable.templateId, t.id), eq(auditTemplateVersionsTable.lifecycle, "PUBLISHED")))
        .orderBy(desc(auditTemplateVersionsTable.versionNo))
        .limit(1);
      if (!latest) continue; // no published version → not runnable
      data.push({
        id: t.id,
        name: t.name,
        auditType: t.auditType,
        targetType: t.targetType,
        category: t.category,
        latestVersionId: latest.id,
        latestVersionNo: latest.versionNo,
      });
    }
    res.json({ success: true, data });
  },
);

/** Properties where the caller may conduct the given audit type. */
router.get(
  "/target-properties",
  authenticate,
  authorize("AUDIT_EXECUTION", "create"),
  async (req, res) => {
    const auditType = String(req.query["auditType"] ?? "") as AuditType;
    if (!(["UL", "CM", "CX"] as string[]).includes(auditType)) {
      throw httpError(400, "auditType query param required (UL|CM|CX)");
    }
    const access = await resolveAuditAccess(req.user!);
    const allowed = conductablePropertyIds(access, auditType);
    if (allowed !== null && allowed.length === 0) {
      res.json({ success: true, data: [] });
      return;
    }
    const rows = await db
      .select({ id: propertiesTable.id, name: propertiesTable.name, city: propertiesTable.city })
      .from(propertiesTable)
      .where(
        allowed === null
          ? eq(propertiesTable.status, "ACTIVE")
          : and(eq(propertiesTable.status, "ACTIVE"), inArray(propertiesTable.id, allowed)),
      )
      .orderBy(propertiesTable.name);
    res.json({ success: true, data: rows });
  },
);

/**
 * Version content (sections + questions) for the create-form subset picker,
 * accessible to conductors of the version's audit type. Read-only, minimal.
 */
router.get(
  "/template-version/:vid",
  authenticate,
  authorize("AUDIT_EXECUTION", "create"),
  async (req, res) => {
    const [version] = await db
      .select({ id: auditTemplateVersionsTable.id, versionNo: auditTemplateVersionsTable.versionNo, templateId: auditTemplateVersionsTable.templateId })
      .from(auditTemplateVersionsTable)
      .where(eq(auditTemplateVersionsTable.id, req.params["vid"] as string));
    if (!version) throw httpError(404, "Version not found");
    const [template] = await db
      .select({ auditType: auditTemplatesTable.auditType, name: auditTemplatesTable.name })
      .from(auditTemplatesTable)
      .where(eq(auditTemplatesTable.id, version.templateId));
    const access = await resolveAuditAccess(req.user!);
    if (!conductableAuditTypes(access).includes((template?.auditType ?? "") as AuditType)) {
      throw httpError(403, "You cannot conduct this audit type");
    }
    const { sections, questions } = await loadExecutionQuestions(version.id, null, "none");
    res.json({
      success: true,
      data: {
        id: version.id,
        versionNo: version.versionNo,
        templateName: template?.name ?? null,
        sections: sections.map((s) => ({
          id: s.id,
          title: s.title,
          questions: questions
            .filter((q) => q.sectionId === s.id)
            .map((q) => ({ id: q.id, prompt: q.prompt, type: q.type, weight: q.weight })),
        })),
      },
    });
  },
);

/** Rooms of a property the caller may conduct at (for ROOM-target templates). */
router.get(
  "/target-rooms",
  authenticate,
  authorize("AUDIT_EXECUTION", "create"),
  async (req, res) => {
    const propertyId = String(req.query["propertyId"] ?? "");
    const auditType = String(req.query["auditType"] ?? "UL") as AuditType;
    if (!propertyId) throw httpError(400, "propertyId query param required");
    const access = await resolveAuditAccess(req.user!);
    if (!canConduct(access, auditType, propertyId)) {
      throw httpError(403, "You cannot conduct at this property");
    }
    const rows = await db
      .select({ id: roomsTable.id, number: roomsTable.number, floor: roomsTable.floor })
      .from(roomsTable)
      .where(eq(roomsTable.propertyId, propertyId))
      .orderBy(roomsTable.number);
    res.json({ success: true, data: rows });
  },
);

/** "My audits" queue (FRD-REG-05): assigned open work by due date. */
router.get(
  "/my",
  authenticate,
  authorize("AUDIT_EXECUTION", "view"),
  async (req, res) => {
    const rows = await db
      .select()
      .from(auditsTable)
      .where(
        and(
          eq(auditsTable.assigneeId, req.user!.id),
          inArray(auditsTable.state, ["SCHEDULED", "IN_PROGRESS", "PAUSED", "REJECTED"]),
        ),
      )
      .orderBy(asc(auditsTable.dueAt))
      .limit(200);
    res.json({ success: true, data: await enrich(rows) });
  },
);

/** Audit detail (FRD-EXE-01, Details tab data). */
router.get(
  "/:id",
  authenticate,
  authorize("AUDIT_REGISTER", "view"),
  async (req, res) => {
    const [audit] = await db
      .select()
      .from(auditsTable)
      .where(eq(auditsTable.id, req.params["id"] as string));
    if (!audit) throw httpError(404, "Audit not found");

    const access = await resolveAuditAccess(req.user!);
    const isAssignee = audit.assigneeId === req.user!.id;
    if (!isAssignee && !canView(access, audit.auditType as AuditType, audit.propertyId)) {
      throw httpError(403, "Outside your audit access scope");
    }

    const [enriched] = await enrich([audit]);
    const [version] = await db
      .select({
        id: auditTemplateVersionsTable.id,
        versionNo: auditTemplateVersionsTable.versionNo,
        templateId: auditTemplateVersionsTable.templateId,
      })
      .from(auditTemplateVersionsTable)
      .where(eq(auditTemplateVersionsTable.id, audit.templateVersionId));
    const [template] = version
      ? await db
          .select({ id: auditTemplatesTable.id, name: auditTemplatesTable.name })
          .from(auditTemplatesTable)
          .where(eq(auditTemplatesTable.id, version.templateId))
      : [];

    res.json({
      success: true,
      data: {
        ...enriched,
        templateVersion: version
          ? { ...version, templateName: template?.name ?? null }
          : null,
      },
    });
  },
);

/** Activity tab (FRD-TRL-02): human-readable per-audit event timeline. */
router.get(
  "/:id/events",
  authenticate,
  authorize("AUDIT_REGISTER", "view"),
  async (req, res) => {
    const auditId = req.params["id"] as string;
    const [audit] = await db
      .select({ id: auditsTable.id, auditType: auditsTable.auditType, propertyId: auditsTable.propertyId, assigneeId: auditsTable.assigneeId })
      .from(auditsTable)
      .where(eq(auditsTable.id, auditId));
    if (!audit) throw httpError(404, "Audit not found");

    const access = await resolveAuditAccess(req.user!);
    if (audit.assigneeId !== req.user!.id && !canView(access, audit.auditType as AuditType, audit.propertyId)) {
      throw httpError(403, "Outside your audit access scope");
    }

    const events = await db
      .select({ event: auditEventsTable, actorName: usersTable.name })
      .from(auditEventsTable)
      .leftJoin(usersTable, eq(usersTable.id, auditEventsTable.actorId))
      .where(eq(auditEventsTable.auditId, auditId))
      .orderBy(desc(auditEventsTable.seq))
      .limit(500);

    res.json({
      success: true,
      data: events.map((e) => ({
        ...e.event,
        actorName: e.actorName ?? (e.event.actorId ? null : "System"),
      })),
    });
  },
);

/* ── Shared loaders & guards ───────────────────────────────────────────────── */

async function loadAudit(id: string) {
  const [audit] = await db.select().from(auditsTable).where(eq(auditsTable.id, id));
  if (!audit) throw httpError(404, "Audit not found");
  return audit;
}

function assertAssignee(audit: { assigneeId: string | null }, userId: string) {
  if (audit.assigneeId !== userId) {
    throw httpError(403, "Only the accountable assignee may perform this action");
  }
}

/** Version scale snapshot (published versions always carry one). */
function scaleSnapshotOf(version: { ratingScaleSnapshot: unknown }): RatingScaleSnapshot | null {
  return (version.ratingScaleSnapshot as RatingScaleSnapshot | null) ?? null;
}

async function transitionOrLogDenial(
  audit: typeof auditsTable.$inferSelect,
  to: AuditState,
  actor: { id: string | null; role?: string | null },
  reason: string | null,
  geo?: { lat: number; lng: number } | null,
): Promise<void> {
  if (!canTransition(AUDIT_TRANSITIONS, audit.state as AuditState, to)) {
    // FRD-EXE-03 AC: the denied attempt itself is security-logged.
    await recordAuditEvent({
      entityType: "AUDIT",
      entityId: audit.id,
      auditId: audit.id,
      actorId: actor.id,
      actorRole: actor.role ?? null,
      kind: "DENIED_ATTEMPT",
      fromState: audit.state,
      toState: to,
      reason: "Illegal transition attempt",
    });
    throw httpError(409, "ILLEGAL_TRANSITION", {
      from: audit.state,
      to,
      allowed: AUDIT_TRANSITIONS[audit.state as AuditState],
    });
  }
  await db.transaction(async (tx) => {
    await applyAuditTransition(tx, audit, to, { actor, reason, geo: geo ?? null });
  });
}

/* ── State actions (FRD-EXE-03, FRD-EXE-14) ────────────────────────────────── */

router.post(
  "/:id/start",
  authenticate,
  authorize("AUDIT_EXECUTION", "edit"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    assertAssignee(audit, req.user!.id);
    const geo =
      req.body?.geo && typeof req.body.geo.lat === "number" && typeof req.body.geo.lng === "number"
        ? { lat: req.body.geo.lat, lng: req.body.geo.lng }
        : null;
    await transitionOrLogDenial(audit, "IN_PROGRESS", auditActor(req), "Started", geo);
    res.json({ success: true, data: await loadAudit(audit.id) });
  },
);

router.post(
  "/:id/pause",
  authenticate,
  authorize("AUDIT_EXECUTION", "edit"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    assertAssignee(audit, req.user!.id);
    await transitionOrLogDenial(audit, "PAUSED", auditActor(req), (req.body?.reason as string) ?? null);
    res.json({ success: true, data: await loadAudit(audit.id) });
  },
);

router.post(
  "/:id/resume",
  authenticate,
  authorize("AUDIT_EXECUTION", "edit"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    assertAssignee(audit, req.user!.id);
    if (audit.state !== "PAUSED") throw httpError(409, "Only paused audits can resume");
    await transitionOrLogDenial(audit, "IN_PROGRESS", auditActor(req), "Resumed");
    res.json({ success: true, data: await loadAudit(audit.id) });
  },
);

/** Void before completion. Register delete rule: Pending-only (FRD-REG-04). */
router.post(
  "/:id/cancel",
  authenticate,
  authorize("AUDIT_EXECUTION", "delete"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    if (!["DRAFT", "SCHEDULED"].includes(audit.state)) {
      throw httpError(409, "Only Pending audits can be deleted; started audits are immutable history");
    }
    await transitionOrLogDenial(audit, "CANCELLED", auditActor(req), (req.body?.reason as string) ?? "Cancelled from register");
    res.json({ success: true, data: await loadAudit(audit.id) });
  },
);

/** Title/assignee edits while Pending only (FRD-ASG-03); reassignment (ASG-04). */
router.patch(
  "/:id",
  authenticate,
  authorize("AUDIT_EXECUTION", "edit"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    const body: Record<string, unknown> = {};
    if (typeof req.body?.title === "string" && req.body.title.trim()) body["title"] = req.body.title.trim();
    if (Object.keys(body).length === 0) throw httpError(400, "Nothing to update");
    if (!["DRAFT", "SCHEDULED"].includes(audit.state)) {
      throw httpError(409, "Title is editable while Pending only (FRD-ASG-03)");
    }
    const [row] = await db
      .update(auditsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(auditsTable.id, audit.id))
      .returning();
    res.json({ success: true, data: row });
  },
);

router.post(
  "/:id/reassign",
  authenticate,
  authorize("AUDIT_SCHEDULES", "edit"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    if (["SUBMITTED", "UNDER_REVIEW", "APPROVED", "CLOSED", "CANCELLED"].includes(audit.state)) {
      throw httpError(409, "Reassignment is allowed until submission (FRD-ASG-04)");
    }
    const newAssigneeId = String(req.body?.assigneeId ?? "");
    const [newAssignee] = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, newAssigneeId));
    if (!newAssignee) throw httpError(404, "Assignee not found");

    const actor = auditActor(req);
    const oldAssigneeId = audit.assigneeId;
    await db.transaction(async (tx) => {
      await tx
        .update(auditsTable)
        .set({ assigneeId: newAssignee.id, updatedAt: new Date() })
        .where(eq(auditsTable.id, audit.id));
      await appendAuditEvent(tx, {
        entityType: "AUDIT",
        entityId: audit.id,
        auditId: audit.id,
        actorId: actor.id,
        actorRole: actor.role,
        kind: "ASSIGNMENT",
        beforeJson: { assigneeId: oldAssigneeId },
        afterJson: { assigneeId: newAssignee.id },
        reason: (req.body?.reason as string) ?? null,
      });
    });
    // Both auditors are notified (FRD-ASG-04).
    for (const userId of [oldAssigneeId, newAssignee.id]) {
      if (!userId) continue;
      await notify({
        userId,
        title: `Audit ${audit.ticketNo} reassigned`,
        body: `${audit.title} is now assigned to ${newAssignee.name}.`,
        type: "AUDIT",
        link: `/audits/${audit.id}`,
        entityType: "AUDIT",
        entityId: audit.id,
      });
    }
    res.json({ success: true, data: await loadAudit(audit.id) });
  },
);

/**
 * Bulk reassignment (FRD-ASG-05): move all of an auditor's open audits to
 * another auditor in one action (leaver scenario). Only pre-submission audits
 * are moved; each move is evented and both parties notified.
 */
router.post(
  "/bulk-reassign",
  authenticate,
  authorize("AUDIT_SCHEDULES", "edit"),
  async (req, res) => {
    const fromAssigneeId = String(req.body?.fromAssigneeId ?? "");
    const toAssigneeId = String(req.body?.toAssigneeId ?? "");
    if (!fromAssigneeId || !toAssigneeId) throw httpError(400, "fromAssigneeId and toAssigneeId required");
    if (fromAssigneeId === toAssigneeId) throw httpError(422, "Source and target auditors are the same");

    const [toUser] = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, toAssigneeId));
    if (!toUser) throw httpError(404, "Target auditor not found");

    const OPEN = ["DRAFT", "SCHEDULED", "IN_PROGRESS", "PAUSED", "REJECTED"] as const;
    const open = await db
      .select()
      .from(auditsTable)
      .where(and(eq(auditsTable.assigneeId, fromAssigneeId), inArray(auditsTable.state, [...OPEN])));
    if (open.length === 0) {
      res.json({ success: true, data: { reassigned: 0 } });
      return;
    }

    const actor = auditActor(req);
    const now = new Date();
    await db.transaction(async (tx) => {
      for (const audit of open) {
        await tx.update(auditsTable).set({ assigneeId: toUser.id, updatedAt: now }).where(eq(auditsTable.id, audit.id));
        await appendAuditEvent(tx, {
          entityType: "AUDIT",
          entityId: audit.id,
          auditId: audit.id,
          actorId: actor.id,
          actorRole: actor.role,
          kind: "ASSIGNMENT",
          beforeJson: { assigneeId: fromAssigneeId },
          afterJson: { assigneeId: toUser.id },
          reason: (req.body?.reason as string) ?? "Bulk reassignment",
        });
      }
    });
    // Notify the new owner once with a summary; the leaver is not spammed.
    await notify({
      userId: toUser.id,
      title: `${open.length} audits reassigned to you`,
      body: `You are now the assignee for ${open.length} open audit${open.length === 1 ? "" : "s"}.`,
      type: "AUDIT",
      link: `/audits/my`,
      entityType: "USER",
      entityId: toUser.id,
    });
    res.json({ success: true, data: { reassigned: open.length } });
  },
);

/* ── Manual nudge (FRD-NTF-04) ─────────────────────────────────────────────── */

router.post(
  "/:id/nudge",
  authenticate,
  authorize("AUDIT_REGISTER", "view"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    if (["SUBMITTED", "UNDER_REVIEW", "APPROVED", "CLOSED", "CANCELLED"].includes(audit.state)) {
      throw httpError(409, "Nudge is disabled once the audit is completed", { state: audit.state });
    }
    if (!audit.assigneeId) throw httpError(422, "Audit has no assignee to nudge");

    // Rate limit per audit per hour (FRD-NTF-04): the NOTIFY trail is the counter.
    const perHour = Number(
      await getAuditSetting("manual_nudge_per_hour", AUDIT_SETTING_DEFAULTS.manual_nudge_per_hour),
    );
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditEventsTable)
      .where(
        and(
          eq(auditEventsTable.entityType, "AUDIT"),
          eq(auditEventsTable.entityId, audit.id),
          eq(auditEventsTable.kind, "NOTIFY"),
          gt(auditEventsTable.createdAt, new Date(Date.now() - 3_600_000)),
          sql`${auditEventsTable.reason} LIKE 'Manual nudge%'`,
        ),
      );
    if ((countRow?.count ?? 0) >= perHour) {
      throw httpError(429, `Nudge limit reached (${perHour}/hour for this audit)`);
    }

    const actor = auditActor(req);
    await recordAuditEvent({
      entityType: "AUDIT",
      entityId: audit.id,
      auditId: audit.id,
      actorId: actor.id,
      actorRole: actor.role,
      kind: "NOTIFY",
      reason: "Manual nudge sent",
    });
    await notify({
      userId: audit.assigneeId,
      title: `Nudge: ${audit.ticketNo} needs attention`,
      body: `${audit.title} is awaiting action${audit.dueAt ? ` — due ${audit.dueAt.toLocaleString("en-IN")}` : ""}.`,
      type: "AUDIT",
      link: `/audits/${audit.id}`,
      entityType: "AUDIT",
      entityId: audit.id,
    });
    res.json({ success: true, data: { nudged: true } });
  },
);

/* ── Execution grid (FRD-EXE-04) ───────────────────────────────────────────── */

router.get(
  "/:id/run",
  authenticate,
  authorize("AUDIT_EXECUTION", "view"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    const access = await resolveAuditAccess(req.user!);
    if (audit.assigneeId !== req.user!.id && !canView(access, audit.auditType as AuditType, audit.propertyId)) {
      throw httpError(403, "Outside your audit access scope");
    }
    const [version] = await db
      .select()
      .from(auditTemplateVersionsTable)
      .where(eq(auditTemplateVersionsTable.id, audit.templateVersionId));
    if (!version) throw httpError(500, "Template version missing");

    const { sections, questions } = await loadExecutionQuestions(
      audit.templateVersionId,
      audit.subsetJson,
      audit.id,
    );
    const responses = await db
      .select()
      .from(auditResponsesTable)
      .where(eq(auditResponsesTable.auditId, audit.id));
    const evidence = await db
      .select()
      .from(auditEvidenceTable)
      .where(eq(auditEvidenceTable.auditId, audit.id));
    const ncs = await db
      .select({
        id: auditNonConformancesTable.id,
        ncNo: auditNonConformancesTable.ncNo,
        responseId: auditNonConformancesTable.responseId,
        questionId: auditNonConformancesTable.questionId,
        severity: auditNonConformancesTable.severity,
        state: auditNonConformancesTable.state,
        description: auditNonConformancesTable.description,
      })
      .from(auditNonConformancesTable)
      .where(eq(auditNonConformancesTable.auditId, audit.id));

    const policies = {
      response: await getAttachmentPolicy("RESPONSE"),
      audit: await getAttachmentPolicy("AUDIT"),
      submission: await getAttachmentPolicy("SUBMISSION"),
    };

    const evidenceWithUrls = await Promise.all(
      evidence.map(async (e) => ({
        ...e,
        url: await evidenceUrl(e.storageKey),
        thumbUrl: e.thumbStorageKey ? await evidenceUrl(e.thumbStorageKey) : null,
      })),
    );

    res.json({
      success: true,
      data: {
        audit,
        version: {
          id: version.id,
          versionNo: version.versionNo,
          passThresholdPct: version.passThresholdPct,
          criticalFailGate: version.criticalFailGate,
          reviewRequired: audit.reviewRequired,
        },
        scaleSnapshot: scaleSnapshotOf(version),
        sections: sections.map((s) => ({
          ...s,
          questions: questions.filter((q) => q.sectionId === s.id),
        })),
        responses,
        evidence: evidenceWithUrls,
        ncs,
        policies,
      },
    });
  },
);

/* ── Answering (FRD-EXE-05/07/09) ──────────────────────────────────────────── */

const answerSchema = z.object({
  answerJson: z.unknown().nullish(),
  isNa: z.boolean().optional(),
  notes: z.string().max(4000).nullish(),
});

async function assertAnswerable(audit: typeof auditsTable.$inferSelect, userId: string) {
  assertAssignee(audit, userId);
  if (audit.state !== "IN_PROGRESS") {
    // Frozen post-submit (FRD-EXE-12) or not yet started.
    throw httpError(409, "Answers are editable while the audit is In Progress only", { state: audit.state });
  }
}

router.put(
  "/:id/responses/:questionId",
  authenticate,
  authorize("AUDIT_EXECUTION", "edit"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    await assertAnswerable(audit, req.user!.id);
    const parsed = answerSchema.safeParse(req.body);
    if (!parsed.success) throw httpError(400, "Invalid answer", parsed.error.flatten());

    const questionId = req.params["questionId"] as string;
    const [question] = await db
      .select()
      .from(auditQuestionsTable)
      .where(eq(auditQuestionsTable.id, questionId));
    if (!question) throw httpError(404, "Question not found");
    if (question.auditId && question.auditId !== audit.id) {
      throw httpError(403, "Question belongs to a different audit");
    }

    const [version] = await db
      .select({ ratingScaleSnapshot: auditTemplateVersionsTable.ratingScaleSnapshot })
      .from(auditTemplateVersionsTable)
      .where(eq(auditTemplateVersionsTable.id, audit.templateVersionId));
    const snapshot = scaleSnapshotOf(version ?? { ratingScaleSnapshot: null });

    const resolved = resolveMultiplier(
      {
        id: question.id,
        sectionId: question.sectionId,
        type: question.type,
        weight: question.weight,
        mandatory: question.mandatory,
        optionsJson: question.optionsJson as never,
        numericMin: question.numericMin != null ? Number(question.numericMin) : null,
        numericMax: question.numericMax != null ? Number(question.numericMax) : null,
      },
      parsed.data.answerJson,
      snapshot,
    );

    const now = new Date();
    const [row] = await db
      .insert(auditResponsesTable)
      .values({
        id: newId(),
        auditId: audit.id,
        questionId,
        answerJson: parsed.data.answerJson ?? null,
        isNa: parsed.data.isNa ?? resolved.isNa,
        multiplierPct: resolved.multiplierPct != null ? String(resolved.multiplierPct) : null,
        notes: parsed.data.notes ?? null,
        answeredBy: req.user!.id,
        answeredAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [auditResponsesTable.auditId, auditResponsesTable.questionId],
        set: {
          answerJson: parsed.data.answerJson ?? null,
          isNa: parsed.data.isNa ?? resolved.isNa,
          multiplierPct: resolved.multiplierPct != null ? String(resolved.multiplierPct) : null,
          ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
          answeredBy: req.user!.id,
          answeredAt: now,
          updatedAt: now,
        },
      })
      .returning();

    // Auto-NC prompt (FRD-EXE-07): tell the client to open the inline dialog,
    // pre-filled; the NC itself is raised when the auditor confirms.
    const autoNc = evaluateAutoNc(question, parsed.data.answerJson, snapshot);
    const [existingNc] = autoNc.triggered
      ? await db
          .select({ id: auditNonConformancesTable.id })
          .from(auditNonConformancesTable)
          .where(
            and(
              eq(auditNonConformancesTable.auditId, audit.id),
              eq(auditNonConformancesTable.responseId, row!.id),
            ),
          )
      : [];

    res.json({
      success: true,
      data: {
        ...row,
        ncSuggested: autoNc.triggered && !existingNc,
        ncRule: autoNc.triggered ? autoNc.rule : null,
      },
    });
  },
);

/** Bulk answer (FRD-EXE-09): one answer and/or notes to many rows — never weights/scores (D-3/D-6). */
router.post(
  "/:id/responses/bulk",
  authenticate,
  authorize("AUDIT_EXECUTION", "edit"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    await assertAnswerable(audit, req.user!.id);
    const questionIds = Array.isArray(req.body?.questionIds) ? (req.body.questionIds as string[]) : [];
    if (questionIds.length === 0) throw httpError(400, "questionIds required");
    const parsed = answerSchema.safeParse(req.body);
    if (!parsed.success) throw httpError(400, "Invalid answer", parsed.error.flatten());

    const questions = await db
      .select()
      .from(auditQuestionsTable)
      .where(inArray(auditQuestionsTable.id, questionIds));
    const [version] = await db
      .select({ ratingScaleSnapshot: auditTemplateVersionsTable.ratingScaleSnapshot })
      .from(auditTemplateVersionsTable)
      .where(eq(auditTemplateVersionsTable.id, audit.templateVersionId));
    const snapshot = scaleSnapshotOf(version ?? { ratingScaleSnapshot: null });

    const now = new Date();
    const results: { questionId: string; ncSuggested: boolean }[] = [];
    await db.transaction(async (tx) => {
      for (const question of questions) {
        const resolved = resolveMultiplier(
          {
            id: question.id,
            sectionId: question.sectionId,
            type: question.type,
            weight: question.weight,
            mandatory: question.mandatory,
            optionsJson: question.optionsJson as never,
            numericMin: question.numericMin != null ? Number(question.numericMin) : null,
            numericMax: question.numericMax != null ? Number(question.numericMax) : null,
          },
          parsed.data.answerJson,
          snapshot,
        );
        await tx
          .insert(auditResponsesTable)
          .values({
            id: newId(),
            auditId: audit.id,
            questionId: question.id,
            answerJson: parsed.data.answerJson ?? null,
            isNa: parsed.data.isNa ?? resolved.isNa,
            multiplierPct: resolved.multiplierPct != null ? String(resolved.multiplierPct) : null,
            notes: parsed.data.notes ?? null,
            answeredBy: req.user!.id,
            answeredAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [auditResponsesTable.auditId, auditResponsesTable.questionId],
            set: {
              answerJson: parsed.data.answerJson ?? null,
              isNa: parsed.data.isNa ?? resolved.isNa,
              multiplierPct: resolved.multiplierPct != null ? String(resolved.multiplierPct) : null,
              ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
              answeredBy: req.user!.id,
              answeredAt: now,
              updatedAt: now,
            },
          });
        const autoNc = evaluateAutoNc(question, parsed.data.answerJson, snapshot);
        results.push({ questionId: question.id, ncSuggested: autoNc.triggered });
      }
    });
    res.json({ success: true, data: results });
  },
);

/** Ad-hoc items (FRD-EXE-08, D-4): appended mid-execution, fixed default weight. */
router.post(
  "/:id/adhoc-questions",
  authenticate,
  authorize("AUDIT_EXECUTION", "edit"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    await assertAnswerable(audit, req.user!.id);
    const sectionId = String(req.body?.sectionId ?? "");
    const prompt = String(req.body?.prompt ?? "").trim();
    if (!sectionId || !prompt) throw httpError(400, "sectionId and prompt required");
    if (prompt.length > 500) throw httpError(422, "prompt too long (≤500)");
    const ADHOC_TYPES = ["RATING", "YES_NO_NA", "PASS_FAIL", "TEXT"] as const;
    type AdhocType = (typeof ADHOC_TYPES)[number];
    const requested = String(req.body?.type ?? "RATING");
    const type: AdhocType = (ADHOC_TYPES as readonly string[]).includes(requested)
      ? (requested as AdhocType)
      : "RATING";

    // Weight is fixed from settings — never auditor-editable (X-7, D-6).
    const weight = Number(
      await getAuditSetting("adhoc_default_weight", AUDIT_SETTING_DEFAULTS.adhoc_default_weight),
    );

    const [maxRow] = await db
      .select({ max: sql<number>`coalesce(max(${auditQuestionsTable.orderIndex}), -1)` })
      .from(auditQuestionsTable)
      .where(eq(auditQuestionsTable.sectionId, sectionId));

    const question = await db.transaction(async (tx) => {
      const [q] = await tx
        .insert(auditQuestionsTable)
        .values({
          id: newId(),
          sectionId,
          auditId: audit.id,
          adHoc: true,
          prompt,
          type,
          weight: type === "TEXT" ? 0 : weight,
          mandatory: false,
          evidenceRule: "OPTIONAL",
          orderIndex: (maxRow?.max ?? -1) + 1,
        })
        .returning();
      // Bank-candidate queue for Admin accept/reject (D-4).
      await tx.insert(auditBankCandidatesTable).values({
        id: newId(),
        questionId: q!.id,
        auditId: audit.id,
        proposedBy: req.user!.id,
        status: "PENDING",
      });
      return q!;
    });
    res.status(201).json({ success: true, data: question });
  },
);

/* ── Evidence (FRD-EXE-06/13, FR-AD-05) ────────────────────────────────────── */
// parseDataUrl / storeEvidence / evidenceUrl live in ../lib/audit-service.js
// (shared with the NC & CAPA routes since P4).

const evidenceJson = express.json({ limit: "40mb" });

router.post(
  "/:id/evidence",
  authenticate,
  authorize("AUDIT_EXECUTION", "edit"),
  evidenceJson,
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    assertAssignee(audit, req.user!.id);
    if (!["IN_PROGRESS", "PAUSED"].includes(audit.state)) {
      throw httpError(409, "Evidence can be attached while the audit is open only");
    }

    const kind = String(req.body?.kind ?? "RESPONSE").toUpperCase();
    if (!["AUDIT", "RESPONSE", "SUBMISSION_PROOF"].includes(kind)) {
      throw httpError(400, "kind must be AUDIT | RESPONSE | SUBMISSION_PROOF");
    }
    const parsedFile = parseDataUrl(req.body?.dataUrl);
    if (!parsedFile) throw httpError(400, "dataUrl must be a base64 image/pdf data URL");

    const policyLevel = kind === "SUBMISSION_PROOF" ? "SUBMISSION" : kind;
    const policy = await getAttachmentPolicy(policyLevel);
    if (!policy.allowedMime.includes(parsedFile.contentType)) {
      throw httpError(422, `File type ${parsedFile.contentType} not allowed for ${policyLevel}`, { allowed: policy.allowedMime });
    }
    if (parsedFile.buffer.length > policy.maxSizeMb * 1024 * 1024) {
      throw httpError(422, `File exceeds the ${policy.maxSizeMb}MB limit for ${policyLevel}`);
    }

    const responseId = req.body?.responseId ? String(req.body.responseId) : null;
    // Count against the policy scope: per response row, or per audit level.
    const countWhere =
      kind === "RESPONSE" && responseId
        ? and(eq(auditEvidenceTable.auditId, audit.id), eq(auditEvidenceTable.responseId, responseId))
        : and(eq(auditEvidenceTable.auditId, audit.id), eq(auditEvidenceTable.kind, kind as never));
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditEvidenceTable)
      .where(countWhere);
    if ((countRow?.count ?? 0) >= policy.maxFiles) {
      throw httpError(422, `Attachment limit reached (${policy.maxFiles} for ${policyLevel})`, { maxFiles: policy.maxFiles });
    }

    const geo = req.body?.geo as { lat?: number; lng?: number; accuracyM?: number } | undefined;
    const isLiveCapture = req.body?.isLiveCapture === true;
    if (kind === "SUBMISSION_PROOF") {
      // D-9 / FRD-EXE-13 server-side checks: live capture flag + GPS present.
      if (!isLiveCapture) throw httpError(422, "LIVE_PHOTO_REQUIRED", { reason: "Submission proof must be a live camera capture (no gallery)" });
      if (typeof geo?.lat !== "number" || typeof geo?.lng !== "number") {
        throw httpError(422, "LIVE_PHOTO_REQUIRED", { reason: "Submission proof requires GPS coordinates" });
      }
      const capturedAt = req.body?.capturedAt ? new Date(String(req.body.capturedAt)) : null;
      if (capturedAt && Math.abs(Date.now() - capturedAt.getTime()) > 15 * 60_000) {
        throw httpError(422, "LIVE_PHOTO_REQUIRED", { reason: "Capture is older than 15 minutes — take a fresh photo" });
      }
    }

    const evidenceId = newId();
    const key = `audit-evidence/${audit.id}/${evidenceId}.${parsedFile.ext}`;
    const storageKey = await storeEvidence(key, parsedFile.buffer, parsedFile.contentType);

    let thumbStorageKey: string | null = null;
    const thumb = parseDataUrl(req.body?.thumbDataUrl);
    if (thumb && thumb.buffer.length <= 512 * 1024) {
      thumbStorageKey = await storeEvidence(
        `audit-evidence/${audit.id}/${evidenceId}.thumb.${thumb.ext}`,
        thumb.buffer,
        thumb.contentType,
      );
    }

    const [row] = await db
      .insert(auditEvidenceTable)
      .values({
        id: evidenceId,
        auditId: audit.id,
        kind: kind as never,
        responseId,
        storageKey,
        thumbStorageKey,
        mime: parsedFile.contentType,
        sizeBytes: parsedFile.buffer.length,
        originalName: (req.body?.originalName as string) ?? null,
        geoLat: typeof geo?.lat === "number" ? geo.lat : null,
        geoLng: typeof geo?.lng === "number" ? geo.lng : null,
        geoAccuracyM: typeof geo?.accuracyM === "number" ? String(geo.accuracyM) : null,
        capturedAt: req.body?.capturedAt ? new Date(String(req.body.capturedAt)) : null,
        isLiveCapture,
        uploadedBy: req.user!.id,
      })
      .returning();

    res.status(201).json({
      success: true,
      data: { ...row, url: await evidenceUrl(row!.storageKey), thumbUrl: row!.thumbStorageKey ? await evidenceUrl(row!.thumbStorageKey) : null },
    });
  },
);

router.delete(
  "/:id/evidence/:eid",
  authenticate,
  authorize("AUDIT_EXECUTION", "edit"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    assertAssignee(audit, req.user!.id);
    if (!["IN_PROGRESS", "PAUSED"].includes(audit.state)) {
      throw httpError(409, "Evidence is frozen after submission");
    }
    const [row] = await db
      .delete(auditEvidenceTable)
      .where(and(eq(auditEvidenceTable.id, req.params["eid"] as string), eq(auditEvidenceTable.auditId, audit.id)))
      .returning();
    if (!row) throw httpError(404, "Evidence not found");
    res.json({ success: true });
  },
);

/* ── NC raise from execution (FRD-EXE-07 confirm / FRD-NCM-01 manual) ─────── */

router.post(
  "/:id/ncs",
  authenticate,
  authorize("AUDIT_EXECUTION", "edit"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    const access = await resolveAuditAccess(req.user!);
    const isAssignee = audit.assigneeId === req.user!.id;
    if (!isAssignee && !canConduct(access, audit.auditType as AuditType, audit.propertyId)) {
      throw httpError(403, "Only the auditor may raise findings here");
    }
    const severity = String(req.body?.severity ?? "").toUpperCase();
    if (!["CRITICAL", "MAJOR", "MINOR"].includes(severity)) {
      throw httpError(400, "severity must be CRITICAL | MAJOR | MINOR");
    }
    const description = String(req.body?.description ?? "").trim();
    if (!description) throw httpError(422, "description required");

    const [version] = await db
      .select({ templateId: auditTemplateVersionsTable.templateId })
      .from(auditTemplateVersionsTable)
      .where(eq(auditTemplateVersionsTable.id, audit.templateVersionId));

    const nc = await db.transaction(async (tx) =>
      createNonConformance(tx, {
        auditId: audit.id,
        propertyId: audit.propertyId,
        templateId: version?.templateId ?? null,
        responseId: req.body?.responseId ? String(req.body.responseId) : null,
        questionId: req.body?.questionId ? String(req.body.questionId) : null,
        severity: severity as "CRITICAL",
        category: (req.body?.category as string) ?? null,
        description,
        ownerId: req.body?.ownerId ? String(req.body.ownerId) : null,
        source: req.body?.responseId ? "AUTO" : "MANUAL",
        actor: auditActor(req),
      }),
    );
    await notify({
      userId: nc.ownerId,
      title: `Finding ${nc.ncNo} (${nc.severity})`,
      body: `${description.slice(0, 140)} — due ${nc.dueAt.toLocaleString("en-IN")}`,
      type: "AUDIT_NC",
      link: `/audits/ncs/${nc.id}`,
      entityType: "NC",
      entityId: nc.id,
    });
    res.status(201).json({ success: true, data: nc });
  },
);

/* ── Comments (FRD-EXE-10) ─────────────────────────────────────────────────── */

router.get(
  "/:id/comments",
  authenticate,
  authorize("AUDIT_REGISTER", "view"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    const access = await resolveAuditAccess(req.user!);
    if (audit.assigneeId !== req.user!.id && !canView(access, audit.auditType as AuditType, audit.propertyId)) {
      throw httpError(403, "Outside your audit access scope");
    }
    const comments = await db
      .select({ comment: auditCommentsTable, authorName: usersTable.name, authorRole: usersTable.role })
      .from(auditCommentsTable)
      .leftJoin(usersTable, eq(usersTable.id, auditCommentsTable.authorId))
      .where(eq(auditCommentsTable.auditId, audit.id))
      .orderBy(asc(auditCommentsTable.createdAt));
    res.json({
      success: true,
      data: await Promise.all(
        comments.map(async (c) => ({
          ...c.comment,
          authorName: c.authorName,
          authorRole: c.authorRole,
          attachments: await Promise.all(
            (c.comment.attachmentsJson ?? []).map(async (a) => ({
              mime: a.mime,
              originalName: a.originalName ?? null,
              url: await evidenceUrl(a.storageKey),
              thumbUrl: a.thumbStorageKey ? await evidenceUrl(a.thumbStorageKey) : null,
            })),
          ),
        })),
      ),
    });
  },
);

router.post(
  "/:id/comments",
  authenticate,
  authorize("AUDIT_REGISTER", "view"),
  express.json({ limit: "40mb" }),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    const body = String(req.body?.body ?? "").trim();
    const rawAttachments = Array.isArray(req.body?.attachments) ? (req.body.attachments as { dataUrl: string; originalName?: string }[]) : [];
    if (!body && rawAttachments.length === 0) throw httpError(400, "A comment body or attachment is required");
    if (body.length > 4000) throw httpError(422, "Comment too long");
    if (rawAttachments.length > 5) throw httpError(422, "At most 5 attachments per comment");

    // Store attachments via the shared evidence storage (S3 or dev inline).
    const commentId = newId();
    const stored: { storageKey: string; mime: string; thumbStorageKey?: string; originalName?: string }[] = [];
    for (const att of rawAttachments) {
      const parsed = parseDataUrl(att.dataUrl);
      if (!parsed) throw httpError(422, "Each attachment must be a base64 image/pdf data URL");
      const key = `audit-comments/${audit.id}/${commentId}-${stored.length}.${parsed.ext}`;
      const storageKey = await storeEvidence(key, parsed.buffer, parsed.contentType);
      stored.push({ storageKey, mime: parsed.contentType, originalName: att.originalName });
    }

    const [row] = await db
      .insert(auditCommentsTable)
      .values({ id: commentId, auditId: audit.id, authorId: req.user!.id, body, attachmentsJson: stored })
      .returning();
    // Participants notified (assignee at minimum).
    if (audit.assigneeId && audit.assigneeId !== req.user!.id) {
      await notify({
        userId: audit.assigneeId,
        title: `Comment on ${audit.ticketNo}`,
        body: body.slice(0, 140),
        type: "AUDIT",
        link: `/audits/${audit.id}`,
        entityType: "AUDIT",
        entityId: audit.id,
      });
    }
    res.status(201).json({ success: true, data: row });
  },
);

/* ── Submission gate & atomic submit (FRD-EXE-11/12/13/14) ─────────────────── */

router.get(
  "/:id/submit-check",
  authenticate,
  authorize("AUDIT_EXECUTION", "view"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    assertAssignee(audit, req.user!.id);
    const blockers = await computeSubmitBlockers(audit);
    res.json({ success: true, data: { blockers, canSubmit: blockers.length === 0 } });
  },
);

router.post(
  "/:id/submit",
  authenticate,
  authorize("AUDIT_EXECUTION", "edit"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    assertAssignee(audit, req.user!.id);
    if (audit.state !== "IN_PROGRESS") {
      throw httpError(409, "ILLEGAL_TRANSITION", { from: audit.state, to: "SUBMITTED" });
    }

    const blockers = await computeSubmitBlockers(audit);
    if (blockers.length > 0) {
      const code = blockers.some((b) => b.kind === "LIVE_PHOTO_REQUIRED") && blockers.length === 1
        ? "LIVE_PHOTO_REQUIRED"
        : "SUBMISSION_BLOCKED";
      throw httpError(422, code, { blockers });
    }

    const [version] = await db
      .select()
      .from(auditTemplateVersionsTable)
      .where(eq(auditTemplateVersionsTable.id, audit.templateVersionId));
    if (!version) throw httpError(500, "Template version missing");
    const snapshot = scaleSnapshotOf(version);

    const { questions } = await loadExecutionQuestions(audit.templateVersionId, audit.subsetJson, audit.id);
    const responses = await db
      .select()
      .from(auditResponsesTable)
      .where(eq(auditResponsesTable.auditId, audit.id));
    const [criticalNc] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditNonConformancesTable)
      .where(
        and(eq(auditNonConformancesTable.auditId, audit.id), eq(auditNonConformancesTable.severity, "CRITICAL")),
      );
    const naCountsAgainst = await getAuditSetting("na_counts_against", AUDIT_SETTING_DEFAULTS.na_counts_against);
    const bands = await db.select().from(auditPerformanceBandsTable).orderBy(asc(auditPerformanceBandsTable.orderIndex));

    const result = scoreAudit({
      questions: questions.map((q) => ({
        id: q.id,
        sectionId: q.sectionId,
        type: q.type,
        weight: q.weight,
        mandatory: q.mandatory,
        optionsJson: q.optionsJson as never,
        numericMin: q.numericMin != null ? Number(q.numericMin) : null,
        numericMax: q.numericMax != null ? Number(q.numericMax) : null,
      })),
      answers: responses.map((r) => ({ questionId: r.questionId, answerJson: r.isNa ? naAnswerFor(questions.find((q) => q.id === r.questionId)?.type) : r.answerJson })),
      scaleSnapshot: snapshot,
      naCountsAgainst: Boolean(naCountsAgainst),
      passThresholdPct: version.passThresholdPct != null ? Number(version.passThresholdPct) : null,
      criticalFailGate: version.criticalFailGate,
      hasCriticalNc: (criticalNc?.count ?? 0) > 0,
      bands: bands.map((b) => ({ label: b.label, minPct: Number(b.minPct), maxPct: Number(b.maxPct) })),
    });

    const now = new Date();
    const geo =
      req.body?.geo && typeof req.body.geo.lat === "number" && typeof req.body.geo.lng === "number"
        ? { lat: req.body.geo.lat as number, lng: req.body.geo.lng as number }
        : null;
    const targetState: AuditState = audit.reviewRequired ? "SUBMITTED" : "APPROVED";
    const actor = auditActor(req);

    // Latest valid submission proof, stamped onto the audit (FRD-EXE-13).
    const [proof] = await db
      .select({ id: auditEvidenceTable.id })
      .from(auditEvidenceTable)
      .where(
        and(
          eq(auditEvidenceTable.auditId, audit.id),
          eq(auditEvidenceTable.kind, "SUBMISSION_PROOF"),
          eq(auditEvidenceTable.isLiveCapture, true),
        ),
      )
      .orderBy(desc(auditEvidenceTable.createdAt))
      .limit(1);

    const updated = await db.transaction(async (tx) => {
      // Freeze responses with computed line scores (FRD-EXE-12).
      const lineByQ = new Map(result.lines.map((l) => [l.questionId, l]));
      for (const r of responses) {
        const line = lineByQ.get(r.questionId);
        const question = questions.find((q) => q.id === r.questionId);
        await tx
          .update(auditResponsesTable)
          .set({
            weight: question ? String(question.weight) : null,
            multiplierPct: line?.multiplierPct != null ? String(line.multiplierPct) : r.multiplierPct,
            earnedScore: line?.earned != null ? String(line.earned) : null,
            maxScore: line?.max != null ? String(line.max) : null,
            updatedAt: now,
          })
          .where(eq(auditResponsesTable.id, r.id));
      }

      const durationSeconds = audit.startedAt ? Math.max(0, Math.round((now.getTime() - audit.startedAt.getTime()) / 1000)) : null;
      const [row] = await tx
        .update(auditsTable)
        .set({
          state: targetState,
          submittedAt: now,
          submitGeoLat: geo?.lat ?? null,
          submitGeoLng: geo?.lng ?? null,
          durationSeconds,
          submissionEvidenceId: proof?.id ?? null,
          maxScore: String(result.overall.maxRaw),
          earnedScore: String(result.overall.earnedRaw),
          scorePct: result.overall.pct != null ? String(result.overall.pct) : null,
          result: result.result,
          scoreBand: result.band,
          isOverdue: false,
          ...(targetState === "APPROVED" ? { approvedAt: now } : {}),
          updatedAt: now,
        })
        .where(eq(auditsTable.id, audit.id))
        .returning();

      await appendAuditEvent(tx, {
        entityType: "AUDIT",
        entityId: audit.id,
        auditId: audit.id,
        actorId: actor.id,
        actorRole: actor.role,
        kind: "SCORE_FREEZE",
        afterJson: {
          earned: result.overall.earnedRaw,
          max: result.overall.maxRaw,
          pct: result.overall.pct,
          result: result.result,
          band: result.band,
        },
        reason: "Responses frozen and score computed at submission (D-3: no overrides)",
      });
      await appendAuditEvent(tx, {
        entityType: "AUDIT",
        entityId: audit.id,
        auditId: audit.id,
        actorId: actor.id,
        actorRole: actor.role,
        kind: "STATE_CHANGE",
        fromState: "IN_PROGRESS",
        toState: targetState,
        reason: audit.reviewRequired ? "Submitted for review" : "Submitted — review not required for this template (D-2)",
      });

      // Queue the report row. Every submission (first, post-reject rework,
      // post-reopen) produces the NEXT revision; prior revisions stay
      // immutable and downloadable (FRD-REV-06).
      const [maxRev] = await tx
        .select({ max: sql<number>`coalesce(max(${auditReportsTable.revision}), 0)` })
        .from(auditReportsTable)
        .where(eq(auditReportsTable.auditId, audit.id));
      const reportNo = await allocateNumber(tx, "REPORT");
      await tx.insert(auditReportsTable).values({
        id: newId(),
        reportNo,
        auditId: audit.id,
        revision: (maxRev?.max ?? 0) + 1,
        status: "PENDING",
      });

      return row!;
    });

    // Notify after commit: reviewers (OE, D-11) when review is required.
    if (audit.reviewRequired) {
      const reviewers = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(inArray(usersTable.role, ["OPS_EXCELLENCE"]), eq(usersTable.isActive, true)));
      for (const reviewer of reviewers) {
        await notify({
          userId: reviewer.id,
          title: `Audit ${audit.ticketNo} submitted for review`,
          body: `${audit.title} — score ${result.overall.pct != null ? Math.round(result.overall.pct * 100) / 100 + "%" : "n/a"}`,
          type: "AUDIT",
          link: `/audits/review/${audit.id}`,
          entityType: "AUDIT",
          entityId: audit.id,
        });
      }
    }

    res.json({ success: true, data: { audit: updated, score: result.overall, result: result.result, band: result.band } });
  },
);

/** N/A answers were stored with isNa=true; rebuild a type-correct N/A payload. */
function naAnswerFor(type: string | undefined): unknown {
  if (type === "YES_NO_NA") return { value: "NA" };
  if (type === "RATING") return { optionId: "audit-opt-na" };
  return null;
}

export { router as auditsRouter };
