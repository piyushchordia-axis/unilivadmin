/**
 * Audit & Inspection — review, approval & closure (FA-12, FRD-REV-01..06).
 * Launch baseline (D-11): review/approve/reject/reopen are performed by
 * Operations Excellence / Super Admin only — enforced by the AUDIT_REVIEW
 * module gate (only those roles hold it) plus isSuperAdmin for reopen.
 */
import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  auditsTable,
  auditReviewsTable,
  auditResponsesTable,
  auditEvidenceTable,
  auditNonConformancesTable,
  auditTemplateVersionsTable,
  auditTemplatesTable,
  propertiesTable,
  roomsTable,
  usersTable,
} from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";
import { httpError, isSuperAdmin } from "../lib/authz.js";
import { getPagination, buildMeta } from "../lib/paginate.js";
import { newId } from "../lib/id.js";
import { notify } from "../lib/notification-service.js";
import { appendAuditEvent } from "../lib/audit-events.js";
import { applyAuditTransition, type AuditState } from "../lib/audit-state.js";
import {
  auditActor,
  createNonConformance,
  evidenceUrl,
  loadExecutionQuestions,
  maybeAutoCloseAudit,
} from "../lib/audit-service.js";

const router: IRouter = Router();

async function loadAudit(id: string) {
  const [audit] = await db.select().from(auditsTable).where(eq(auditsTable.id, id));
  if (!audit) throw httpError(404, "Audit not found");
  return audit;
}

/** Review queue (Submitted + Under Review), oldest first. */
router.get(
  "/queue",
  authenticate,
  authorize("AUDIT_REVIEW", "view"),
  async (req, res) => {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const where = inArray(auditsTable.state, ["SUBMITTED", "UNDER_REVIEW"]);
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditsTable)
      .where(where);
    const rows = await db
      .select({
        audit: auditsTable,
        propertyName: propertiesTable.name,
        assigneeName: usersTable.name,
        assigneeRole: usersTable.role,
      })
      .from(auditsTable)
      .leftJoin(propertiesTable, eq(propertiesTable.id, auditsTable.propertyId))
      .leftJoin(usersTable, eq(usersTable.id, auditsTable.assigneeId))
      .where(where)
      .orderBy(asc(auditsTable.submittedAt))
      .limit(limit)
      .offset(offset);
    res.json({
      success: true,
      data: rows.map((r) => ({
        ...r.audit,
        propertyName: r.propertyName,
        assigneeName: r.assigneeName,
        assigneeRole: r.assigneeRole,
      })),
      meta: buildMeta(countRow?.count ?? 0, page, limit),
    });
  },
);

/**
 * Review workspace (FRD-REV-01): read-only responses with evidence, score
 * breakdown per section, NC list, auditor timeline incl. the auto-captured
 * timings/GPS (FRD-EXE-14) and the live submission proof (D-9).
 */
router.get(
  "/:id/workspace",
  authenticate,
  authorize("AUDIT_REVIEW", "view"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    const [version] = await db
      .select()
      .from(auditTemplateVersionsTable)
      .where(eq(auditTemplateVersionsTable.id, audit.templateVersionId));
    const [template] = version
      ? await db.select().from(auditTemplatesTable).where(eq(auditTemplatesTable.id, version.templateId))
      : [];
    const [property] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, audit.propertyId));
    const [room] = audit.roomId
      ? await db.select().from(roomsTable).where(eq(roomsTable.id, audit.roomId))
      : [];
    const [assignee] = audit.assigneeId
      ? await db
          .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
          .from(usersTable)
          .where(eq(usersTable.id, audit.assigneeId))
      : [];

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
      .select()
      .from(auditNonConformancesTable)
      .where(eq(auditNonConformancesTable.auditId, audit.id))
      .orderBy(asc(auditNonConformancesTable.createdAt));
    const reviews = await db
      .select({ review: auditReviewsTable, reviewerName: usersTable.name })
      .from(auditReviewsTable)
      .leftJoin(usersTable, eq(usersTable.id, auditReviewsTable.reviewerId))
      .where(eq(auditReviewsTable.auditId, audit.id))
      .orderBy(desc(auditReviewsTable.createdAt));

    const evidenceWithUrls = await Promise.all(
      evidence.map(async (e) => ({
        ...e,
        url: await evidenceUrl(e.storageKey),
        thumbUrl: e.thumbStorageKey ? await evidenceUrl(e.thumbStorageKey) : null,
      })),
    );

    // Per-section score breakdown from the frozen line scores.
    const responseByQ = new Map(responses.map((r) => [r.questionId, r]));
    const sectionScores = sections.map((s) => {
      let earned = 0;
      let possible = 0;
      for (const q of questions.filter((qq) => qq.sectionId === s.id)) {
        const r = responseByQ.get(q.id);
        if (r?.earnedScore != null && r.maxScore != null) {
          earned += Number(r.earnedScore);
          possible += Number(r.maxScore);
        }
      }
      return { sectionId: s.id, title: s.title, earned, possible, pct: possible > 0 ? (earned / possible) * 100 : null };
    });

    res.json({
      success: true,
      data: {
        audit,
        template: template ? { id: template.id, name: template.name } : null,
        version: version ? { id: version.id, versionNo: version.versionNo, passThresholdPct: version.passThresholdPct, criticalFailGate: version.criticalFailGate } : null,
        target: { propertyName: property?.name ?? null, roomNumber: room?.number ?? null },
        assignee: assignee ?? null,
        scaleSnapshot: version?.ratingScaleSnapshot ?? null,
        sections: sections.map((s) => ({ ...s, questions: questions.filter((q) => q.sectionId === s.id) })),
        responses,
        evidence: evidenceWithUrls,
        submissionProof: evidenceWithUrls.find((e) => e.id === audit.submissionEvidenceId) ?? null,
        ncs,
        sectionScores,
        reviews: reviews.map((r) => ({ ...r.review, reviewerName: r.reviewerName })),
      },
    });
  },
);

/** Claim a submitted audit for review: SUBMITTED → UNDER_REVIEW. */
router.post(
  "/:id/claim",
  authenticate,
  authorize("AUDIT_REVIEW", "edit"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    await db.transaction(async (tx) => {
      await applyAuditTransition(tx, audit, "UNDER_REVIEW", {
        actor: auditActor(req),
        reason: "Review started",
      });
    });
    res.json({ success: true, data: await loadAudit(audit.id) });
  },
);

/** Approve (FRD-REV-02); auto-closes immediately when no NC remains open. */
router.post(
  "/:id/approve",
  authenticate,
  authorize("AUDIT_REVIEW", "edit"),
  async (req, res) => {
    let audit = await loadAudit(req.params["id"] as string);
    const actor = auditActor(req);

    await db.transaction(async (tx) => {
      // Reviewers may approve straight from SUBMITTED (claim is optional).
      if (audit.state === "SUBMITTED") {
        await applyAuditTransition(tx, audit, "UNDER_REVIEW", { actor, reason: "Review started" });
        audit = { ...audit, state: "UNDER_REVIEW" };
      }
      await applyAuditTransition(tx, audit, "APPROVED", {
        actor,
        reason: (req.body?.comments as string) ?? "Approved",
      });
      await tx.insert(auditReviewsTable).values({
        id: newId(),
        auditId: audit.id,
        reviewerId: req.user!.id,
        verdict: "APPROVED",
        comments: (req.body?.comments as string) ?? null,
      });
    });

    if (audit.assigneeId) {
      await notify({
        userId: audit.assigneeId,
        title: `Audit ${audit.ticketNo} approved`,
        body: audit.title,
        type: "AUDIT",
        link: `/audits/${audit.id}`,
        entityType: "AUDIT",
        entityId: audit.id,
      });
    }
    // FRD-REV-04: accountable auto-closure once every NC is terminal.
    await maybeAutoCloseAudit(audit.id, actor);
    res.json({ success: true, data: await loadAudit(audit.id) });
  },
);

/** Reject with mandatory comment; audit returns to In Progress, answers kept. */
router.post(
  "/:id/reject",
  authenticate,
  authorize("AUDIT_REVIEW", "edit"),
  async (req, res) => {
    let audit = await loadAudit(req.params["id"] as string);
    const comment = String(req.body?.comment ?? "").trim();
    if (!comment) throw httpError(422, "A comment is required to reject (FRD-REV-02)");
    const actor = auditActor(req);

    await db.transaction(async (tx) => {
      if (audit.state === "SUBMITTED") {
        await applyAuditTransition(tx, audit, "UNDER_REVIEW", { actor, reason: "Review started" });
        audit = { ...audit, state: "UNDER_REVIEW" };
      }
      await applyAuditTransition(tx, audit, "REJECTED", { actor, reason: comment });
      // FRD-REV-02 AC: the audit returns to the auditor In Progress with
      // answers preserved — REJECTED is a routing state in the trail.
      await applyAuditTransition(tx, { ...audit, state: "REJECTED" }, "IN_PROGRESS", {
        actor,
        reason: "Returned to auditor for rework",
      });
      await tx.insert(auditReviewsTable).values({
        id: newId(),
        auditId: audit.id,
        reviewerId: req.user!.id,
        verdict: "REJECTED",
        comments: comment,
      });
    });

    if (audit.assigneeId) {
      await notify({
        userId: audit.assigneeId,
        title: `Audit ${audit.ticketNo} rejected — rework needed`,
        body: comment.slice(0, 180),
        type: "AUDIT",
        link: `/audits/${audit.id}/run`,
        entityType: "AUDIT",
        entityId: audit.id,
      });
    }
    res.json({ success: true, data: await loadAudit(audit.id) });
  },
);

/** Add a finding the auditor missed, during review (FRD-REV-03). */
router.post(
  "/:id/findings",
  authenticate,
  authorize("AUDIT_REVIEW", "edit"),
  async (req, res) => {
    const audit = await loadAudit(req.params["id"] as string);
    if (!["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(audit.state)) {
      throw httpError(409, "Findings can be added during review only");
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
        questionId: req.body?.questionId ? String(req.body.questionId) : null,
        severity: severity as "CRITICAL",
        category: (req.body?.category as string) ?? null,
        description,
        ownerId: req.body?.ownerId ? String(req.body.ownerId) : null,
        source: "REVIEW",
        actor: auditActor(req),
      }),
    );
    await notify({
      userId: nc.ownerId,
      title: `Finding ${nc.ncNo} added in review (${nc.severity})`,
      body: description.slice(0, 140),
      type: "AUDIT_NC",
      link: `/audits/ncs/${nc.id}`,
      entityType: "NC",
      entityId: nc.id,
    });
    res.status(201).json({ success: true, data: nc });
  },
);

/**
 * Reopen a CLOSED audit (FRD-REV-06): Operations Excellence only, mandatory
 * reason, prior report revision preserved; resubmission produces revision+1.
 * AC matrix: non-OE → 403 · missing reason → 422 · valid → IN_PROGRESS.
 */
router.post(
  "/:id/reopen",
  authenticate,
  authorize("AUDIT_REVIEW", "edit"),
  async (req, res) => {
    if (!isSuperAdmin(req.user?.role)) {
      throw httpError(403, "Only Operations Excellence may reopen a closed audit (D-11 / FRD-REV-06)");
    }
    const audit = await loadAudit(req.params["id"] as string);
    const reason = String(req.body?.reason ?? "").trim();
    if (!reason) throw httpError(422, "A reason is required to reopen (FRD-REV-06)");
    if (audit.state !== "CLOSED") {
      throw httpError(409, "ILLEGAL_TRANSITION", { from: audit.state, to: "IN_PROGRESS" });
    }

    await db.transaction(async (tx) => {
      await applyAuditTransition(tx, audit, "IN_PROGRESS", {
        actor: auditActor(req),
        reason: `Reopened: ${reason}`,
      });
    });
    if (audit.assigneeId) {
      await notify({
        userId: audit.assigneeId,
        title: `Audit ${audit.ticketNo} reopened`,
        body: reason.slice(0, 180),
        type: "AUDIT",
        link: `/audits/${audit.id}/run`,
        entityType: "AUDIT",
        entityId: audit.id,
      });
    }
    res.json({ success: true, data: await loadAudit(audit.id) });
  },
);

export { router as auditReviewsRouter };
