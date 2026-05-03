import { Router } from "express";
import { db } from "@workspace/db";
import { coursesTable, courseEnrollmentsTable, employeesTable } from "@workspace/db";
import { eq, sql, ilike, and } from "drizzle-orm";
import { authenticate } from "../middlewares/auth.js";
import { getPagination, buildMeta } from "../lib/paginate.js";
import { newId } from "../lib/id.js";

export const coursesRouter = Router();
coursesRouter.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const search = req.query["search"] as string | undefined;
    const where = search ? ilike(coursesTable.title, `%${search}%`) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(coursesTable).where(where);
    const rows = await db.select().from(coursesTable).where(where).limit(limit).offset(offset).orderBy(coursesTable.createdAt);
    const enriched = await Promise.all(rows.map(async (r) => {
      const [e] = await db.select({ count: sql<number>`count(*)::int` }).from(courseEnrollmentsTable).where(eq(courseEnrollmentsTable.courseId, r.id));
      return { ...r, enrollmentCount: e.count || 0 };
    }));
    res.json({ success: true, data: enriched, meta: buildMeta(countResult.count, page, limit) });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
coursesRouter.post("/", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.insert(coursesTable).values({ id: newId(), ...body, targetRoles: body.targetRoles || [], expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined, updatedAt: new Date() }).returning();
    res.status(201).json({ success: true, data: { ...row, enrollmentCount: 0 } });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
coursesRouter.put("/:id", authenticate, async (req, res) => {
  try {
    const [row] = await db.update(coursesTable).set({ ...req.body, updatedAt: new Date() }).where(eq(coursesTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    const [e] = await db.select({ count: sql<number>`count(*)::int` }).from(courseEnrollmentsTable).where(eq(courseEnrollmentsTable.courseId, row.id));
    res.json({ success: true, data: { ...row, enrollmentCount: e.count || 0 } });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

export const enrollmentsRouter = Router();
enrollmentsRouter.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const courseId = req.query["courseId"] as string | undefined;
    const employeeId = req.query["employeeId"] as string | undefined;
    const conditions = [];
    if (courseId) conditions.push(eq(courseEnrollmentsTable.courseId, courseId));
    if (employeeId) conditions.push(eq(courseEnrollmentsTable.employeeId, employeeId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(courseEnrollmentsTable).where(where);
    const rows = await db.select().from(courseEnrollmentsTable).where(where).limit(limit).offset(offset).orderBy(courseEnrollmentsTable.createdAt);
    const enriched = await Promise.all(rows.map(async (r) => {
      const [c] = await db.select({ title: coursesTable.title }).from(coursesTable).where(eq(coursesTable.id, r.courseId));
      const [e] = await db.select({ name: employeesTable.name }).from(employeesTable).where(eq(employeesTable.id, r.employeeId));
      return { ...r, courseTitle: c?.title || null, employeeName: e?.name || null };
    }));
    res.json({ success: true, data: enriched, meta: buildMeta(countResult.count, page, limit) });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
enrollmentsRouter.post("/", authenticate, async (req, res) => {
  try {
    const [row] = await db.insert(courseEnrollmentsTable).values({ id: newId(), ...req.body, updatedAt: new Date() }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
enrollmentsRouter.put("/:id", authenticate, async (req, res) => {
  try {
    const body = req.body;
    if (body.completed && !body.completedAt) body.completedAt = new Date();
    const [row] = await db.update(courseEnrollmentsTable).set({ ...body, updatedAt: new Date() }).where(eq(courseEnrollmentsTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: row });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
