import { Router } from "express";
import { db } from "@workspace/db";
import { leadsTable, propertyLeadsTable, propertiesTable } from "@workspace/db";
import { eq, sql, ilike, or, and } from "drizzle-orm";
import { authenticate } from "../middlewares/auth.js";
import { getPagination, buildMeta } from "../lib/paginate.js";
import { newId } from "../lib/id.js";

export const leadsRouter = Router();

async function enrichLead(l: typeof leadsTable.$inferSelect) {
  let propertyName: string | null = null;
  if (l.propertyId) {
    const [p] = await db.select({ name: propertiesTable.name }).from(propertiesTable).where(eq(propertiesTable.id, l.propertyId));
    propertyName = p?.name || null;
  }
  return { ...l, propertyName };
}

leadsRouter.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const search = req.query["search"] as string | undefined;
    const stage = req.query["stage"] as string | undefined;
    const propertyId = req.query["propertyId"] as string | undefined;
    const conditions = [];
    if (stage) conditions.push(eq(leadsTable.stage, stage as "NEW" | "CONTACTED" | "VISIT_SCHEDULED" | "VISIT_DONE" | "NEGOTIATING" | "CONVERTED" | "LOST"));
    if (propertyId) conditions.push(eq(leadsTable.propertyId, propertyId));
    if (search) conditions.push(or(ilike(leadsTable.name, `%${search}%`), ilike(leadsTable.phone, `%${search}%`))!);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(leadsTable).where(where);
    const rows = await db.select().from(leadsTable).where(where).limit(limit).offset(offset).orderBy(leadsTable.createdAt);
    const enriched = await Promise.all(rows.map(enrichLead));
    res.json({ success: true, data: enriched, meta: buildMeta(countResult.count, page, limit) });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
leadsRouter.post("/", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.insert(leadsTable).values({ id: newId(), ...body, visitDate: body.visitDate ? new Date(body.visitDate) : undefined, followUpAt: body.followUpAt ? new Date(body.followUpAt) : undefined, updatedAt: new Date() }).returning();
    res.status(201).json({ success: true, data: await enrichLead(row) });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
leadsRouter.get("/:id", authenticate, async (req, res) => {
  try {
    const [row] = await db.select().from(leadsTable).where(eq(leadsTable.id, req.params["id"]!));
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: await enrichLead(row) });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
leadsRouter.put("/:id", authenticate, async (req, res) => {
  try {
    const body = req.body;
    if (body.visitDate) body.visitDate = new Date(body.visitDate);
    if (body.followUpAt) body.followUpAt = new Date(body.followUpAt);
    const [row] = await db.update(leadsTable).set({ ...body, updatedAt: new Date() }).where(eq(leadsTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: await enrichLead(row) });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
leadsRouter.delete("/:id", authenticate, async (req, res) => {
  try {
    await db.delete(leadsTable).where(eq(leadsTable.id, req.params["id"]!));
    res.json({ success: true, message: "Deleted" });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

export const propertyLeadsRouter = Router();
propertyLeadsRouter.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const search = req.query["search"] as string | undefined;
    const stage = req.query["stage"] as string | undefined;
    const conditions = [];
    if (stage) conditions.push(eq(propertyLeadsTable.stage, stage));
    if (search) conditions.push(or(ilike(propertyLeadsTable.name, `%${search}%`), ilike(propertyLeadsTable.city, `%${search}%`))!);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(propertyLeadsTable).where(where);
    const rows = await db.select().from(propertyLeadsTable).where(where).limit(limit).offset(offset).orderBy(propertyLeadsTable.createdAt);
    res.json({ success: true, data: rows.map(r => ({ ...r, askingRent: r.askingRent ? Number(r.askingRent) : null })), meta: buildMeta(countResult.count, page, limit) });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
propertyLeadsRouter.post("/", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.insert(propertyLeadsTable).values({ id: newId(), ...body, askingRent: body.askingRent?.toString(), updatedAt: new Date() }).returning();
    res.status(201).json({ success: true, data: { ...row, askingRent: row.askingRent ? Number(row.askingRent) : null } });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
propertyLeadsRouter.put("/:id", authenticate, async (req, res) => {
  try {
    const body = req.body;
    if (body.askingRent !== undefined) body.askingRent = body.askingRent?.toString();
    const [row] = await db.update(propertyLeadsTable).set({ ...body, updatedAt: new Date() }).where(eq(propertyLeadsTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: { ...row, askingRent: row.askingRent ? Number(row.askingRent) : null } });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
