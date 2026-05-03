import { Router } from "express";
import { db, slaConfigTable, complaintRoutingTable, integrationStatusTable, auditLogTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authenticate } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";
import { newId } from "../lib/id.js";

export const settingsRouter = Router();

// SLA config
settingsRouter.get("/sla", authenticate, authorize("SETTINGS", "view"), async (_req, res) => {
  try {
    const rows = await db.select().from(slaConfigTable);
    res.json({ success: true, data: rows });
  } catch (err) { _req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

settingsRouter.put("/sla/:category", authenticate, authorize("SETTINGS", "edit"), async (req, res) => {
  try {
    const cat = req.params["category"] as string;
    const hours = Number(req.body?.slaHours);
    if (!hours) { res.status(400).json({ success: false, error: "slaHours is required" }); return; }
    const [existing] = await db.select().from(slaConfigTable).where(eq(slaConfigTable.category, cat));
    if (existing) {
      const [row] = await db.update(slaConfigTable).set({ slaHours: hours, updatedAt: new Date() }).where(eq(slaConfigTable.category, cat)).returning();
      res.json({ success: true, data: row });
    } else {
      const [row] = await db.insert(slaConfigTable).values({ id: newId(), category: cat, slaHours: hours, updatedAt: new Date() }).returning();
      res.json({ success: true, data: row });
    }
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

// Complaint routing
settingsRouter.get("/routing", authenticate, authorize("SETTINGS", "view"), async (_req, res) => {
  try {
    const rows = await db.select().from(complaintRoutingTable);
    res.json({ success: true, data: rows });
  } catch (err) { _req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

settingsRouter.post("/routing", authenticate, authorize("SETTINGS", "edit"), async (req, res) => {
  try {
    const { propertyId, category, assignedTo } = req.body || {};
    if (!propertyId || !category || !assignedTo) { res.status(400).json({ success: false, error: "propertyId, category, assignedTo are required" }); return; }
    const [row] = await db.insert(complaintRoutingTable).values({ id: newId(), propertyId, category, assignedTo, updatedAt: new Date() }).returning();
    res.json({ success: true, data: row });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

settingsRouter.delete("/routing/:id", authenticate, authorize("SETTINGS", "delete"), async (req, res) => {
  try {
    await db.delete(complaintRoutingTable).where(eq(complaintRoutingTable.id, req.params["id"] as string));
    res.json({ success: true });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

// Integrations
settingsRouter.get("/integrations", authenticate, authorize("SETTINGS", "view"), async (_req, res) => {
  try {
    const rows = await db.select().from(integrationStatusTable);
    const map: Record<string, { enabled: boolean; configured: boolean }> = {};
    for (const r of rows) map[r.name] = { enabled: r.enabled, configured: r.enabled };
    const builtins = [
      { name: "Razorpay", enabled: !!process.env["RAZORPAY_KEY_ID"], configured: !!process.env["RAZORPAY_KEY_ID"] },
      { name: "Twilio", enabled: !!process.env["TWILIO_AUTH_TOKEN"], configured: !!process.env["TWILIO_AUTH_TOKEN"] },
      { name: "SMTP", enabled: !!process.env["SMTP_HOST"], configured: !!process.env["SMTP_HOST"] },
    ];
    res.json({ success: true, data: builtins.map((b) => ({ ...b, ...map[b.name] })) });
  } catch (err) { _req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

// KYC Gate toggle (uses integration_status row "KYC_GATE")
settingsRouter.get("/kyc-gate", authenticate, authorize("SETTINGS", "view"), async (_req, res) => {
  try {
    const [row] = await db.select().from(integrationStatusTable).where(eq(integrationStatusTable.name, "KYC_GATE"));
    res.json({ success: true, data: { enabled: !!row?.enabled } });
  } catch (err) { _req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

settingsRouter.put("/kyc-gate", authenticate, authorize("SETTINGS", "edit"), async (req, res) => {
  try {
    const enabled = !!req.body?.enabled;
    const [existing] = await db.select().from(integrationStatusTable).where(eq(integrationStatusTable.name, "KYC_GATE"));
    if (existing) {
      await db.update(integrationStatusTable).set({ enabled, updatedAt: new Date() }).where(eq(integrationStatusTable.name, "KYC_GATE"));
    } else {
      await db.insert(integrationStatusTable).values({ id: newId(), name: "KYC_GATE", enabled, updatedAt: new Date() });
    }
    res.json({ success: true, data: { enabled } });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

// Audit log (SUPER_ADMIN only)
settingsRouter.get("/audit-log", authenticate, authorize("AUDIT_LOG", "view"), async (_req, res) => {
  try {
    const rows = await db.select({
      id: auditLogTable.id,
      action: auditLogTable.action,
      entity: auditLogTable.entity,
      entityId: auditLogTable.entityId,
      changes: auditLogTable.changes,
      createdAt: auditLogTable.createdAt,
      userId: auditLogTable.userId,
      userName: usersTable.name,
    })
      .from(auditLogTable)
      .leftJoin(usersTable, eq(auditLogTable.userId, usersTable.id))
      .orderBy(desc(auditLogTable.createdAt))
      .limit(200);
    res.json({ success: true, data: rows });
  } catch (err) { _req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});
