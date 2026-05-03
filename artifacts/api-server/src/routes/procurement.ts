import { Router } from "express";
import { db } from "@workspace/db";
import { vendorsTable, indentsTable, purchaseOrdersTable, grnTable, inventoryTable } from "@workspace/db";
import { eq, sql, ilike, and } from "drizzle-orm";
import { authenticate } from "../middlewares/auth.js";
import { getPagination, buildMeta } from "../lib/paginate.js";
import { newId } from "../lib/id.js";

// Vendors
export const vendorRouter = Router();
vendorRouter.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const search = req.query["search"] as string | undefined;
    const where = search ? ilike(vendorsTable.name, `%${search}%`) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(vendorsTable).where(where);
    const rows = await db.select().from(vendorsTable).where(where).limit(limit).offset(offset).orderBy(vendorsTable.createdAt);
    res.json({ success: true, data: rows, meta: buildMeta(countResult.count, page, limit) });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
vendorRouter.post("/", authenticate, async (req, res) => {
  try {
    const [row] = await db.insert(vendorsTable).values({ id: newId(), ...req.body, categories: req.body.categories || [], updatedAt: new Date() }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
vendorRouter.get("/:id", authenticate, async (req, res) => {
  try {
    const [row] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, req.params["id"]!));
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: row });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
vendorRouter.put("/:id", authenticate, async (req, res) => {
  try {
    const [row] = await db.update(vendorsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(vendorsTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: row });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

// Indents
export const indentRouter = Router();
indentRouter.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const propertyId = req.query["propertyId"] as string | undefined;
    const status = req.query["status"] as string | undefined;
    const conditions = [];
    if (propertyId) conditions.push(eq(indentsTable.propertyId, propertyId));
    if (status) conditions.push(eq(indentsTable.status, status as "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "PO_RAISED" | "DELIVERED"));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(indentsTable).where(where);
    const rows = await db.select().from(indentsTable).where(where).limit(limit).offset(offset).orderBy(indentsTable.createdAt);
    res.json({ success: true, data: rows, meta: buildMeta(countResult.count, page, limit) });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
indentRouter.post("/", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.insert(indentsTable).values({ id: newId(), ...body, createdBy: req.user!.id, updatedAt: new Date() }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
indentRouter.put("/:id", authenticate, async (req, res) => {
  try {
    const [row] = await db.update(indentsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(indentsTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: row });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

// Purchase Orders
export const poRouter = Router();
let poCounter = 1000;
poRouter.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const status = req.query["status"] as string | undefined;
    const where = status ? eq(purchaseOrdersTable.status, status as "DRAFT" | "SENT" | "ACKNOWLEDGED" | "PARTIAL_DELIVERY" | "DELIVERED" | "CANCELLED") : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(purchaseOrdersTable).where(where);
    const rows = await db.select().from(purchaseOrdersTable).where(where).limit(limit).offset(offset).orderBy(purchaseOrdersTable.createdAt);
    const enriched = await Promise.all(rows.map(async (r) => {
      const [v] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, r.vendorId));
      return { ...r, totalAmount: Number(r.totalAmount), vendorName: v?.name || null };
    }));
    res.json({ success: true, data: enriched, meta: buildMeta(countResult.count, page, limit) });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
poRouter.post("/", authenticate, async (req, res) => {
  try {
    poCounter++;
    const body = req.body;
    const [row] = await db.insert(purchaseOrdersTable).values({ id: newId(), poNumber: `PO-${String(poCounter).padStart(5, "0")}`, ...body, totalAmount: body.totalAmount.toString(), updatedAt: new Date() }).returning();
    const [v] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, row.vendorId));
    res.status(201).json({ success: true, data: { ...row, totalAmount: Number(row.totalAmount), vendorName: v?.name || null } });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
poRouter.put("/:id", authenticate, async (req, res) => {
  try {
    const body = req.body;
    if (body.totalAmount) body.totalAmount = body.totalAmount.toString();
    const [row] = await db.update(purchaseOrdersTable).set({ ...body, updatedAt: new Date() }).where(eq(purchaseOrdersTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    const [v] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, row.vendorId));
    res.json({ success: true, data: { ...row, totalAmount: Number(row.totalAmount), vendorName: v?.name || null } });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

// GRN
export const grnRouter = Router();
let grnCounter = 1000;
grnRouter.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(grnTable);
    const rows = await db.select().from(grnTable).limit(limit).offset(offset).orderBy(grnTable.createdAt);
    res.json({ success: true, data: rows, meta: buildMeta(countResult.count, page, limit) });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
grnRouter.post("/", authenticate, async (req, res) => {
  try {
    grnCounter++;
    const [row] = await db.insert(grnTable).values({ id: newId(), grnNumber: `GRN-${String(grnCounter).padStart(5, "0")}`, ...req.body, photos: req.body.photos || [], updatedAt: new Date() }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

// Inventory
export const inventoryRouter = Router();
inventoryRouter.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const search = req.query["search"] as string | undefined;
    const propertyId = req.query["propertyId"] as string | undefined;
    const category = req.query["category"] as string | undefined;
    const conditions = [];
    if (propertyId) conditions.push(eq(inventoryTable.propertyId, propertyId));
    if (category) conditions.push(eq(inventoryTable.category, category));
    if (search) conditions.push(ilike(inventoryTable.name, `%${search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(inventoryTable).where(where);
    const rows = await db.select().from(inventoryTable).where(where).limit(limit).offset(offset).orderBy(inventoryTable.createdAt);
    res.json({ success: true, data: rows.map(r => ({ ...r, currentStock: Number(r.currentStock), minStock: Number(r.minStock), unitCost: r.unitCost ? Number(r.unitCost) : null, isLowStock: Number(r.currentStock) <= Number(r.minStock) })), meta: buildMeta(countResult.count, page, limit) });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
inventoryRouter.post("/", authenticate, async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.insert(inventoryTable).values({ id: newId(), ...body, currentStock: body.currentStock?.toString() || "0", minStock: body.minStock?.toString() || "0", unitCost: body.unitCost?.toString(), updatedAt: new Date() }).returning();
    res.status(201).json({ success: true, data: { ...row, currentStock: Number(row.currentStock), minStock: Number(row.minStock), unitCost: row.unitCost ? Number(row.unitCost) : null, isLowStock: Number(row.currentStock) <= Number(row.minStock) } });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
inventoryRouter.put("/:id", authenticate, async (req, res) => {
  try {
    const body = req.body;
    if (body.currentStock !== undefined) body.currentStock = body.currentStock.toString();
    if (body.minStock !== undefined) body.minStock = body.minStock.toString();
    if (body.unitCost !== undefined) body.unitCost = body.unitCost?.toString();
    const [row] = await db.update(inventoryTable).set({ ...body, updatedAt: new Date() }).where(eq(inventoryTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, data: { ...row, currentStock: Number(row.currentStock), minStock: Number(row.minStock), unitCost: row.unitCost ? Number(row.unitCost) : null, isLowStock: Number(row.currentStock) <= Number(row.minStock) } });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
