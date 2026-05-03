import { Router } from "express";
import { db } from "@workspace/db";
import { laundryBatchesTable, residentsTable, propertiesTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { authenticate } from "../middlewares/auth.js";
import { getPagination, buildMeta } from "../lib/paginate.js";
import { newId } from "../lib/id.js";

const router = Router();

let batchCounter = 1000;

async function enrichBatch(b: typeof laundryBatchesTable.$inferSelect) {
  const [r] = await db.select({ name: residentsTable.name, phone: residentsTable.phone }).from(residentsTable).where(eq(residentsTable.id, b.residentId));
  const [p] = await db.select({ name: propertiesTable.name }).from(propertiesTable).where(eq(propertiesTable.id, b.propertyId));
  const totalItems = Object.values(b.items || {}).reduce((sum, n) => sum + Number(n || 0), 0);
  return { ...b, residentName: r?.name || null, residentPhone: r?.phone || null, propertyName: p?.name || null, totalItems };
}

router.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const propertyId = req.query["propertyId"] as string | undefined;
    const status = req.query["status"] as string | undefined;
    const conditions = [];
    if (propertyId) conditions.push(eq(laundryBatchesTable.propertyId, propertyId));
    if (status) conditions.push(eq(laundryBatchesTable.status, status as "RECEIVED" | "IN_WASH" | "READY" | "PICKED_UP" | "DAMAGED"));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(laundryBatchesTable).where(where);
    const rows = await db.select().from(laundryBatchesTable).where(where).limit(limit).offset(offset).orderBy(laundryBatchesTable.createdAt);
    const enriched = await Promise.all(rows.map(enrichBatch));
    res.json({ success: true, data: enriched, meta: buildMeta(countResult.count, page, limit) });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

router.post("/", authenticate, async (req, res) => {
  try {
    const body = req.body;
    batchCounter++;
    const [resident] = await db.select().from(residentsTable).where(eq(residentsTable.id, body.residentId));
    if (!resident) { res.status(400).json({ success: false, error: "Resident not found" }); return; }
    const [row] = await db.insert(laundryBatchesTable).values({
      id: newId(),
      batchNo: `LB-${String(batchCounter).padStart(5, "0")}`,
      residentId: body.residentId,
      propertyId: resident.propertyId,
      dropDate: body.dropDate ? new Date(body.dropDate) : new Date(),
      commitTatDays: body.commitTatDays || 2,
      items: body.items || {},
      specialInstructions: body.specialInstructions,
      damageNote: body.damageNote,
      status: body.status || "RECEIVED",
      createdBy: req.user?.id,
      updatedAt: new Date(),
    }).returning();
    res.status(201).json({ success: true, data: await enrichBatch(row) });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const [row] = await db.select().from(laundryBatchesTable).where(eq(laundryBatchesTable.id, req.params["id"]!));
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: await enrichBatch(row) });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

router.put("/:id", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ["status", "items", "specialInstructions", "damageNote", "commitTatDays"]) {
      if (k in body) updateData[k] = body[k];
    }
    if (body.status === "PICKED_UP") updateData["pickedUpAt"] = new Date();
    const [row] = await db.update(laundryBatchesTable).set(updateData as Partial<typeof laundryBatchesTable.$inferInsert>).where(eq(laundryBatchesTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: await enrichBatch(row) });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

router.delete("/:id", authenticate, async (req, res) => {
  try {
    await db.delete(laundryBatchesTable).where(eq(laundryBatchesTable.id, req.params["id"]!));
    res.json({ success: true, message: "Deleted" });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

export default router;
