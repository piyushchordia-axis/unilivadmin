import { Router } from "express";
import { db } from "@workspace/db";
import { complaintsTable, escalationsTable, residentsTable, propertiesTable } from "@workspace/db";
import { eq, sql, ilike, or, and } from "drizzle-orm";
import { authenticate } from "../middlewares/auth.js";
import { getPagination, buildMeta } from "../lib/paginate.js";
import { newId } from "../lib/id.js";

const router = Router();

let ticketCounter = 1000;

async function enrichComplaint(c: typeof complaintsTable.$inferSelect) {
  let residentName: string | null = null;
  let propertyName: string | null = null;
  if (c.residentId) {
    const [r] = await db.select({ name: residentsTable.name }).from(residentsTable).where(eq(residentsTable.id, c.residentId));
    residentName = r?.name || null;
  }
  if (c.propertyId) {
    const [p] = await db.select({ name: propertiesTable.name }).from(propertiesTable).where(eq(propertiesTable.id, c.propertyId));
    propertyName = p?.name || null;
  }
  return { ...c, residentName, propertyName };
}

router.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const propertyId = req.query["propertyId"] as string | undefined;
    const status = req.query["status"] as string | undefined;
    const priority = req.query["priority"] as string | undefined;
    const search = req.query["search"] as string | undefined;

    const conditions = [];
    if (propertyId) conditions.push(eq(complaintsTable.propertyId, propertyId));
    if (status) conditions.push(eq(complaintsTable.status, status as "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "REOPENED"));
    if (priority) conditions.push(eq(complaintsTable.priority, priority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"));
    if (search) conditions.push(or(ilike(complaintsTable.title, `%${search}%`), ilike(complaintsTable.ticketNo, `%${search}%`))!);

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(complaintsTable).where(where);
    const rows = await db.select().from(complaintsTable).where(where).limit(limit).offset(offset).orderBy(complaintsTable.createdAt);

    const enriched = await Promise.all(rows.map(enrichComplaint));
    res.json({ success: true, data: enriched, meta: buildMeta(countResult.count, page, limit) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/", authenticate, async (req, res) => {
  try {
    const body = req.body;
    ticketCounter++;
    const ticketNo = `TKT-${String(ticketCounter).padStart(5, "0")}`;
    const slaDeadline = new Date(Date.now() + (body.slaHours || 24) * 60 * 60 * 1000);
    const [row] = await db.insert(complaintsTable).values({
      id: newId(),
      propertyId: body.propertyId,
      residentId: body.residentId,
      ticketNo,
      category: body.category,
      subCategory: body.subCategory,
      title: body.title,
      description: body.description,
      priority: body.priority || "MEDIUM",
      assignedTo: body.assignedTo,
      slaHours: body.slaHours || 24,
      slaDeadline,
      updatedAt: new Date(),
    }).returning();
    res.status(201).json({ success: true, data: await enrichComplaint(row) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const [row] = await db.select().from(complaintsTable).where(eq(complaintsTable.id, req.params["id"]!));
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: await enrichComplaint(row) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.put("/:id", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status) updateData["status"] = body.status;
    if (body.priority) updateData["priority"] = body.priority;
    if (body.assignedTo !== undefined) updateData["assignedTo"] = body.assignedTo;
    if (body.resolutionNote) updateData["resolutionNote"] = body.resolutionNote;
    if (body.rating !== undefined) updateData["rating"] = body.rating;
    if (body.status === "RESOLVED") updateData["resolvedAt"] = new Date();

    const [row] = await db.update(complaintsTable).set(updateData as Partial<typeof complaintsTable.$inferInsert>).where(eq(complaintsTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: await enrichComplaint(row) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Escalations
router.post("/escalations", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.insert(escalationsTable).values({ id: newId(), ...body }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
