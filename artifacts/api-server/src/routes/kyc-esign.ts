import { Router } from "express";
import crypto from "node:crypto";
import {
  db,
  kycRequestsTable,
  esignRequestsTable,
  esignEventsTable,
  residentsTable,
  integrationStatusTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { authenticate } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";
import { newId } from "../lib/id.js";
import { getKYCProvider } from "../lib/kyc-providers.js";

export const kycRouter: Router = Router();
export const esignRouter: Router = Router();
export const esignPublicRouter: Router = Router();

// =====================================================================
// KYC
// =====================================================================

// List for a resident — mounted as /residents/:id/kyc
kycRouter.get("/residents/:id/kyc", authenticate, authorize("RESIDENTS", "view"), async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(kycRequestsTable)
      .where(eq(kycRequestsTable.residentId, req.params["id"] as string))
      .orderBy(desc(kycRequestsTable.createdAt));
    res.json({ success: true, data: rows });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Create
kycRouter.post("/residents/:id/kyc", authenticate, authorize("RESIDENTS", "edit"), async (req, res) => {
  try {
    const residentId = req.params["id"] as string;
    const [resident] = await db.select().from(residentsTable).where(eq(residentsTable.id, residentId));
    if (!resident) {
      res.status(404).json({ success: false, error: "Resident not found" });
      return;
    }
    const { idType, idNumber, idImageFront, idImageBack, selfieImage, provider } = req.body || {};
    if (!idType || !idNumber) {
      res.status(400).json({ success: false, error: "idType and idNumber are required" });
      return;
    }
    const adapter = getKYCProvider(provider);
    const verifyResult = await adapter.verify({
      idType,
      idNumber,
      idImageFront,
      idImageBack,
      selfieImage,
      residentName: resident.name,
    });
    const [row] = await db
      .insert(kycRequestsTable)
      .values({
        id: newId(),
        residentId,
        idType,
        idNumber,
        idImageFront: idImageFront || null,
        idImageBack: idImageBack || null,
        selfieImage: selfieImage || null,
        status: verifyResult.status,
        provider: adapter.name,
        providerRef: verifyResult.providerRef || null,
        providerData: (verifyResult.providerData as object | null) || null,
        rejectionReason: verifyResult.rejectionReason || null,
        reviewedBy: verifyResult.status !== "PENDING" ? req.user?.id ?? null : null,
        reviewedAt: verifyResult.status !== "PENDING" ? new Date() : null,
        createdBy: req.user?.id ?? null,
        updatedAt: new Date(),
      })
      .returning();
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Verify / reject — mounted as /kyc/:id/verify
kycRouter.post("/kyc/:id/verify", authenticate, authorize("RESIDENTS", "edit"), async (req, res) => {
  try {
    const id = req.params["id"] as string;
    const { status, rejectionReason } = req.body || {};
    if (!["VERIFIED", "REJECTED", "PENDING"].includes(status)) {
      res.status(400).json({ success: false, error: "status must be VERIFIED, REJECTED, or PENDING" });
      return;
    }
    if (status === "REJECTED" && !rejectionReason) {
      res.status(400).json({ success: false, error: "rejectionReason required when rejecting" });
      return;
    }
    const [row] = await db
      .update(kycRequestsTable)
      .set({
        status,
        rejectionReason: status === "REJECTED" ? rejectionReason : null,
        reviewedBy: req.user?.id ?? null,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(kycRequestsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ success: false, error: "Not found" });
      return;
    }
    res.json({ success: true, data: row });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

kycRouter.get("/kyc/:id", authenticate, authorize("RESIDENTS", "view"), async (req, res) => {
  try {
    const [row] = await db.select().from(kycRequestsTable).where(eq(kycRequestsTable.id, req.params["id"] as string));
    if (!row) {
      res.status(404).json({ success: false, error: "Not found" });
      return;
    }
    res.json({ success: true, data: row });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// =====================================================================
// E-Sign — admin
// =====================================================================

function clientIp(req: import("express").Request): string | null {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0]!.trim();
  return req.ip ?? null;
}

async function logEvent(
  esignRequestId: string,
  type: string,
  ip: string | null,
  userAgent: string | null,
  payload?: unknown,
) {
  await db.insert(esignEventsTable).values({
    id: newId(),
    esignRequestId,
    type,
    ip,
    userAgent,
    payload: (payload as object | null) ?? null,
  });
}

// List for a resident — mounted as /residents/:id/esign
esignRouter.get("/residents/:id/esign", authenticate, authorize("RESIDENTS", "view"), async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(esignRequestsTable)
      .where(eq(esignRequestsTable.residentId, req.params["id"] as string))
      .orderBy(desc(esignRequestsTable.createdAt));
    res.json({ success: true, data: rows.map((r) => ({ ...r, documentBody: undefined })) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Create — mounted as /residents/:id/esign
esignRouter.post("/residents/:id/esign", authenticate, authorize("RESIDENTS", "edit"), async (req, res) => {
  try {
    const residentId = req.params["id"] as string;
    const [resident] = await db.select().from(residentsTable).where(eq(residentsTable.id, residentId));
    if (!resident) {
      res.status(404).json({ success: false, error: "Resident not found" });
      return;
    }
    const { documentName, documentBody, signerEmail, signerPhone, expiresInDays } = req.body || {};
    if (!documentName || !documentBody) {
      res.status(400).json({ success: false, error: "documentName and documentBody are required" });
      return;
    }
    const token = crypto.randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + (Number(expiresInDays) || 14) * 86400000);
    const [row] = await db
      .insert(esignRequestsTable)
      .values({
        id: newId(),
        residentId,
        documentName,
        documentBody,
        signerEmail: signerEmail || resident.email || null,
        signerPhone: signerPhone || resident.phone || null,
        signerToken: token,
        status: "PENDING",
        expiresAt,
        createdBy: req.user?.id ?? null,
        updatedAt: new Date(),
      })
      .returning();
    await logEvent(row.id, "CREATED", clientIp(req), req.headers["user-agent"] ?? null, {
      by: req.user?.id,
      documentName,
    });
    const origin =
      req.headers["origin"] ||
      `${req.protocol}://${req.headers["host"]}`;
    res.status(201).json({
      success: true,
      data: { ...row, documentBody: undefined, signerUrl: `${origin}/esign/sign/${token}` },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Get one with events — mounted as /esign/:id
esignRouter.get("/esign/:id", authenticate, authorize("RESIDENTS", "view"), async (req, res) => {
  try {
    const id = req.params["id"] as string;
    const [row] = await db.select().from(esignRequestsTable).where(eq(esignRequestsTable.id, id));
    if (!row) {
      res.status(404).json({ success: false, error: "Not found" });
      return;
    }
    const events = await db
      .select()
      .from(esignEventsTable)
      .where(eq(esignEventsTable.esignRequestId, id))
      .orderBy(desc(esignEventsTable.createdAt));
    const origin =
      req.headers["origin"] || `${req.protocol}://${req.headers["host"]}`;
    res.json({
      success: true,
      data: { ...row, signerUrl: `${origin}/esign/sign/${row.signerToken}`, events },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Cancel / void — mounted as /esign/:id/void
esignRouter.post("/esign/:id/void", authenticate, authorize("RESIDENTS", "edit"), async (req, res) => {
  try {
    const id = req.params["id"] as string;
    const [row] = await db
      .update(esignRequestsTable)
      .set({ status: "VOIDED", updatedAt: new Date() })
      .where(eq(esignRequestsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ success: false, error: "Not found" });
      return;
    }
    await logEvent(id, "VOIDED", clientIp(req), req.headers["user-agent"] ?? null, { by: req.user?.id });
    res.json({ success: true, data: { ...row, documentBody: undefined } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// =====================================================================
// E-Sign — public signer endpoints (NO auth, token-gated)
// =====================================================================

esignPublicRouter.get("/sign/:token", async (req, res) => {
  try {
    const token = req.params["token"] as string;
    const [row] = await db.select().from(esignRequestsTable).where(eq(esignRequestsTable.signerToken, token));
    if (!row) {
      res.status(404).json({ success: false, error: "Invalid signing link" });
      return;
    }
    if (row.status === "SIGNED") {
      res.json({
        success: true,
        data: {
          documentName: row.documentName,
          documentBody: row.documentBody,
          status: row.status,
          signedAt: row.signedAt,
          signerName: row.signerName,
          signatureSvg: row.signatureSvg,
        },
      });
      return;
    }
    if (row.status === "VOIDED") {
      res.status(410).json({ success: false, error: "This signing link has been voided" });
      return;
    }
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      if (row.status !== "EXPIRED") {
        await db.update(esignRequestsTable).set({ status: "EXPIRED", updatedAt: new Date() }).where(eq(esignRequestsTable.id, row.id));
        await logEvent(row.id, "EXPIRED", clientIp(req), req.headers["user-agent"] ?? null);
      }
      res.status(410).json({ success: false, error: "This signing link has expired" });
      return;
    }
    // mark first-view
    if (row.status === "PENDING") {
      await db
        .update(esignRequestsTable)
        .set({ status: "VIEWED", viewedAt: new Date(), updatedAt: new Date() })
        .where(eq(esignRequestsTable.id, row.id));
      await logEvent(row.id, "VIEWED", clientIp(req), req.headers["user-agent"] ?? null);
    }
    res.json({
      success: true,
      data: {
        documentName: row.documentName,
        documentBody: row.documentBody,
        status: row.status === "PENDING" ? "VIEWED" : row.status,
        expiresAt: row.expiresAt,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

esignPublicRouter.post("/sign/:token", async (req, res) => {
  try {
    const token = req.params["token"] as string;
    const { signerName, signatureSvg } = req.body || {};
    if (!signerName || !signatureSvg) {
      res.status(400).json({ success: false, error: "signerName and signatureSvg are required" });
      return;
    }
    const [row] = await db.select().from(esignRequestsTable).where(eq(esignRequestsTable.signerToken, token));
    if (!row) {
      res.status(404).json({ success: false, error: "Invalid signing link" });
      return;
    }
    if (row.status === "SIGNED") {
      res.status(409).json({ success: false, error: "Document already signed" });
      return;
    }
    if (row.status === "VOIDED") {
      res.status(410).json({ success: false, error: "This signing link has been voided" });
      return;
    }
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      res.status(410).json({ success: false, error: "This signing link has expired" });
      return;
    }
    const ip = clientIp(req);
    const ua = req.headers["user-agent"] ?? null;
    const now = new Date();
    const [updated] = await db
      .update(esignRequestsTable)
      .set({
        status: "SIGNED",
        signedAt: now,
        signerName,
        signatureSvg,
        signerIp: ip,
        signerUserAgent: ua,
        updatedAt: now,
      })
      .where(eq(esignRequestsTable.id, row.id))
      .returning();
    await logEvent(row.id, "SIGNED", ip, ua, { signerName });
    res.json({
      success: true,
      data: {
        documentName: updated.documentName,
        status: updated.status,
        signedAt: updated.signedAt,
        signerName: updated.signerName,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// =====================================================================
// KYC gate toggle (uses integration_status row "KYC_GATE")
// =====================================================================

export async function isKycGateEnabled(): Promise<boolean> {
  const [row] = await db
    .select()
    .from(integrationStatusTable)
    .where(eq(integrationStatusTable.name, "KYC_GATE"));
  return !!row?.enabled;
}

export async function residentMeetsActivationRequirements(residentId: string): Promise<{ ok: boolean; reason?: string }> {
  const [kyc] = await db
    .select()
    .from(kycRequestsTable)
    .where(and(eq(kycRequestsTable.residentId, residentId), eq(kycRequestsTable.status, "VERIFIED")))
    .limit(1);
  if (!kyc) return { ok: false, reason: "No verified KYC on file" };
  const [esign] = await db
    .select()
    .from(esignRequestsTable)
    .where(and(eq(esignRequestsTable.residentId, residentId), eq(esignRequestsTable.status, "SIGNED")))
    .limit(1);
  if (!esign) return { ok: false, reason: "No signed agreement on file" };
  return { ok: true };
}
