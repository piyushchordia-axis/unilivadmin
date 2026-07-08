/**
 * Audit & Inspection — admin console routes (FA-16 / FA-17 read side).
 * P1 scope: role grants (FR-AD-01), numbering schemes (FR-AD-06), module
 * settings, trail explorer + chain verify (FR-AD-09). Rating scales, bands,
 * SLAs, notification rules, policies and bank candidates land in P2–P5.
 * Every mutation is recorded via writeConfigChange (FR-AD-10).
 */
import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  auditAppSettingsTable,
  auditAttachmentPoliciesTable,
  auditBankCandidatesTable,
  auditEventsTable,
  auditNotificationRulesTable,
  auditNumberingSchemesTable,
  auditPerformanceBandsTable,
  auditQuestionBankItemsTable,
  auditQuestionsTable,
  auditRatingOptionsTable,
  auditRatingScalesTable,
  auditRoleGrantsTable,
  auditSeveritySlasTable,
  auditsTable,
  usersTable,
  zonesTable,
  citiesTable,
  clustersTable,
  propertiesTable,
} from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";
import { httpError, pick } from "../lib/authz.js";
import { getPagination, buildMeta } from "../lib/paginate.js";
import { newId } from "../lib/id.js";
import { notify } from "../lib/notification-service.js";
import { writeConfigChange, verifyChain } from "../lib/audit-events.js";
import { auditActor } from "../lib/audit-service.js";
import { csvEsc } from "../lib/export-service.js";

const router: IRouter = Router();

/* ── Role grants (FR-AD-01, FRD-ACC-02/05) ─────────────────────────────────── */

const AUDIT_TYPES = ["UL", "CM", "CX"] as const;
const MODULE_ROLES = ["ADMIN", "SCHEDULER", "AUDITOR", "AUDITEE", "REVIEWER", "VIEWER"] as const;
const SCOPE_LEVELS = ["GLOBAL", "ZONE", "CITY", "CLUSTER", "PROPERTY"] as const;

const grantSchema = z.object({
  userId: z.string().min(1),
  moduleRole: z.enum(MODULE_ROLES),
  auditTypes: z.array(z.enum(AUDIT_TYPES)).min(1),
  scopeLevel: z.enum(SCOPE_LEVELS),
  zoneId: z.string().nullish(),
  cityId: z.string().nullish(),
  clusterId: z.string().nullish(),
  propertyId: z.string().nullish(),
  effectiveFrom: z.coerce.date().optional(),
  expiresAt: z.coerce.date().nullish(),
});

/** The org-node id column that must be present for each scope level. */
const SCOPE_NODE_FIELD: Record<string, "zoneId" | "cityId" | "clusterId" | "propertyId" | null> = {
  GLOBAL: null,
  ZONE: "zoneId",
  CITY: "cityId",
  CLUSTER: "clusterId",
  PROPERTY: "propertyId",
};

function validateGrantNode(g: z.infer<typeof grantSchema>): string | null {
  const field = SCOPE_NODE_FIELD[g.scopeLevel];
  if (field && !g[field]) return `scopeLevel ${g.scopeLevel} requires ${field}`;
  return null;
}

router.get(
  "/grants",
  authenticate,
  authorize("AUDIT_ADMIN", "view"),
  async (req, res) => {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const userId = req.query["userId"] as string | undefined;
    const activeOnly = req.query["active"] === "true";

    const conditions = [];
    if (userId) conditions.push(eq(auditRoleGrantsTable.userId, userId));
    if (activeOnly) {
      const now = new Date();
      conditions.push(
        isNull(auditRoleGrantsTable.revokedAt),
        lte(auditRoleGrantsTable.effectiveFrom, now),
        or(
          isNull(auditRoleGrantsTable.expiresAt),
          gte(auditRoleGrantsTable.expiresAt, now),
        ),
      );
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditRoleGrantsTable)
      .where(where);
    const rows = await db
      .select({
        grant: auditRoleGrantsTable,
        userName: usersTable.name,
        userEmail: usersTable.email,
        userRole: usersTable.role,
      })
      .from(auditRoleGrantsTable)
      .leftJoin(usersTable, eq(usersTable.id, auditRoleGrantsTable.userId))
      .where(where)
      .orderBy(desc(auditRoleGrantsTable.grantedAt))
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: rows.map((r) => ({ ...r.grant, userName: r.userName, userEmail: r.userEmail, userRole: r.userRole })),
      meta: buildMeta(countRow?.count ?? 0, page, limit),
    });
  },
);

router.post(
  "/grants",
  authenticate,
  authorize("AUDIT_ADMIN", "create"),
  async (req, res) => {
    const parsed = grantSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, "Invalid grant", parsed.error.flatten());
    }
    const nodeError = validateGrantNode(parsed.data);
    if (nodeError) throw httpError(400, nodeError);

    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, parsed.data.userId));
    if (!user) throw httpError(404, "User not found");

    const actor = auditActor(req);
    const grant = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(auditRoleGrantsTable)
        .values({
          id: newId(),
          userId: parsed.data.userId,
          moduleRole: parsed.data.moduleRole,
          auditTypes: parsed.data.auditTypes,
          scopeLevel: parsed.data.scopeLevel,
          zoneId: parsed.data.zoneId ?? null,
          cityId: parsed.data.cityId ?? null,
          clusterId: parsed.data.clusterId ?? null,
          propertyId: parsed.data.propertyId ?? null,
          effectiveFrom: parsed.data.effectiveFrom ?? new Date(),
          expiresAt: parsed.data.expiresAt ?? null,
          grantedBy: actor.id,
        })
        .returning();
      await writeConfigChange(tx, {
        entityType: "GRANT",
        entityId: row!.id,
        actorId: actor.id,
        actorRole: actor.role,
        before: null,
        after: row,
        kind: "GRANT_CHANGE",
      });
      return row!;
    });
    res.status(201).json({ success: true, data: grant });
  },
);

router.post(
  "/grants/:id/revoke",
  authenticate,
  authorize("AUDIT_ADMIN", "edit"),
  async (req, res) => {
    const [existing] = await db
      .select()
      .from(auditRoleGrantsTable)
      .where(eq(auditRoleGrantsTable.id, req.params["id"] as string));
    if (!existing) throw httpError(404, "Grant not found");
    if (existing.revokedAt) throw httpError(409, "Grant already revoked");

    const actor = auditActor(req);
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(auditRoleGrantsTable)
        .set({ revokedAt: new Date(), revokedBy: actor.id })
        .where(eq(auditRoleGrantsTable.id, existing.id))
        .returning();
      await writeConfigChange(tx, {
        entityType: "GRANT",
        entityId: existing.id,
        actorId: actor.id,
        actorRole: actor.role,
        before: existing,
        after: row,
        reason: (req.body?.reason as string) ?? null,
        kind: "GRANT_CHANGE",
      });
      return row!;
    });
    res.json({ success: true, data: updated });
  },
);

/**
 * Bulk grant/revoke with a row-level validation report (FRD-ACC-02). The
 * frontend parses CSV/XLSX client-side (bulk-upload-dialog) and posts rows;
 * nothing is committed unless every row validates (all-or-nothing).
 */
router.post(
  "/grants/bulk",
  authenticate,
  authorize("AUDIT_ADMIN", "create"),
  async (req, res) => {
    const rows = Array.isArray(req.body?.rows) ? (req.body.rows as unknown[]) : null;
    if (!rows || rows.length === 0) throw httpError(400, "rows[] required");
    if (rows.length > 1000) throw httpError(400, "Too many rows (max 1000)");

    const report: { row: number; error: string }[] = [];
    const parsedRows: z.infer<typeof grantSchema>[] = [];
    for (let i = 0; i < rows.length; i++) {
      const parsed = grantSchema.safeParse(rows[i]);
      if (!parsed.success) {
        report.push({ row: i + 1, error: parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; ") });
        continue;
      }
      const nodeError = validateGrantNode(parsed.data);
      if (nodeError) {
        report.push({ row: i + 1, error: nodeError });
        continue;
      }
      parsedRows.push(parsed.data);
    }

    // Validate users exist (row-level).
    const userIds = [...new Set(parsedRows.map((r) => r.userId))];
    const found = userIds.length
      ? await db.select({ id: usersTable.id }).from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const foundSet = new Set(found.map((u) => u.id));
    parsedRows.forEach((r, idx) => {
      if (!foundSet.has(r.userId)) report.push({ row: idx + 1, error: `Unknown user ${r.userId}` });
    });

    if (report.length > 0) {
      res.status(422).json({ success: false, error: "Validation failed — nothing imported", details: report });
      return;
    }

    const actor = auditActor(req);
    const created = await db.transaction(async (tx) => {
      const out = [];
      for (const data of parsedRows) {
        const [row] = await tx
          .insert(auditRoleGrantsTable)
          .values({
            id: newId(),
            userId: data.userId,
            moduleRole: data.moduleRole,
            auditTypes: data.auditTypes,
            scopeLevel: data.scopeLevel,
            zoneId: data.zoneId ?? null,
            cityId: data.cityId ?? null,
            clusterId: data.clusterId ?? null,
            propertyId: data.propertyId ?? null,
            effectiveFrom: data.effectiveFrom ?? new Date(),
            expiresAt: data.expiresAt ?? null,
            grantedBy: actor.id,
          })
          .returning();
        out.push(row!);
      }
      await writeConfigChange(tx, {
        entityType: "GRANT",
        entityId: "bulk",
        actorId: actor.id,
        actorRole: actor.role,
        before: null,
        after: { count: out.length },
        reason: "bulk import",
        kind: "GRANT_CHANGE",
      });
      return out;
    });
    res.status(201).json({ success: true, data: { imported: created.length } });
  },
);

/**
 * Org nodes for the grant editor (zone/city/cluster/property pickers). The
 * full read-only master-data browser (FR-AD-08) lands in P5; this is the
 * minimal list the admin console needs, gated on AUDIT_ADMIN rather than
 * coupling the audit UI to food-module permissions.
 */
router.get(
  "/org-nodes",
  authenticate,
  authorize("AUDIT_ADMIN", "view"),
  async (_req, res) => {
    const [zones, cities, clusters, properties] = await Promise.all([
      db.select({ id: zonesTable.id, name: zonesTable.name }).from(zonesTable).orderBy(zonesTable.name),
      db.select({ id: citiesTable.id, name: citiesTable.name, zoneId: citiesTable.zoneId }).from(citiesTable).orderBy(citiesTable.name),
      db.select({ id: clustersTable.id, name: clustersTable.name, cityId: clustersTable.cityId }).from(clustersTable).orderBy(clustersTable.name),
      db.select({ id: propertiesTable.id, name: propertiesTable.name, clusterId: propertiesTable.clusterId }).from(propertiesTable).orderBy(propertiesTable.name),
    ]);
    res.json({ success: true, data: { zones, cities, clusters, properties } });
  },
);

/**
 * Read-only master-data browser (FR-AD-09 / ADM-09): the org tree with audit
 * volume per node and a sync indicator. Org/target data is owned by the host
 * platform (this codebase), so it is always in sync — surfaced explicitly so
 * the console reads the same as a decoupled deployment would.
 */
router.get(
  "/master-data",
  authenticate,
  authorize("AUDIT_ADMIN", "view"),
  async (_req, res) => {
    const [zones, cities, clusters, properties, rooms] = await Promise.all([
      db.select({ id: zonesTable.id, name: zonesTable.name }).from(zonesTable).orderBy(zonesTable.name),
      db.select({ id: citiesTable.id, name: citiesTable.name, zoneId: citiesTable.zoneId }).from(citiesTable).orderBy(citiesTable.name),
      db.select({ id: clustersTable.id, name: clustersTable.name, cityId: clustersTable.cityId }).from(clustersTable).orderBy(clustersTable.name),
      db.select({ id: propertiesTable.id, name: propertiesTable.name, clusterId: propertiesTable.clusterId, city: propertiesTable.city }).from(propertiesTable).orderBy(propertiesTable.name),
      db.select({ count: sql<number>`count(*)::int` }).from(sql`rooms`),
    ]);
    const auditsByProperty = await db
      .select({ propertyId: auditsTable.propertyId, count: sql<number>`count(*)::int` })
      .from(auditsTable)
      .groupBy(auditsTable.propertyId);
    const auditCount = new Map(auditsByProperty.map((r) => [r.propertyId, r.count]));

    res.json({
      success: true,
      data: {
        sync: { status: "SYNCED", source: "host platform (owned in-app)", lastSyncedAt: new Date().toISOString() },
        counts: {
          zones: zones.length,
          cities: cities.length,
          clusters: clusters.length,
          properties: properties.length,
          rooms: rooms[0]?.count ?? 0,
        },
        properties: properties.map((p) => ({ ...p, auditsGenerated: auditCount.get(p.id) ?? 0 })),
        zones,
        cities,
        clusters,
      },
    });
  },
);

/**
 * Feature toggles (FR-AD-08 / ADM-08): parity display/behaviour flags stored
 * as one evented app setting. The module's core behaviour (computed-only
 * scoring, per-template review, OE-only reopen, critical-fail gate) is fixed by
 * decision; these toggles govern display and create-form affordances.
 */
const FEATURE_TOGGLE_DEFAULTS = {
  show_weightage: true,
  score_display: true,
  show_priority_column: true,
  weight_mode: "numeric" as "numeric" | "percentage",
  verify_stage_default: true,
  allow_reopen: true,
  zero_tolerance_default: false,
  create_form_show_description: true,
  create_form_show_assignee: true,
  create_form_show_schedule: true,
};

router.get(
  "/feature-toggles",
  authenticate,
  authorize("AUDIT_ADMIN", "view"),
  async (_req, res) => {
    const [row] = await db
      .select()
      .from(auditAppSettingsTable)
      .where(eq(auditAppSettingsTable.key, "feature_toggles"));
    const value = { ...FEATURE_TOGGLE_DEFAULTS, ...((row?.valueJson as Record<string, unknown>) ?? {}) };
    res.json({ success: true, data: value });
  },
);

router.put(
  "/feature-toggles",
  authenticate,
  authorize("AUDIT_ADMIN", "edit"),
  async (req, res) => {
    const patch = req.body ?? {};
    const [existing] = await db
      .select()
      .from(auditAppSettingsTable)
      .where(eq(auditAppSettingsTable.key, "feature_toggles"));
    const before = { ...FEATURE_TOGGLE_DEFAULTS, ...((existing?.valueJson as Record<string, unknown>) ?? {}) };
    // Allow-list to known keys; ignore anything else (anti mass-assignment).
    const after: Record<string, unknown> = { ...before };
    for (const key of Object.keys(FEATURE_TOGGLE_DEFAULTS)) {
      if (key in patch) after[key] = patch[key];
    }

    const actor = auditActor(req);
    await db.transaction(async (tx) => {
      if (existing) {
        await tx
          .update(auditAppSettingsTable)
          .set({ valueJson: after, updatedBy: actor.id, updatedAt: new Date() })
          .where(eq(auditAppSettingsTable.key, "feature_toggles"));
      } else {
        await tx.insert(auditAppSettingsTable).values({ key: "feature_toggles", valueJson: after, updatedBy: actor.id });
      }
      await writeConfigChange(tx, {
        entityType: "FEATURE_TOGGLES",
        entityId: "feature_toggles",
        actorId: actor.id,
        actorRole: actor.role,
        before,
        after,
      });
    });
    res.json({ success: true, data: after });
  },
);

/* ── Numbering schemes (FR-AD-06) ──────────────────────────────────────────── */

router.get(
  "/numbering",
  authenticate,
  authorize("AUDIT_ADMIN", "view"),
  async (_req, res) => {
    const rows = await db.select().from(auditNumberingSchemesTable);
    res.json({ success: true, data: rows });
  },
);

router.put(
  "/numbering/:objectType",
  authenticate,
  authorize("AUDIT_ADMIN", "edit"),
  async (req, res) => {
    const objectType = (req.params["objectType"] as string).toUpperCase();
    if (!["AUDIT", "NC", "REPORT"].includes(objectType)) {
      throw httpError(400, "objectType must be AUDIT | NC | REPORT");
    }
    const body = pick(req.body, ["prefix", "pattern", "nextSeq", "padWidth"]);
    if (body.prefix !== undefined && !/^[A-Z0-9-]{1,20}$/i.test(String(body.prefix))) {
      throw httpError(400, "prefix must be 1–20 alphanumeric/dash characters");
    }
    if (body.pattern !== undefined && !String(body.pattern).includes("{seq}")) {
      throw httpError(400, "pattern must contain {seq}");
    }
    if (body.nextSeq !== undefined && (!Number.isInteger(body.nextSeq) || body.nextSeq < 1)) {
      throw httpError(400, "nextSeq must be a positive integer");
    }

    const [existing] = await db
      .select()
      .from(auditNumberingSchemesTable)
      .where(eq(auditNumberingSchemesTable.objectType, objectType));

    const actor = auditActor(req);
    const row = await db.transaction(async (tx) => {
      let saved;
      if (existing) {
        [saved] = await tx
          .update(auditNumberingSchemesTable)
          .set({ ...body, updatedAt: new Date() })
          .where(eq(auditNumberingSchemesTable.objectType, objectType))
          .returning();
      } else {
        [saved] = await tx
          .insert(auditNumberingSchemesTable)
          .values({
            id: newId(),
            objectType,
            prefix: body.prefix ?? `UNI-${objectType.slice(0, 3)}`,
            pattern: body.pattern ?? "{prefix}-{seq}",
            nextSeq: body.nextSeq ?? 1,
            padWidth: body.padWidth ?? null,
          })
          .returning();
      }
      await writeConfigChange(tx, {
        entityType: "NUMBERING_SCHEME",
        entityId: objectType,
        actorId: actor.id,
        actorRole: actor.role,
        before: existing ?? null,
        after: saved,
      });
      return saved!;
    });
    res.json({ success: true, data: row });
  },
);

/* ── Rating scales (FR-AD-02) ──────────────────────────────────────────────── */

const scaleOptionSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1).max(60),
  color: z.string().max(30).nullish(),
  orderIndex: z.number().int().min(0),
  multiplierPct: z.number().min(0).max(100),
  isExcludedNa: z.boolean().optional(),
});
const scaleSchema = z.object({
  name: z.string().min(1).max(100),
  active: z.boolean().optional(),
  options: z.array(scaleOptionSchema).min(2),
});

router.get(
  "/rating-scales",
  authenticate,
  authorize("AUDIT_ADMIN", "view"),
  async (_req, res) => {
    const scales = await db.select().from(auditRatingScalesTable);
    const options = await db
      .select()
      .from(auditRatingOptionsTable)
      .orderBy(auditRatingOptionsTable.orderIndex);
    res.json({
      success: true,
      data: scales.map((s) => ({
        ...s,
        options: options.filter((o) => o.scaleId === s.id),
      })),
    });
  },
);

router.post(
  "/rating-scales",
  authenticate,
  authorize("AUDIT_ADMIN", "create"),
  async (req, res) => {
    const parsed = scaleSchema.safeParse(req.body);
    if (!parsed.success) throw httpError(400, "Invalid rating scale", parsed.error.flatten());

    const actor = auditActor(req);
    const created = await db.transaction(async (tx) => {
      const [scale] = await tx
        .insert(auditRatingScalesTable)
        .values({ id: newId(), name: parsed.data.name, active: parsed.data.active ?? true })
        .returning();
      const options = [];
      for (const o of parsed.data.options) {
        const [row] = await tx
          .insert(auditRatingOptionsTable)
          .values({
            id: newId(),
            scaleId: scale!.id,
            label: o.label,
            color: o.color ?? null,
            orderIndex: o.orderIndex,
            multiplierPct: String(o.multiplierPct),
            isExcludedNa: o.isExcludedNa ?? false,
          })
          .returning();
        options.push(row!);
      }
      await writeConfigChange(tx, {
        entityType: "RATING_SCALE",
        entityId: scale!.id,
        actorId: actor.id,
        actorRole: actor.role,
        before: null,
        after: { ...scale, options },
      });
      return { ...scale!, options };
    });
    res.status(201).json({ success: true, data: created });
  },
);

/**
 * Replace a scale's metadata + full option set. Published template versions
 * are unaffected — they snapshot their scale at publish (FRD-TLB-03).
 */
router.put(
  "/rating-scales/:id",
  authenticate,
  authorize("AUDIT_ADMIN", "edit"),
  async (req, res) => {
    const parsed = scaleSchema.safeParse(req.body);
    if (!parsed.success) throw httpError(400, "Invalid rating scale", parsed.error.flatten());

    const scaleId = req.params["id"] as string;
    const [existing] = await db
      .select()
      .from(auditRatingScalesTable)
      .where(eq(auditRatingScalesTable.id, scaleId));
    if (!existing) throw httpError(404, "Rating scale not found");
    const existingOptions = await db
      .select()
      .from(auditRatingOptionsTable)
      .where(eq(auditRatingOptionsTable.scaleId, scaleId));

    const actor = auditActor(req);
    const updated = await db.transaction(async (tx) => {
      const [scale] = await tx
        .update(auditRatingScalesTable)
        .set({ name: parsed.data.name, active: parsed.data.active ?? existing.active, updatedAt: new Date() })
        .where(eq(auditRatingScalesTable.id, scaleId))
        .returning();
      await tx.delete(auditRatingOptionsTable).where(eq(auditRatingOptionsTable.scaleId, scaleId));
      const options = [];
      for (const o of parsed.data.options) {
        const [row] = await tx
          .insert(auditRatingOptionsTable)
          .values({
            id: o.id ?? newId(),
            scaleId,
            label: o.label,
            color: o.color ?? null,
            orderIndex: o.orderIndex,
            multiplierPct: String(o.multiplierPct),
            isExcludedNa: o.isExcludedNa ?? false,
          })
          .returning();
        options.push(row!);
      }
      await writeConfigChange(tx, {
        entityType: "RATING_SCALE",
        entityId: scaleId,
        actorId: actor.id,
        actorRole: actor.role,
        before: { ...existing, options: existingOptions },
        after: { ...scale, options },
      });
      return { ...scale!, options };
    });
    res.json({ success: true, data: updated });
  },
);

/* ── Performance bands (FRD-ADM-02) ────────────────────────────────────────── */

const bandsSchema = z.object({
  bands: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        minPct: z.number().min(0).max(100),
        maxPct: z.number().min(0).max(100),
        color: z.string().max(30).nullish(),
      }),
    )
    .min(1),
});

router.get(
  "/performance-bands",
  authenticate,
  authorize("AUDIT_ADMIN", "view"),
  async (_req, res) => {
    const rows = await db
      .select()
      .from(auditPerformanceBandsTable)
      .orderBy(auditPerformanceBandsTable.orderIndex);
    res.json({ success: true, data: rows });
  },
);

/** Replace the full band set. Validates contiguous, non-overlapping, 0–100. */
router.put(
  "/performance-bands",
  authenticate,
  authorize("AUDIT_ADMIN", "edit"),
  async (req, res) => {
    const parsed = bandsSchema.safeParse(req.body);
    if (!parsed.success) throw httpError(400, "Invalid bands", parsed.error.flatten());

    const sorted = [...parsed.data.bands].sort((a, b) => a.minPct - b.minPct);
    for (const b of sorted) {
      if (b.minPct > b.maxPct) throw httpError(422, `Band "${b.label}": min > max`);
    }
    if (sorted[0]!.minPct !== 0) throw httpError(422, "Bands must start at 0%");
    if (sorted[sorted.length - 1]!.maxPct !== 100) throw httpError(422, "Bands must end at 100%");
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i]!.minPct - sorted[i - 1]!.maxPct;
      if (gap <= 0) throw httpError(422, `Bands "${sorted[i - 1]!.label}" and "${sorted[i]!.label}" overlap`);
      if (gap > 0.01000001) throw httpError(422, `Gap between "${sorted[i - 1]!.label}" and "${sorted[i]!.label}" — bands must be contiguous (next min = prev max + 0.01)`);
    }

    const existing = await db.select().from(auditPerformanceBandsTable);
    const actor = auditActor(req);
    const saved = await db.transaction(async (tx) => {
      await tx.delete(auditPerformanceBandsTable);
      const rows = [];
      for (let i = 0; i < sorted.length; i++) {
        const b = sorted[i]!;
        const [row] = await tx
          .insert(auditPerformanceBandsTable)
          .values({
            id: newId(),
            label: b.label,
            minPct: String(b.minPct),
            maxPct: String(b.maxPct),
            color: b.color ?? null,
            orderIndex: i,
          })
          .returning();
        rows.push(row!);
      }
      await writeConfigChange(tx, {
        entityType: "PERFORMANCE_BANDS",
        entityId: "bands",
        actorId: actor.id,
        actorRole: actor.role,
        before: existing,
        after: rows,
      });
      return rows;
    });
    res.json({ success: true, data: saved });
  },
);

/* ── Module settings ───────────────────────────────────────────────────────── */

router.get(
  "/settings",
  authenticate,
  authorize("AUDIT_ADMIN", "view"),
  async (_req, res) => {
    const rows = await db.select().from(auditAppSettingsTable);
    res.json({ success: true, data: rows });
  },
);

router.put(
  "/settings/:key",
  authenticate,
  authorize("AUDIT_ADMIN", "edit"),
  async (req, res) => {
    const key = req.params["key"] as string;
    if (!/^[a-z0-9_]{1,64}$/.test(key)) throw httpError(400, "Invalid setting key");
    if (!("value" in (req.body ?? {}))) throw httpError(400, "Body must include { value }");

    const [existing] = await db
      .select()
      .from(auditAppSettingsTable)
      .where(eq(auditAppSettingsTable.key, key));

    const actor = auditActor(req);
    const row = await db.transaction(async (tx) => {
      const values = {
        valueJson: req.body.value as unknown,
        updatedBy: actor.id,
        updatedAt: new Date(),
      };
      let saved;
      if (existing) {
        [saved] = await tx
          .update(auditAppSettingsTable)
          .set(values)
          .where(eq(auditAppSettingsTable.key, key))
          .returning();
      } else {
        [saved] = await tx
          .insert(auditAppSettingsTable)
          .values({ key, ...values })
          .returning();
      }
      await writeConfigChange(tx, {
        entityType: "SETTING",
        entityId: key,
        actorId: actor.id,
        actorRole: actor.role,
        before: existing ?? null,
        after: saved,
      });
      return saved!;
    });
    res.json({ success: true, data: row });
  },
);

/* ── Severity SLAs (FR-AD-03) ──────────────────────────────────────────────── */

const SEVERITIES = ["CRITICAL", "MAJOR", "MINOR"] as const;

const escalationStepSchema = z.object({
  trigger: z.enum(["ON_RAISE", "PCT_ELAPSED", "ON_BREACH"]),
  pct: z.number().min(0).max(100).optional(),
  audience: z.string().min(1).max(40),
});
const severitySlaSchema = z.object({
  capaDueHours: z.number().int().positive(),
  reminderLeadHours: z.number().int().min(0),
  escalationChainJson: z.array(escalationStepSchema),
});

router.get(
  "/severity-slas",
  authenticate,
  authorize("AUDIT_ADMIN", "view"),
  async (_req, res) => {
    const rows = await db.select().from(auditSeveritySlasTable);
    res.json({ success: true, data: rows });
  },
);

/** Updates (or creates) the GLOBAL row for a severity; overrides are P5+. */
router.put(
  "/severity-slas/:severity",
  authenticate,
  authorize("AUDIT_ADMIN", "edit"),
  async (req, res) => {
    const severity = (req.params["severity"] as string).toUpperCase();
    if (!(SEVERITIES as readonly string[]).includes(severity)) {
      throw httpError(400, "severity must be CRITICAL | MAJOR | MINOR");
    }
    const parsed = severitySlaSchema.safeParse(req.body);
    if (!parsed.success) throw httpError(400, "Invalid SLA", parsed.error.flatten());
    if (parsed.data.escalationChainJson.some((s) => s.trigger === "PCT_ELAPSED" && s.pct == null)) {
      throw httpError(422, "PCT_ELAPSED escalation steps require pct");
    }

    const [existing] = await db
      .select()
      .from(auditSeveritySlasTable)
      .where(
        and(
          eq(auditSeveritySlasTable.severity, severity as never),
          isNull(auditSeveritySlasTable.templateId),
          isNull(auditSeveritySlasTable.scopeLevel),
        ),
      );

    const actor = auditActor(req);
    const row = await db.transaction(async (tx) => {
      const values = {
        capaDueHours: parsed.data.capaDueHours,
        reminderLeadHours: parsed.data.reminderLeadHours,
        escalationChainJson: parsed.data.escalationChainJson,
        updatedBy: actor.id,
        updatedAt: new Date(),
      };
      let saved;
      if (existing) {
        [saved] = await tx
          .update(auditSeveritySlasTable)
          .set(values)
          .where(eq(auditSeveritySlasTable.id, existing.id))
          .returning();
      } else {
        [saved] = await tx
          .insert(auditSeveritySlasTable)
          .values({ id: newId(), severity: severity as never, ...values })
          .returning();
      }
      await writeConfigChange(tx, {
        entityType: "SEVERITY_SLA",
        entityId: severity,
        actorId: actor.id,
        actorRole: actor.role,
        before: existing ?? null,
        after: saved,
      });
      return saved!;
    });
    res.json({ success: true, data: row });
  },
);

/* ── Notification rules (FR-AD-04) ─────────────────────────────────────────── */

const NOTIFY_CHANNELS = ["IN_APP", "EMAIL", "PUSH", "WHATSAPP"] as const;

const notificationRuleSchema = z.object({
  channelsJson: z.array(z.enum(NOTIFY_CHANNELS)),
  audienceJson: z.array(z.string().min(1).max(40)),
  subjectTemplate: z.string().max(200).nullish(),
  bodyTemplate: z.string().max(2000).nullish(),
  active: z.boolean(),
});

router.get(
  "/notification-rules",
  authenticate,
  authorize("AUDIT_ADMIN", "view"),
  async (_req, res) => {
    const rows = await db
      .select()
      .from(auditNotificationRulesTable)
      .orderBy(auditNotificationRulesTable.eventKey);
    res.json({ success: true, data: rows });
  },
);

router.put(
  "/notification-rules/:eventKey",
  authenticate,
  authorize("AUDIT_ADMIN", "edit"),
  async (req, res) => {
    const eventKey = (req.params["eventKey"] as string).toUpperCase();
    if (!/^[A-Z0-9_]{1,64}$/.test(eventKey)) throw httpError(400, "Invalid event key");
    const parsed = notificationRuleSchema.safeParse(req.body);
    if (!parsed.success) throw httpError(400, "Invalid notification rule", parsed.error.flatten());

    const [existing] = await db
      .select()
      .from(auditNotificationRulesTable)
      .where(eq(auditNotificationRulesTable.eventKey, eventKey));

    const actor = auditActor(req);
    const row = await db.transaction(async (tx) => {
      const values = {
        channelsJson: parsed.data.channelsJson as string[],
        audienceJson: parsed.data.audienceJson,
        subjectTemplate: parsed.data.subjectTemplate ?? null,
        bodyTemplate: parsed.data.bodyTemplate ?? null,
        active: parsed.data.active,
        updatedBy: actor.id,
        updatedAt: new Date(),
      };
      let saved;
      if (existing) {
        [saved] = await tx
          .update(auditNotificationRulesTable)
          .set(values)
          .where(eq(auditNotificationRulesTable.eventKey, eventKey))
          .returning();
      } else {
        [saved] = await tx
          .insert(auditNotificationRulesTable)
          .values({ id: newId(), eventKey, ...values })
          .returning();
      }
      await writeConfigChange(tx, {
        entityType: "NOTIFICATION_RULE",
        entityId: eventKey,
        actorId: actor.id,
        actorRole: actor.role,
        before: existing ?? null,
        after: saved,
      });
      return saved!;
    });
    res.json({ success: true, data: row });
  },
);

/** Test-send: delivers a "[TEST]"-prefixed in-app notification to the caller. */
router.post(
  "/notification-rules/:eventKey/test-send",
  authenticate,
  authorize("AUDIT_ADMIN", "edit"),
  async (req, res) => {
    const eventKey = (req.params["eventKey"] as string).toUpperCase();
    const [rule] = await db
      .select()
      .from(auditNotificationRulesTable)
      .where(eq(auditNotificationRulesTable.eventKey, eventKey));
    if (!rule) throw httpError(404, "Notification rule not found");

    await notify({
      userId: req.user!.id,
      title: `[TEST] ${rule.subjectTemplate || rule.eventKey}`,
      body:
        rule.bodyTemplate ||
        `Test send for notification rule ${rule.eventKey} (channels: ${(rule.channelsJson ?? []).join(", ") || "none"}).`,
      type: "AUDIT",
      entityType: "NOTIFICATION_RULE",
      entityId: rule.eventKey,
    });
    res.json({ success: true, data: { sentTo: req.user!.email } });
  },
);

/* ── Attachment policies (FR-AD-05) ────────────────────────────────────────── */

const ATTACHMENT_LEVELS = ["AUDIT", "RESPONSE", "NC", "CAPA", "SUBMISSION"] as const;

const attachmentPolicySchema = z.object({
  maxFiles: z.number().int().min(1).max(20),
  maxSizeMb: z.number().int().min(1).max(100),
  allowedMimeJson: z.array(z.string().min(3).max(100)).min(1),
});

router.get(
  "/attachment-policies",
  authenticate,
  authorize("AUDIT_ADMIN", "view"),
  async (_req, res) => {
    const rows = await db
      .select()
      .from(auditAttachmentPoliciesTable)
      .orderBy(auditAttachmentPoliciesTable.level);
    res.json({ success: true, data: rows });
  },
);

router.put(
  "/attachment-policies/:level",
  authenticate,
  authorize("AUDIT_ADMIN", "edit"),
  async (req, res) => {
    const level = (req.params["level"] as string).toUpperCase();
    if (!(ATTACHMENT_LEVELS as readonly string[]).includes(level)) {
      throw httpError(400, "level must be AUDIT | RESPONSE | NC | CAPA | SUBMISSION");
    }
    const parsed = attachmentPolicySchema.safeParse(req.body);
    if (!parsed.success) throw httpError(400, "Invalid attachment policy", parsed.error.flatten());

    const [existing] = await db
      .select()
      .from(auditAttachmentPoliciesTable)
      .where(eq(auditAttachmentPoliciesTable.level, level));

    const actor = auditActor(req);
    const row = await db.transaction(async (tx) => {
      const values = {
        maxFiles: parsed.data.maxFiles,
        maxSizeMb: parsed.data.maxSizeMb,
        allowedMimeJson: parsed.data.allowedMimeJson,
        updatedBy: actor.id,
        updatedAt: new Date(),
      };
      let saved;
      if (existing) {
        [saved] = await tx
          .update(auditAttachmentPoliciesTable)
          .set(values)
          .where(eq(auditAttachmentPoliciesTable.level, level))
          .returning();
      } else {
        [saved] = await tx
          .insert(auditAttachmentPoliciesTable)
          .values({ id: newId(), level, ...values })
          .returning();
      }
      await writeConfigChange(tx, {
        entityType: "ATTACHMENT_POLICY",
        entityId: level,
        actorId: actor.id,
        actorRole: actor.role,
        before: existing ?? null,
        after: saved,
      });
      return saved!;
    });
    res.json({ success: true, data: row });
  },
);

/* ── Bank candidates: ad-hoc question accept/reject (D-4) ──────────────────── */

router.get(
  "/bank-candidates",
  authenticate,
  authorize("AUDIT_ADMIN", "view"),
  async (req, res) => {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const status = req.query["status"] ? String(req.query["status"]).toUpperCase() : undefined;
    const where = status ? eq(auditBankCandidatesTable.status, status) : undefined;

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditBankCandidatesTable)
      .where(where);
    const rows = await db
      .select({
        candidate: auditBankCandidatesTable,
        prompt: auditQuestionsTable.prompt,
        type: auditQuestionsTable.type,
        weight: auditQuestionsTable.weight,
        evidenceRule: auditQuestionsTable.evidenceRule,
        proposerName: usersTable.name,
        ticketNo: auditsTable.ticketNo,
      })
      .from(auditBankCandidatesTable)
      .innerJoin(auditQuestionsTable, eq(auditQuestionsTable.id, auditBankCandidatesTable.questionId))
      .leftJoin(usersTable, eq(usersTable.id, auditBankCandidatesTable.proposedBy))
      .leftJoin(auditsTable, eq(auditsTable.id, auditBankCandidatesTable.auditId))
      .where(where)
      .orderBy(desc(auditBankCandidatesTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: rows.map((r) => ({
        ...r.candidate,
        prompt: r.prompt,
        type: r.type,
        weight: r.weight,
        evidenceRule: r.evidenceRule,
        proposerName: r.proposerName,
        ticketNo: r.ticketNo,
      })),
      meta: buildMeta(countRow?.count ?? 0, page, limit),
    });
  },
);

async function loadPendingCandidate(id: string) {
  const [candidate] = await db
    .select()
    .from(auditBankCandidatesTable)
    .where(eq(auditBankCandidatesTable.id, id));
  if (!candidate) throw httpError(404, "Bank candidate not found");
  if (candidate.status !== "PENDING") {
    throw httpError(409, "Candidate already decided", { status: candidate.status });
  }
  return candidate;
}

/** Accept: copy the ad-hoc question into the bank (copy-on-insert, FRD-QBK-03). */
router.post(
  "/bank-candidates/:id/accept",
  authenticate,
  authorize("AUDIT_ADMIN", "edit"),
  async (req, res) => {
    const candidate = await loadPendingCandidate(req.params["id"] as string);
    const [question] = await db
      .select()
      .from(auditQuestionsTable)
      .where(eq(auditQuestionsTable.id, candidate.questionId));
    if (!question) throw httpError(500, "Candidate question missing");

    const actor = auditActor(req);
    const result = await db.transaction(async (tx) => {
      const [bankItem] = await tx
        .insert(auditQuestionBankItemsTable)
        .values({
          id: newId(),
          prompt: question.prompt,
          helpText: question.helpText,
          type: question.type,
          defaultWeight: question.weight,
          defaultEvidenceRule: question.evidenceRule,
          defaultAutoNcJson: question.autoNcJson,
          tags: ["ad-hoc"],
          numericUnit: question.numericUnit,
          numericMin: question.numericMin,
          numericMax: question.numericMax,
          createdBy: actor.id,
        })
        .returning();
      const [updated] = await tx
        .update(auditBankCandidatesTable)
        .set({
          status: "ACCEPTED",
          decidedBy: actor.id,
          decidedAt: new Date(),
          resultingBankItemId: bankItem!.id,
        })
        .where(eq(auditBankCandidatesTable.id, candidate.id))
        .returning();
      await writeConfigChange(tx, {
        entityType: "BANK_CANDIDATE",
        entityId: candidate.id,
        actorId: actor.id,
        actorRole: actor.role,
        before: candidate,
        after: updated,
        reason: `Accepted into question bank as ${bankItem!.id}`,
      });
      return { candidate: updated!, bankItem: bankItem! };
    });
    res.json({ success: true, data: result });
  },
);

router.post(
  "/bank-candidates/:id/reject",
  authenticate,
  authorize("AUDIT_ADMIN", "edit"),
  async (req, res) => {
    const candidate = await loadPendingCandidate(req.params["id"] as string);
    const actor = auditActor(req);
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(auditBankCandidatesTable)
        .set({ status: "REJECTED", decidedBy: actor.id, decidedAt: new Date() })
        .where(eq(auditBankCandidatesTable.id, candidate.id))
        .returning();
      await writeConfigChange(tx, {
        entityType: "BANK_CANDIDATE",
        entityId: candidate.id,
        actorId: actor.id,
        actorRole: actor.role,
        before: candidate,
        after: row,
        reason: (req.body?.reason as string) ?? "Rejected",
      });
      return row!;
    });
    res.json({ success: true, data: updated });
  },
);

/* ── Trail explorer (FR-AD-09, FRD-TRL-03) ─────────────────────────────────── */

router.get(
  "/events",
  authenticate,
  authorize("AUDIT_TRAIL", "view"),
  async (req, res) => {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const q = req.query as Record<string, string | undefined>;

    const conditions = [];
    if (q["entityType"]) conditions.push(eq(auditEventsTable.entityType, q["entityType"]));
    if (q["entityId"]) conditions.push(eq(auditEventsTable.entityId, q["entityId"]));
    if (q["auditId"]) conditions.push(eq(auditEventsTable.auditId, q["auditId"]));
    if (q["actorId"]) conditions.push(eq(auditEventsTable.actorId, q["actorId"]));
    if (q["kind"]) conditions.push(eq(auditEventsTable.kind, q["kind"] as never));
    if (q["from"]) conditions.push(gte(auditEventsTable.createdAt, new Date(q["from"])));
    if (q["to"]) {
      const to = new Date(q["to"]);
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(auditEventsTable.createdAt, to));
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditEventsTable)
      .where(where);
    const rows = await db
      .select({
        event: auditEventsTable,
        actorName: usersTable.name,
      })
      .from(auditEventsTable)
      .leftJoin(usersTable, eq(usersTable.id, auditEventsTable.actorId))
      .where(where)
      .orderBy(desc(auditEventsTable.seq))
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: rows.map((r) => ({ ...r.event, actorName: r.actorName ?? (r.event.actorId ? null : "System") })),
      meta: buildMeta(countRow?.count ?? 0, page, limit),
    });
  },
);

router.get(
  "/events/facets",
  authenticate,
  authorize("AUDIT_TRAIL", "view"),
  async (_req, res) => {
    const entityTypes = await db
      .selectDistinct({ v: auditEventsTable.entityType })
      .from(auditEventsTable);
    const kinds = await db
      .selectDistinct({ v: auditEventsTable.kind })
      .from(auditEventsTable);
    res.json({
      success: true,
      data: {
        entityTypes: entityTypes.map((r) => r.v).sort(),
        kinds: kinds.map((r) => r.v).sort(),
      },
    });
  },
);

/** Chain-verify indicator (FR-AD-09): recomputes every hash in seq order. */
router.get(
  "/events/verify-chain",
  authenticate,
  authorize("AUDIT_TRAIL", "view"),
  async (_req, res) => {
    const result = await verifyChain();
    res.json({ success: true, data: result });
  },
);

router.get(
  "/events/export",
  authenticate,
  authorize("AUDIT_TRAIL", "view"),
  async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const conditions = [];
    if (q["entityType"]) conditions.push(eq(auditEventsTable.entityType, q["entityType"]));
    if (q["from"]) conditions.push(gte(auditEventsTable.createdAt, new Date(q["from"])));
    if (q["to"]) {
      const to = new Date(q["to"]);
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(auditEventsTable.createdAt, to));
    }
    const rows = await db
      .select()
      .from(auditEventsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditEventsTable.seq))
      .limit(10000);

    const header = ["seq", "createdAt", "entityType", "entityId", "auditId", "actorId", "actorRole", "kind", "fromState", "toState", "reason", "hash"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [r.seq, r.createdAt.toISOString(), r.entityType, r.entityId, r.auditId ?? "", r.actorId ?? "system", r.actorRole ?? "", r.kind, r.fromState ?? "", r.toState ?? "", r.reason ?? "", r.hash]
          .map(csvEsc)
          .join(","),
      );
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="audit-trail.csv"`);
    res.send(lines.join("\n"));
  },
);

export { router as auditAdminRouter };
