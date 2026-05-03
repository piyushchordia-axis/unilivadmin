import { Router } from "express";
import { db } from "@workspace/db";
import { roomsTable, residentsTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { authenticate } from "../middlewares/auth.js";
import { getPagination, buildMeta } from "../lib/paginate.js";
import { newId } from "../lib/id.js";

const router = Router();

router.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const propertyId = req.query["propertyId"] as string | undefined;

    const where = propertyId ? eq(roomsTable.propertyId, propertyId) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(roomsTable).where(where);
    const rows = await db.select().from(roomsTable).where(where).limit(limit).offset(offset).orderBy(roomsTable.number);

    const withOccupancy = await Promise.all(rows.map(async (r) => {
      const [occ] = await db.select({ count: sql<number>`count(*)::int` }).from(residentsTable).where(and(eq(residentsTable.roomId, r.id), eq(residentsTable.status, "ACTIVE")));
      return { ...r, occupancy: occ.count || 0 };
    }));

    res.json({ success: true, data: withOccupancy, meta: buildMeta(countResult.count, page, limit) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.insert(roomsTable).values({ id: newId(), ...body, updatedAt: new Date() }).returning();
    res.status(201).json({ success: true, data: { ...row, occupancy: 0 } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const [row] = await db.select().from(roomsTable).where(eq(roomsTable.id, req.params["id"]!));
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    const [occ] = await db.select({ count: sql<number>`count(*)::int` }).from(residentsTable).where(and(eq(residentsTable.roomId, row.id), eq(residentsTable.status, "ACTIVE")));
    res.json({ success: true, data: { ...row, occupancy: occ.count || 0 } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.put("/:id", authenticate, async (req, res) => {
  try {
    const [row] = await db.update(roomsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(roomsTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    const [occ] = await db.select({ count: sql<number>`count(*)::int` }).from(residentsTable).where(and(eq(residentsTable.roomId, row.id), eq(residentsTable.status, "ACTIVE")));
    res.json({ success: true, data: { ...row, occupancy: occ.count || 0 } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.delete("/:id", authenticate, async (req, res) => {
  try {
    await db.delete(roomsTable).where(eq(roomsTable.id, req.params["id"]!));
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
