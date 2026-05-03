import { Router } from "express";
import { db } from "@workspace/db";
import { recipesTable, menuPlansTable } from "@workspace/db";
import { eq, sql, ilike } from "drizzle-orm";
import { authenticate } from "../middlewares/auth.js";
import { getPagination, buildMeta } from "../lib/paginate.js";
import { newId } from "../lib/id.js";

export const recipesRouter = Router();
recipesRouter.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const search = req.query["search"] as string | undefined;
    const where = search ? ilike(recipesTable.name, `%${search}%`) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(recipesTable).where(where);
    const rows = await db.select().from(recipesTable).where(where).limit(limit).offset(offset).orderBy(recipesTable.createdAt);
    res.json({ success: true, data: rows, meta: buildMeta(countResult.count, page, limit) });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
recipesRouter.post("/", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.insert(recipesTable).values({ id: newId(), ...body, allergens: body.allergens || [], updatedAt: new Date() }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
recipesRouter.put("/:id", authenticate, async (req, res) => {
  try {
    const [row] = await db.update(recipesTable).set({ ...req.body, updatedAt: new Date() }).where(eq(recipesTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: row });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
recipesRouter.delete("/:id", authenticate, async (req, res) => {
  try {
    await db.delete(recipesTable).where(eq(recipesTable.id, req.params["id"]!));
    res.json({ success: true, message: "Deleted" });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

export const menuPlansRouter = Router();
menuPlansRouter.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const propertyId = req.query["propertyId"] as string | undefined;
    const where = propertyId ? eq(menuPlansTable.propertyId, propertyId) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(menuPlansTable).where(where);
    const rows = await db.select().from(menuPlansTable).where(where).limit(limit).offset(offset).orderBy(menuPlansTable.weekStart);
    res.json({ success: true, data: rows, meta: buildMeta(countResult.count, page, limit) });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
menuPlansRouter.post("/", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.insert(menuPlansTable).values({ id: newId(), ...body, weekStart: new Date(body.weekStart), updatedAt: new Date() }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
menuPlansRouter.put("/:id", authenticate, async (req, res) => {
  try {
    const body = req.body;
    if (body.weekStart) body.weekStart = new Date(body.weekStart);
    const [row] = await db.update(menuPlansTable).set({ ...body, updatedAt: new Date() }).where(eq(menuPlansTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: row });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
