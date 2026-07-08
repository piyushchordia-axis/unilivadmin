/**
 * Audit & Inspection — scheduled jobs (FA-05 materialization, FRD-NTF-02).
 *
 * Registered in src/index.ts under RUN_SCHEDULERS like the complaints SLA job.
 * All actions run as the system actor (P6): events carry actorId = null.
 *
 * Idempotency (FRD-SCH-04 AC / NFR-04): audits carry a unique occurrenceKey
 * `${scheduleId}:${occurrenceISO}:${targetId}` inserted with
 * onConflictDoNothing, and every schedule keeps a lastMaterializedAt watermark
 * — retries and missed windows can never duplicate, and restarts catch up
 * because enumeration resumes from the watermark.
 */
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  db,
  auditsTable,
  auditAppSettingsTable,
  auditNonConformancesTable,
  auditRoleGrantsTable,
  auditSchedulesTable,
  auditScheduleTargetsTable,
  auditTemplateVersionsTable,
  auditTemplatesTable,
  clustersTable,
  propertiesTable,
  roomsTable,
  usersTable,
} from "@workspace/db";
import { logger } from "./logger.js";
import { newId } from "./id.js";
import { notify } from "./notification-service.js";
import { appendAuditEvent } from "./audit-events.js";
import { applyAuditTransition } from "./audit-state.js";
import {
  allocateNumber,
  getAuditSetting,
  getSeveritySla,
  maybeAutoCloseAudit,
  AUDIT_SETTING_DEFAULTS,
  type SeveritySla,
} from "./audit-service.js";

/* ── Occurrence enumeration ────────────────────────────────────────────────── */

export interface ScheduleLike {
  id: string;
  frequency: string;
  intervalDays: number | null;
  dayOfWeek: number | null;
  cron: string | null;
  timeOfDay: string;
  windowStart: Date;
  windowEnd: Date | null;
}

function atTimeOfDay(day: Date, timeOfDay: string): Date {
  const [h, m] = timeOfDay.split(":").map(Number);
  const d = new Date(day);
  d.setHours(h ?? 9, m ?? 0, 0, 0);
  return d;
}

/** Minimal 5-field cron matcher: minute hour dom month dow (* , - / lists). */
export function cronFieldMatches(field: string, value: number, min: number, max: number): boolean {
  for (const part of field.split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart ? Number(stepPart) : 1;
    let lo = min;
    let hi = max;
    if (rangePart !== "*" && rangePart !== "") {
      if (rangePart!.includes("-")) {
        const [a, b] = rangePart!.split("-").map(Number);
        lo = a!;
        hi = b!;
      } else {
        lo = hi = Number(rangePart);
      }
    }
    if (value >= lo && value <= hi && (value - lo) % step === 0) return true;
  }
  return false;
}

export function cronMatches(expr: string, date: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [minute, hour, dom, month, dow] = fields;
  return (
    cronFieldMatches(minute!, date.getMinutes(), 0, 59) &&
    cronFieldMatches(hour!, date.getHours(), 0, 23) &&
    cronFieldMatches(dom!, date.getDate(), 1, 31) &&
    cronFieldMatches(month!, date.getMonth() + 1, 1, 12) &&
    cronFieldMatches(dow!, date.getDay(), 0, 6)
  );
}

export function isValidCron(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  return (
    fields.length === 5 &&
    fields.every((f) => /^(\*|\d+)(-\d+)?(\/\d+)?(,(\*|\d+)(-\d+)?(\/\d+)?)*$/.test(f))
  );
}

/**
 * All occurrence datetimes with fromExclusive < t <= toInclusive, respecting
 * the schedule window. Times are in server-local time, which the deployment
 * pins to the org timezone (NFR-07).
 */
export function enumerateOccurrences(
  schedule: ScheduleLike,
  fromExclusive: Date,
  toInclusive: Date,
): Date[] {
  const windowEnd = schedule.windowEnd;
  const hardEnd = windowEnd && windowEnd < toInclusive ? windowEnd : toInclusive;
  if (schedule.windowStart > hardEnd) return [];

  const out: Date[] = [];
  const push = (d: Date) => {
    if (d > fromExclusive && d <= hardEnd && d >= schedule.windowStart) out.push(d);
  };

  if (schedule.frequency === "CRON" && schedule.cron) {
    // Scan minute-by-minute — bounded by the look-ahead window (days), so at
    // most ~10k iterations per week of horizon.
    const cursor = new Date(Math.max(schedule.windowStart.getTime(), fromExclusive.getTime()));
    cursor.setSeconds(0, 0);
    for (let t = cursor.getTime(); t <= hardEnd.getTime(); t += 60_000) {
      const d = new Date(t);
      if (cronMatches(schedule.cron, d)) push(d);
    }
    return out;
  }

  const first = atTimeOfDay(schedule.windowStart, schedule.timeOfDay);
  const stepDays =
    schedule.frequency === "EVERY_N_DAYS"
      ? Math.min(Math.max(schedule.intervalDays ?? 1, 1), 6)
      : schedule.frequency === "WEEKLY"
        ? 7
        : schedule.frequency === "FORTNIGHTLY"
          ? 14
          : null;
  const stepMonths =
    schedule.frequency === "MONTHLY"
      ? 1
      : schedule.frequency === "QUARTERLY"
        ? 3
        : schedule.frequency === "HALF_YEARLY"
          ? 6
          : schedule.frequency === "ANNUALLY"
            ? 12
            : null;

  if (stepDays != null) {
    let d = new Date(first);
    if (schedule.frequency === "WEEKLY" && schedule.dayOfWeek != null) {
      // Align to the configured day-of-week at/after windowStart.
      while (d.getDay() !== schedule.dayOfWeek) d = new Date(d.getTime() + 86_400_000);
      d = atTimeOfDay(d, schedule.timeOfDay);
    }
    for (; d <= hardEnd; d = atTimeOfDay(new Date(d.getTime() + stepDays * 86_400_000), schedule.timeOfDay)) {
      push(d);
    }
    return out;
  }

  if (stepMonths != null) {
    const anchorDay = first.getDate();
    let cursor = new Date(first);
    while (cursor <= hardEnd) {
      push(cursor);
      const next = new Date(cursor);
      next.setDate(1); // avoid month-length rollover (31 Jan + 1mo)
      next.setMonth(next.getMonth() + stepMonths);
      const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(anchorDay, daysInMonth));
      cursor = atTimeOfDay(next, schedule.timeOfDay);
    }
    return out;
  }

  return out;
}

/* ── Assignee resolution (FRD-ASG-02) ──────────────────────────────────────── */

export interface AssigneeRule {
  kind: "USER" | "ROLE_AT_TARGET";
  userId?: string;
  role?: "UNIT_LEAD" | "CLUSTER_MANAGER";
}

/** Resolve the accountable assignee for a target at materialization time. */
export async function resolveAssignee(
  rule: AssigneeRule,
  propertyId: string,
): Promise<string | null> {
  if (rule.kind === "USER") return rule.userId ?? null;
  if (rule.role === "UNIT_LEAD") {
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
  if (rule.role === "CLUSTER_MANAGER") {
    const [prop] = await db
      .select({ clusterId: propertiesTable.clusterId })
      .from(propertiesTable)
      .where(eq(propertiesTable.id, propertyId));
    if (!prop?.clusterId) return null;
    const [cluster] = await db
      .select({ managerId: clustersTable.managerId })
      .from(clustersTable)
      .where(eq(clustersTable.id, prop.clusterId));
    return cluster?.managerId ?? null;
  }
  return null;
}

/* ── Materializer (FRD-SCH-04) ─────────────────────────────────────────────── */

export async function runAuditMaterializer(): Promise<void> {
  const lookaheadDays = await getAuditSetting(
    "lookahead_days",
    AUDIT_SETTING_DEFAULTS.lookahead_days,
  );
  const now = new Date();
  const horizon = new Date(now.getTime() + Number(lookaheadDays) * 86_400_000);

  const schedules = await db
    .select()
    .from(auditSchedulesTable)
    .where(and(eq(auditSchedulesTable.status, "ACTIVE"), lte(auditSchedulesTable.windowStart, horizon)));

  for (const schedule of schedules) {
    try {
      await materializeSchedule(schedule, now, horizon);
    } catch (err) {
      logger.error({ err, scheduleId: schedule.id }, "audit materializer failed for schedule");
    }
  }

  await flipDueDrafts(now);
}

async function materializeSchedule(
  schedule: typeof auditSchedulesTable.$inferSelect,
  now: Date,
  horizon: Date,
): Promise<void> {
  const fromExclusive = schedule.lastMaterializedAt ?? new Date(schedule.windowStart.getTime() - 1);
  const occurrences = enumerateOccurrences(schedule, fromExclusive, horizon);
  if (occurrences.length === 0) {
    await db
      .update(auditSchedulesTable)
      .set({ lastMaterializedAt: horizon, updatedAt: now })
      .where(eq(auditSchedulesTable.id, schedule.id));
    return;
  }

  const targets = await db
    .select()
    .from(auditScheduleTargetsTable)
    .where(eq(auditScheduleTargetsTable.scheduleId, schedule.id));

  const [version] = await db
    .select({
      id: auditTemplateVersionsTable.id,
      reviewRequired: auditTemplateVersionsTable.reviewRequired,
      templateId: auditTemplateVersionsTable.templateId,
    })
    .from(auditTemplateVersionsTable)
    .where(eq(auditTemplateVersionsTable.id, schedule.templateVersionId));
  if (!version) return;
  const [template] = await db
    .select({ targetType: auditTemplatesTable.targetType })
    .from(auditTemplatesTable)
    .where(eq(auditTemplatesTable.id, version.templateId));

  const rule = schedule.assigneeRule as AssigneeRule;

  for (const occurrence of occurrences) {
    for (const target of targets) {
      const propertyId = target.propertyId;
      if (!propertyId) continue;
      const targetId = target.roomId ?? propertyId;
      const occurrenceKey = `${schedule.id}:${occurrence.toISOString()}:${targetId}`;
      const assigneeId = await resolveAssignee(rule, propertyId);
      const state = occurrence <= now ? "SCHEDULED" : "DRAFT";

      await db.transaction(async (tx) => {
        const ticketNo = await allocateNumber(tx, "AUDIT");
        const inserted = await tx
          .insert(auditsTable)
          .values({
            id: newId(),
            ticketNo,
            auditType: schedule.auditType,
            templateVersionId: schedule.templateVersionId,
            scheduleId: schedule.id,
            occurrenceKey,
            targetType: template?.targetType ?? target.targetType,
            propertyId,
            roomId: target.roomId ?? null,
            title: schedule.title,
            state,
            assigneeId,
            scheduledFor: occurrence,
            dueAt: occurrence,
            reminderOffsetMinutes: schedule.reminderOffsetMinutes ?? null,
            subsetJson: schedule.subsetJson ?? null,
            reviewRequired: version.reviewRequired,
            createdBy: null, // system actor
          })
          .onConflictDoNothing({ target: auditsTable.occurrenceKey })
          .returning({ id: auditsTable.id, ticketNo: auditsTable.ticketNo });

        const audit = inserted[0];
        if (!audit) return; // occurrence already materialized (idempotent retry)

        await appendAuditEvent(tx, {
          entityType: "AUDIT",
          entityId: audit.id,
          auditId: audit.id,
          actorId: null,
          actorRole: "SYSTEM",
          kind: "STATE_CHANGE",
          toState: state,
          reason: `Materialized from schedule ${schedule.title}`,
        });
      });
    }
  }

  await db
    .update(auditSchedulesTable)
    .set({ lastMaterializedAt: horizon, updatedAt: now })
    .where(eq(auditSchedulesTable.id, schedule.id));
}

/** Flip Upcoming (DRAFT) occurrences to SCHEDULED once their time arrives. */
async function flipDueDrafts(now: Date): Promise<void> {
  const due = await db
    .select()
    .from(auditsTable)
    .where(and(eq(auditsTable.state, "DRAFT"), lte(auditsTable.scheduledFor, now)))
    .limit(500);

  for (const audit of due) {
    try {
      await db.transaction(async (tx) => {
        await applyAuditTransition(tx, audit, "SCHEDULED", {
          actor: { id: null, role: "SYSTEM" },
          reason: "Occurrence due",
        });
      });
      if (audit.assigneeId) {
        await notify({
          userId: audit.assigneeId,
          title: `Audit assigned: ${audit.ticketNo}`,
          body: `${audit.title} is scheduled for ${audit.scheduledFor?.toLocaleString("en-IN") ?? "now"}.`,
          type: "AUDIT",
          link: `/audits/${audit.id}`,
          entityType: "AUDIT",
          entityId: audit.id,
        });
      }
    } catch (err) {
      logger.error({ err, auditId: audit.id }, "failed to flip draft audit to scheduled");
    }
  }
}

/* ── Pre-occurrence reminders (FRD-NTF-02) ─────────────────────────────────── */

export async function runAuditReminders(): Promise<void> {
  const now = new Date();
  const candidates = await db
    .select()
    .from(auditsTable)
    .where(
      and(
        eq(auditsTable.state, "SCHEDULED"),
        isNull(auditsTable.reminderSentAt),
        sql`${auditsTable.reminderOffsetMinutes} IS NOT NULL`,
        sql`${auditsTable.scheduledFor} - (${auditsTable.reminderOffsetMinutes} * interval '1 minute') <= ${now}`,
      ),
    )
    .limit(200);

  for (const audit of candidates) {
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(auditsTable)
          .set({ reminderSentAt: now, updatedAt: now })
          .where(eq(auditsTable.id, audit.id));
        await appendAuditEvent(tx, {
          entityType: "AUDIT",
          entityId: audit.id,
          auditId: audit.id,
          actorId: null,
          actorRole: "SYSTEM",
          kind: "REMINDER",
          reason: `Pre-occurrence reminder (${audit.reminderOffsetMinutes} min before)`,
        });
      });
      if (audit.assigneeId) {
        await notify({
          userId: audit.assigneeId,
          title: `Reminder: ${audit.ticketNo} due soon`,
          body: `${audit.title} is scheduled for ${audit.scheduledFor?.toLocaleString("en-IN") ?? "soon"}.`,
          type: "AUDIT",
          link: `/audits/${audit.id}`,
          entityType: "AUDIT",
          entityId: audit.id,
        });
      }
    } catch (err) {
      logger.error({ err, auditId: audit.id }, "audit reminder failed");
    }
  }
}

/* ── NC SLA check: due-soon, breach, escalation chain (FRD-CAP-03 / NTF-03) ── */

const OPEN_NC_STATES = ["OPEN", "IN_PROGRESS", "REOPENED", "EXTENSION_REQUESTED"] as const;

const ncLink = (id: string) => `/audits/ncs/${id}`;

/**
 * Resolve an escalation-chain audience to user ids.
 *  - REVIEWERS      → active Ops Excellence users (D-11)
 *  - OWNER_MANAGER  → the cluster manager of the NC's audit property
 *  - REGION_HEAD    → active City Heads, falling back to REVIEWERS if none
 * Unknown audiences fall back to REVIEWERS (fail-loud beats fail-silent here).
 */
async function resolveEscalationAudience(
  audience: string,
  propertyId: string,
): Promise<string[]> {
  if (audience === "OWNER_MANAGER") {
    const [prop] = await db
      .select({ clusterId: propertiesTable.clusterId })
      .from(propertiesTable)
      .where(eq(propertiesTable.id, propertyId));
    if (!prop?.clusterId) return [];
    const [cluster] = await db
      .select({ managerId: clustersTable.managerId })
      .from(clustersTable)
      .where(eq(clustersTable.id, prop.clusterId));
    return cluster?.managerId ? [cluster.managerId] : [];
  }
  if (audience === "REGION_HEAD") {
    const heads = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.role, "CITY_HEAD"), eq(usersTable.isActive, true)));
    if (heads.length > 0) return heads.map((h) => h.id);
  }
  const reviewers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.role, "OPS_EXCELLENCE"), eq(usersTable.isActive, true)));
  return reviewers.map((r) => r.id);
}

export async function runNcSlaCheck(): Promise<void> {
  const now = new Date();
  const open = await db
    .select({
      nc: auditNonConformancesTable,
      propertyId: auditsTable.propertyId,
      ticketNo: auditsTable.ticketNo,
    })
    .from(auditNonConformancesTable)
    .innerJoin(auditsTable, eq(auditsTable.id, auditNonConformancesTable.auditId))
    .where(inArray(auditNonConformancesTable.state, [...OPEN_NC_STATES]))
    .limit(500);
  if (open.length === 0) return;

  const slaBySeverity: Record<string, SeveritySla> = {
    CRITICAL: await getSeveritySla("CRITICAL"),
    MAJOR: await getSeveritySla("MAJOR"),
    MINOR: await getSeveritySla("MINOR"),
  };

  for (const row of open) {
    try {
      const sla = slaBySeverity[row.nc.severity];
      if (!sla) continue;
      await checkNcSla(row.nc, row.propertyId, row.ticketNo, sla, now);
    } catch (err) {
      logger.error({ err, ncId: row.nc.id }, "NC SLA check failed");
    }
  }
}

async function checkNcSla(
  nc: typeof auditNonConformancesTable.$inferSelect,
  propertyId: string,
  ticketNo: string,
  sla: SeveritySla,
  now: Date,
): Promise<void> {
  const dueMs = nc.dueAt.getTime();
  const nowMs = now.getTime();

  // (a) Due-soon reminder, once per due date (stamp is the dedupe).
  const dueSoon = nc.dueSoonNotifiedAt == null && nowMs >= dueMs - sla.reminderLeadHours * 3_600_000;
  // (b) Breach: flip the derived overdue flag, once per due date.
  const breached = nc.breachNotifiedAt == null && nowMs > dueMs;

  // (c) Escalation chain: steps fire strictly in order; escalationLevelSent is
  // the count of steps already sent, so restarts/retries never re-fire a step.
  const chain = sla.escalationChainJson ?? [];
  const totalMs = dueMs - nc.createdAt.getTime();
  const elapsedPct = totalMs > 0 ? ((nowMs - nc.createdAt.getTime()) / totalMs) * 100 : 100;
  const fired: { index: number; step: (typeof chain)[number] }[] = [];
  for (let i = nc.escalationLevelSent; i < chain.length; i++) {
    const step = chain[i]!;
    const stepFires =
      step.trigger === "ON_RAISE" ||
      (step.trigger === "PCT_ELAPSED" && step.pct != null && elapsedPct >= step.pct) ||
      (step.trigger === "ON_BREACH" && nowMs > dueMs);
    if (!stepFires) break;
    fired.push({ index: i, step });
  }

  if (!dueSoon && !breached && fired.length === 0) return;

  // Resolve audiences before the tx (reads only), notify after commit.
  const escalationTargets: { index: number; step: (typeof chain)[number]; userIds: string[] }[] = [];
  for (const f of fired) {
    escalationTargets.push({
      ...f,
      userIds: await resolveEscalationAudience(f.step.audience, propertyId),
    });
  }

  await db.transaction(async (tx) => {
    const set: Record<string, unknown> = { updatedAt: now };
    if (dueSoon) set["dueSoonNotifiedAt"] = now;
    if (breached) {
      set["isOverdue"] = true;
      set["breachNotifiedAt"] = now;
    }
    if (fired.length > 0) set["escalationLevelSent"] = fired[fired.length - 1]!.index + 1;
    await tx
      .update(auditNonConformancesTable)
      .set(set)
      .where(eq(auditNonConformancesTable.id, nc.id));

    if (dueSoon) {
      await appendAuditEvent(tx, {
        entityType: "NC",
        entityId: nc.id,
        auditId: nc.auditId,
        actorId: null,
        actorRole: "SYSTEM",
        kind: "REMINDER",
        reason: `CAPA due soon (${sla.reminderLeadHours}h lead) — due ${nc.dueAt.toISOString()}`,
      });
    }
    if (breached) {
      await appendAuditEvent(tx, {
        entityType: "NC",
        entityId: nc.id,
        auditId: nc.auditId,
        actorId: null,
        actorRole: "SYSTEM",
        kind: "ESCALATION",
        reason: `CAPA SLA breached — was due ${nc.dueAt.toISOString()}`,
      });
    }
    for (const f of fired) {
      await appendAuditEvent(tx, {
        entityType: "NC",
        entityId: nc.id,
        auditId: nc.auditId,
        actorId: null,
        actorRole: "SYSTEM",
        kind: "ESCALATION",
        reason: `Escalation step ${f.index + 1} (${f.step.trigger}${f.step.pct != null ? ` ${f.step.pct}%` : ""}) → ${f.step.audience}`,
      });
    }
  });

  const refBody = `${nc.severity} finding ${nc.ncNo} on ${ticketNo}: ${nc.description.slice(0, 100)}`;
  if (dueSoon) {
    await notify({
      userId: nc.ownerId,
      title: `Due soon: ${nc.ncNo}`,
      body: `${refBody} — due ${nc.dueAt.toLocaleString("en-IN")}.`,
      type: "AUDIT_NC",
      link: ncLink(nc.id),
      entityType: "NC",
      entityId: nc.id,
    });
  }
  if (breached) {
    const reviewers = await resolveEscalationAudience("REVIEWERS", propertyId);
    for (const userId of [nc.ownerId, ...reviewers.filter((id) => id !== nc.ownerId)]) {
      await notify({
        userId,
        title: `SLA breached: ${nc.ncNo}`,
        body: `${refBody} passed its CAPA due date (${nc.dueAt.toLocaleString("en-IN")}).`,
        type: "AUDIT_NC",
        link: ncLink(nc.id),
        entityType: "NC",
        entityId: nc.id,
      });
    }
  }
  for (const target of escalationTargets) {
    for (const userId of target.userIds) {
      await notify({
        userId,
        title: `Escalation: ${nc.ncNo} (${nc.severity})`,
        body: `${refBody} — due ${nc.dueAt.toLocaleString("en-IN")}.`,
        type: "AUDIT_NC",
        link: ncLink(nc.id),
        entityType: "NC",
        entityId: nc.id,
      });
    }
  }
}

/* ── Audit auto-close safety net (FRD-REV-04) ──────────────────────────────── */

/**
 * Close APPROVED audits whose every NC is terminal (Verified/Closed/Waived).
 * The synchronous path (after NC verify/waive) normally gets there first; this
 * job is the catch-up for missed cases and enforces the `auto_close_days`
 * setting (0 = close as soon as all NCs are terminal).
 */
export async function runAuditAutoClose(): Promise<void> {
  const autoCloseDays = Number(
    await getAuditSetting("auto_close_days", AUDIT_SETTING_DEFAULTS.auto_close_days),
  );
  const now = Date.now();
  const approved = await db
    .select()
    .from(auditsTable)
    .where(eq(auditsTable.state, "APPROVED"))
    .limit(500);

  for (const audit of approved) {
    try {
      if (autoCloseDays > 0) {
        const approvedAtMs = (audit.approvedAt ?? audit.updatedAt).getTime();
        if (now < approvedAtMs + autoCloseDays * 86_400_000) continue;
      }
      await maybeAutoCloseAudit(audit.id, { id: null, role: "SYSTEM" });
    } catch (err) {
      logger.error({ err, auditId: audit.id }, "audit auto-close failed");
    }
  }
}

/* ── Overdue flagging (spec §4.1 derived flag) ─────────────────────────────── */

export async function runAuditOverdueCheck(): Promise<void> {
  const now = new Date();
  const overdue = await db
    .select()
    .from(auditsTable)
    .where(
      and(
        inArray(auditsTable.state, ["SCHEDULED", "IN_PROGRESS", "PAUSED"]),
        eq(auditsTable.isOverdue, false),
        sql`${auditsTable.dueAt} < ${now}`,
      ),
    )
    .limit(500);

  for (const audit of overdue) {
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(auditsTable)
          .set({ isOverdue: true, updatedAt: now })
          .where(eq(auditsTable.id, audit.id));
        await appendAuditEvent(tx, {
          entityType: "AUDIT",
          entityId: audit.id,
          auditId: audit.id,
          actorId: null,
          actorRole: "SYSTEM",
          kind: "STATE_CHANGE",
          fromState: audit.state,
          toState: audit.state,
          reason: "Overdue flag set (past due date)",
        });
      });
      if (audit.assigneeId) {
        await notify({
          userId: audit.assigneeId,
          title: `Overdue: ${audit.ticketNo}`,
          body: `${audit.title} passed its due date and is now flagged overdue.`,
          type: "AUDIT",
          link: `/audits/${audit.id}`,
          entityType: "AUDIT",
          entityId: audit.id,
        });
      }
    } catch (err) {
      logger.error({ err, auditId: audit.id }, "audit overdue flagging failed");
    }
  }
}

/* ── Grant-expiry sweep (FRD-ACC-02 AC) ────────────────────────────────────── */

/**
 * Expiry is already effective the moment `expiresAt` passes — the access
 * resolver's time predicate excludes expired grants. This sweep only writes
 * the required GRANT_CHANGE trail event, once per grant (expiryEventAt stamp).
 */
export async function runGrantExpirySweep(): Promise<void> {
  const now = new Date();
  const expired = await db
    .select()
    .from(auditRoleGrantsTable)
    .where(
      and(
        isNull(auditRoleGrantsTable.revokedAt),
        isNull(auditRoleGrantsTable.expiryEventAt),
        lte(auditRoleGrantsTable.expiresAt, now),
      ),
    )
    .limit(200);

  for (const grant of expired) {
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(auditRoleGrantsTable)
          .set({ expiryEventAt: now })
          .where(eq(auditRoleGrantsTable.id, grant.id));
        await appendAuditEvent(tx, {
          entityType: "GRANT",
          entityId: grant.id,
          actorId: null,
          actorRole: "SYSTEM",
          kind: "GRANT_CHANGE",
          reason: "Grant expired",
          beforeJson: { moduleRole: grant.moduleRole, auditTypes: grant.auditTypes, expiresAt: grant.expiresAt },
          afterJson: { active: false },
        });
      });
    } catch (err) {
      logger.error({ err, grantId: grant.id }, "grant expiry sweep failed");
    }
  }
}

/* ── Scheduled analytics digest (FRD-ANL-05) ───────────────────────────────── */

/**
 * Weekly email digest of program health to Operations Excellence. Runs daily
 * and sends only when ≥7 days have elapsed since the last send (tracked in an
 * app setting), so it survives restarts without double-sending. In-app + email
 * via notify(); no new gateway needed.
 */
export async function runAuditDigests(): Promise<void> {
  const now = new Date();
  const [setting] = await db
    .select()
    .from(auditAppSettingsTable)
    .where(eq(auditAppSettingsTable.key, "digest_last_sent"));
  const lastSent = setting?.valueJson ? new Date(String(setting.valueJson)) : null;
  if (lastSent && now.getTime() - lastSent.getTime() < 7 * 86_400_000) return;

  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [audits] = await db
    .select({
      created: sql<number>`count(*) filter (where ${auditsTable.createdAt} >= ${weekAgo})::int`,
      submitted: sql<number>`count(*) filter (where ${auditsTable.submittedAt} >= ${weekAgo})::int`,
      overdue: sql<number>`count(*) filter (where ${auditsTable.isOverdue} and ${auditsTable.state} in ('SCHEDULED','IN_PROGRESS','PAUSED'))::int`,
      avgScore: sql<number>`coalesce(avg(${auditsTable.scorePct}) filter (where ${auditsTable.submittedAt} >= ${weekAgo}), 0)::float`,
    })
    .from(auditsTable);
  const [ncs] = await db
    .select({
      openNcs: sql<number>`count(*) filter (where ${auditNonConformancesTable.state} not in ('VERIFIED','CLOSED','WAIVED'))::int`,
      breached: sql<number>`count(*) filter (where ${auditNonConformancesTable.isOverdue})::int`,
    })
    .from(auditNonConformancesTable);

  const lines = [
    `Audits created this week: ${audits?.created ?? 0}`,
    `Audits submitted this week: ${audits?.submitted ?? 0}`,
    `Average score (submitted): ${(audits?.avgScore ?? 0).toFixed(1)}%`,
    `Currently overdue audits: ${audits?.overdue ?? 0}`,
    `Open non-conformances: ${ncs?.openNcs ?? 0} (overdue: ${ncs?.breached ?? 0})`,
  ];
  const body = `Audit & Inspection — weekly summary\n\n${lines.join("\n")}`;

  const recipients = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.role, "OPS_EXCELLENCE"), eq(usersTable.isActive, true)));
  for (const r of recipients) {
    await notify({
      userId: r.id,
      title: "Audit program — weekly digest",
      body: lines.join(" · "),
      type: "AUDIT_DIGEST",
      link: "/audits/dashboard",
      entityType: "DIGEST",
      entityId: "weekly",
      email: { subject: "Audit & Inspection — weekly summary", text: body },
    });
  }

  if (setting) {
    await db
      .update(auditAppSettingsTable)
      .set({ valueJson: now.toISOString(), updatedAt: now })
      .where(eq(auditAppSettingsTable.key, "digest_last_sent"));
  } else {
    await db.insert(auditAppSettingsTable).values({ key: "digest_last_sent", valueJson: now.toISOString() });
  }
}
