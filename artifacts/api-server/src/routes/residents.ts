import { Router } from "express";
import { db } from "@workspace/db";
import { residentsTable, ledgerEntriesTable, paymentsTable, propertiesTable, roomsTable } from "@workspace/db";
import { eq, sql, ilike, or, and } from "drizzle-orm";
import { authenticate } from "../middlewares/auth.js";
import { getPagination, buildMeta } from "../lib/paginate.js";
import { newId } from "../lib/id.js";

const router = Router();

async function enrichResident(r: typeof residentsTable.$inferSelect) {
  let propertyName: string | null = null;
  let roomNumber: string | null = null;
  if (r.propertyId) {
    const [p] = await db.select({ name: propertiesTable.name }).from(propertiesTable).where(eq(propertiesTable.id, r.propertyId));
    propertyName = p?.name || null;
  }
  if (r.roomId) {
    const [rm] = await db.select({ number: roomsTable.number }).from(roomsTable).where(eq(roomsTable.id, r.roomId));
    roomNumber = rm?.number || null;
  }
  return { ...r, monthlyRent: r.monthlyRent ? Number(r.monthlyRent) : null, securityDeposit: r.securityDeposit ? Number(r.securityDeposit) : null, propertyName, roomNumber };
}

router.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const search = req.query["search"] as string | undefined;
    const propertyId = req.query["propertyId"] as string | undefined;
    const status = req.query["status"] as string | undefined;

    const conditions = [];
    if (propertyId) conditions.push(eq(residentsTable.propertyId, propertyId));
    if (status) conditions.push(eq(residentsTable.status, status as "ACTIVE" | "CHECKED_OUT" | "NOTICE_PERIOD"));
    if (search) conditions.push(or(ilike(residentsTable.name, `%${search}%`), ilike(residentsTable.email, `%${search}%`), ilike(residentsTable.phone, `%${search}%`))!);

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(residentsTable).where(where);
    const rows = await db.select().from(residentsTable).where(where).limit(limit).offset(offset).orderBy(residentsTable.createdAt);

    const enriched = await Promise.all(rows.map(enrichResident));
    res.json({ success: true, data: enriched, meta: buildMeta(countResult.count, page, limit) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.insert(residentsTable).values({
      id: newId(),
      propertyId: body.propertyId,
      roomId: body.roomId,
      name: body.name,
      email: body.email,
      phone: body.phone,
      dob: body.dob ? new Date(body.dob) : undefined,
      gender: body.gender,
      college: body.college,
      course: body.course,
      parentName: body.parentName,
      parentPhone: body.parentPhone,
      parentEmail: body.parentEmail,
      dietaryPref: body.dietaryPref || [],
      allergies: body.allergies || [],
      checkInDate: body.checkInDate ? new Date(body.checkInDate) : undefined,
      checkOutDate: body.checkOutDate ? new Date(body.checkOutDate) : undefined,
      planType: body.planType,
      monthlyRent: body.monthlyRent?.toString(),
      securityDeposit: body.securityDeposit?.toString(),
      status: body.status || "ACTIVE",
      updatedAt: new Date(),
    }).returning();
    res.status(201).json({ success: true, data: await enrichResident(row) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const [row] = await db.select().from(residentsTable).where(eq(residentsTable.id, req.params["id"]!));
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: await enrichResident(row) });
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
      if (["dob","checkInDate","checkOutDate"].includes(k) && v) updateData[k === "dob" ? "dob" : k === "checkInDate" ? "checkInDate" : "checkOutDate"] = new Date(v as string);
      else if (["monthlyRent","securityDeposit"].includes(k)) updateData[k] = v?.toString();
      else updateData[k] = v;
    }
    const [row] = await db.update(residentsTable).set(updateData as Partial<typeof residentsTable.$inferInsert>).where(eq(residentsTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: await enrichResident(row) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.delete("/:id", authenticate, async (req, res) => {
  try {
    await db.delete(residentsTable).where(eq(residentsTable.id, req.params["id"]!));
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Ledger
router.get("/:id/ledger", authenticate, async (req, res) => {
  try {
    const rows = await db.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.residentId, req.params["id"]!)).orderBy(ledgerEntriesTable.createdAt);
    res.json({ success: true, data: rows.map(r => ({ ...r, amount: Number(r.amount) })) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/:id/ledger", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.insert(ledgerEntriesTable).values({
      id: newId(),
      residentId: req.params["id"]!,
      type: body.type,
      amount: body.amount.toString(),
      description: body.description,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      isPaid: body.isPaid || false,
      reference: body.reference,
      createdBy: req.user?.id,
      updatedAt: new Date(),
    }).returning();
    res.status(201).json({ success: true, data: { ...row, amount: Number(row.amount) } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Payments
router.get("/:id/payments", authenticate, async (req, res) => {
  try {
    const rows = await db.select().from(paymentsTable).where(eq(paymentsTable.residentId, req.params["id"]!)).orderBy(paymentsTable.createdAt);
    res.json({ success: true, data: rows.map(r => ({ ...r, amount: Number(r.amount) })) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/:id/payments", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.insert(paymentsTable).values({
      id: newId(),
      residentId: req.params["id"]!,
      amount: body.amount.toString(),
      mode: body.mode,
      status: body.status || "PENDING",
      reference: body.reference,
      notes: body.notes,
      updatedAt: new Date(),
    }).returning();
    res.status(201).json({ success: true, data: { ...row, amount: Number(row.amount) } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
