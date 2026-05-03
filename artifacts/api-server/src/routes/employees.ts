import { Router } from "express";
import { db } from "@workspace/db";
import { employeesTable, attendanceTable, leavesTable, jobRequisitionsTable, candidatesTable } from "@workspace/db";
import { eq, sql, ilike, or, and } from "drizzle-orm";
import { authenticate } from "../middlewares/auth.js";
import { getPagination, buildMeta } from "../lib/paginate.js";
import { newId } from "../lib/id.js";

const router = Router();

let empCounter = 100;

// Employees
router.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const search = req.query["search"] as string | undefined;
    const department = req.query["department"] as string | undefined;
    const status = req.query["status"] as string | undefined;
    const propertyId = req.query["propertyId"] as string | undefined;

    const conditions = [];
    if (department) conditions.push(eq(employeesTable.department, department));
    if (status) conditions.push(eq(employeesTable.status, status as "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "EXITED"));
    if (propertyId) conditions.push(eq(employeesTable.propertyId, propertyId));
    if (search) conditions.push(or(ilike(employeesTable.name, `%${search}%`), ilike(employeesTable.email, `%${search}%`), ilike(employeesTable.employeeCode, `%${search}%`))!);

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(employeesTable).where(where);
    const rows = await db.select().from(employeesTable).where(where).limit(limit).offset(offset).orderBy(employeesTable.createdAt);
    res.json({ success: true, data: rows.map(r => ({ ...r, ctc: r.ctc ? Number(r.ctc) : null })), meta: buildMeta(countResult.count, page, limit) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/", authenticate, async (req, res) => {
  try {
    empCounter++;
    const body = req.body;
    const [row] = await db.insert(employeesTable).values({
      id: newId(),
      employeeCode: `EMP-${String(empCounter).padStart(4, "0")}`,
      name: body.name,
      email: body.email,
      phone: body.phone,
      dob: body.dob ? new Date(body.dob) : undefined,
      gender: body.gender,
      department: body.department,
      designation: body.designation,
      propertyId: body.propertyId,
      managerId: body.managerId,
      joiningDate: new Date(body.joiningDate),
      ctc: body.ctc?.toString(),
      bankAccount: body.bankAccount,
      ifscCode: body.ifscCode,
      panNumber: body.panNumber,
      status: body.status || "ACTIVE",
      updatedAt: new Date(),
    }).returning();
    res.status(201).json({ success: true, data: { ...row, ctc: row.ctc ? Number(row.ctc) : null } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const [row] = await db.select().from(employeesTable).where(eq(employeesTable.id, req.params["id"]!));
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: { ...row, ctc: row.ctc ? Number(row.ctc) : null } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.put("/:id", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(body)) {
      if (k === "dob" && v) updateData["dob"] = new Date(v as string);
      else if (k === "joiningDate" && v) updateData["joiningDate"] = new Date(v as string);
      else if (k === "ctc") updateData["ctc"] = v?.toString();
      else updateData[k] = v;
    }
    const [row] = await db.update(employeesTable).set(updateData as Partial<typeof employeesTable.$inferInsert>).where(eq(employeesTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: { ...row, ctc: row.ctc ? Number(row.ctc) : null } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.delete("/:id", authenticate, async (req, res) => {
  try {
    await db.delete(employeesTable).where(eq(employeesTable.id, req.params["id"]!));
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export { router as employeeRouter };

// Attendance
const attendanceRouter = Router();

attendanceRouter.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const employeeId = req.query["employeeId"] as string | undefined;

    const where = employeeId ? eq(attendanceTable.employeeId, employeeId) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(attendanceTable).where(where);
    const rows = await db.select().from(attendanceTable).where(where).limit(limit).offset(offset).orderBy(attendanceTable.date);

    const enriched = await Promise.all(rows.map(async (r) => {
      const [emp] = await db.select({ name: employeesTable.name }).from(employeesTable).where(eq(employeesTable.id, r.employeeId));
      return { ...r, employeeName: emp?.name || null };
    }));
    res.json({ success: true, data: enriched, meta: buildMeta(countResult.count, page, limit) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

attendanceRouter.post("/", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.insert(attendanceTable).values({
      id: newId(),
      employeeId: body.employeeId,
      date: new Date(body.date),
      status: body.status,
      inTime: body.inTime ? new Date(body.inTime) : undefined,
      outTime: body.outTime ? new Date(body.outTime) : undefined,
      notes: body.notes,
    }).returning();
    const [emp] = await db.select({ name: employeesTable.name }).from(employeesTable).where(eq(employeesTable.id, row.employeeId));
    res.status(201).json({ success: true, data: { ...row, employeeName: emp?.name || null } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

attendanceRouter.put("/:id", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.update(attendanceTable).set({ ...body, date: body.date ? new Date(body.date) : undefined }).where(eq(attendanceTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    const [emp] = await db.select({ name: employeesTable.name }).from(employeesTable).where(eq(employeesTable.id, row.employeeId));
    res.json({ success: true, data: { ...row, employeeName: emp?.name || null } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export { attendanceRouter };

// Leaves
const leavesRouter = Router();

leavesRouter.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const employeeId = req.query["employeeId"] as string | undefined;
    const status = req.query["status"] as string | undefined;

    const conditions = [];
    if (employeeId) conditions.push(eq(leavesTable.employeeId, employeeId));
    if (status) conditions.push(eq(leavesTable.status, status as "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(leavesTable).where(where);
    const rows = await db.select().from(leavesTable).where(where).limit(limit).offset(offset).orderBy(leavesTable.createdAt);
    const enriched = await Promise.all(rows.map(async (r) => {
      const [emp] = await db.select({ name: employeesTable.name }).from(employeesTable).where(eq(employeesTable.id, r.employeeId));
      return { ...r, employeeName: emp?.name || null };
    }));
    res.json({ success: true, data: enriched, meta: buildMeta(countResult.count, page, limit) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

leavesRouter.post("/", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.insert(leavesTable).values({
      id: newId(),
      employeeId: body.employeeId,
      type: body.type,
      fromDate: new Date(body.fromDate),
      toDate: new Date(body.toDate),
      days: body.days,
      reason: body.reason,
      updatedAt: new Date(),
    }).returning();
    const [emp] = await db.select({ name: employeesTable.name }).from(employeesTable).where(eq(employeesTable.id, row.employeeId));
    res.status(201).json({ success: true, data: { ...row, employeeName: emp?.name || null } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

leavesRouter.put("/:id", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.update(leavesTable).set({ ...body, updatedAt: new Date() }).where(eq(leavesTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    const [emp] = await db.select({ name: employeesTable.name }).from(employeesTable).where(eq(employeesTable.id, row.employeeId));
    res.json({ success: true, data: { ...row, employeeName: emp?.name || null } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export { leavesRouter };

// Recruitment
const recruitmentRouter = Router();

recruitmentRouter.get("/job-requisitions", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(jobRequisitionsTable);
    const rows = await db.select().from(jobRequisitionsTable).limit(limit).offset(offset).orderBy(jobRequisitionsTable.createdAt);
    const enriched = await Promise.all(rows.map(async (r) => {
      const [c] = await db.select({ count: sql<number>`count(*)::int` }).from(candidatesTable).where(eq(candidatesTable.jobRequisitionId, r.id));
      return { ...r, candidateCount: c.count || 0 };
    }));
    res.json({ success: true, data: enriched, meta: buildMeta(countResult.count, page, limit) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

recruitmentRouter.post("/job-requisitions", authenticate, async (req, res) => {
  try {
    const [row] = await db.insert(jobRequisitionsTable).values({ id: newId(), ...req.body, updatedAt: new Date() }).returning();
    res.status(201).json({ success: true, data: { ...row, candidateCount: 0 } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

recruitmentRouter.get("/candidates", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const search = req.query["search"] as string | undefined;
    const stage = req.query["stage"] as string | undefined;

    const conditions = [];
    if (stage) conditions.push(eq(candidatesTable.stage, stage));
    if (search) conditions.push(or(ilike(candidatesTable.name, `%${search}%`), ilike(candidatesTable.email, `%${search}%`))!);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(candidatesTable).where(where);
    const rows = await db.select().from(candidatesTable).where(where).limit(limit).offset(offset).orderBy(candidatesTable.createdAt);
    res.json({ success: true, data: rows, meta: buildMeta(countResult.count, page, limit) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

recruitmentRouter.post("/candidates", authenticate, async (req, res) => {
  try {
    const [row] = await db.insert(candidatesTable).values({ id: newId(), ...req.body, updatedAt: new Date() }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

recruitmentRouter.put("/candidates/:id", authenticate, async (req, res) => {
  try {
    const [row] = await db.update(candidatesTable).set({ ...req.body, updatedAt: new Date() }).where(eq(candidatesTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: row });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export { recruitmentRouter };
export default router;
