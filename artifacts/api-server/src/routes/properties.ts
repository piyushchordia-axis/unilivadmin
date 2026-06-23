import { Router } from "express";
import { db } from "@workspace/db";
import { propertiesTable, residentsTable } from "@workspace/db";
import { eq, sql, ilike, or } from "drizzle-orm";
import { authenticate } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";
import { pick } from "../lib/authz.js";
import { getPagination, buildMeta } from "../lib/paginate.js";
import { newId } from "../lib/id.js";
import { resolveKitchenForPincode, isActiveBrand } from "../lib/food-service.js";

const router = Router();

/** Client-writable property columns (never id/createdAt/updatedAt). */
const PROPERTY_FIELDS = [
  "name",
  "address",
  "city",
  "state",
  "pincode",
  "lat",
  "lng",
  "totalBeds",
  "status",
  "portfolioType",
  "portfolioAttributes",
  "wardenId",
  "phone",
  "email",
  "amenities",
  "brand",
  "kitchenId",
] as const;

router.get("/", authenticate, authorize("PROPERTIES", "view"), async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query as Record<string, unknown>);
    const search = req.query["search"] as string | undefined;

    const where = search ? or(ilike(propertiesTable.name, `%${search}%`), ilike(propertiesTable.city, `%${search}%`)) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(propertiesTable).where(where);
    const rows = await db.select().from(propertiesTable).where(where).limit(limit).offset(offset).orderBy(propertiesTable.createdAt);

    const occupiedMap: Record<string, number> = {};
    await Promise.all(
      rows.map(async (row) => {
        const [r] = await db.select({ count: sql<number>`count(*)::int` }).from(residentsTable).where(eq(residentsTable.propertyId, row.id));
        occupiedMap[row.id] = r.count || 0;
      })
    );

    res.json({
      success: true,
      data: rows.map(p => ({ ...p, occupiedBeds: occupiedMap[p.id] || 0 })),
      meta: buildMeta(countResult.count, page, limit),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/", authenticate, authorize("PROPERTIES", "create"), async (req, res) => {
  try {
    const body = pick(req.body, PROPERTY_FIELDS);

    // ── Food config: brand + kitchen are MANDATORY on create. ───────────────
    // "Without brand and kitchen we cannot create a property" (Persona/admin).
    const brand = body.brand ? String(body.brand).trim() : "";
    if (!brand) {
      res.status(400).json({ success: false, error: "Brand is required." });
      return;
    }
    if (!(await isActiveBrand(brand))) {
      res.status(400).json({ success: false, error: "Unknown or inactive brand." });
      return;
    }
    // Kitchen is auto-derived from the pincode server-side — never trust the
    // client's kitchenId. We re-derive it and require an exact match (so a
    // tampered/stale kitchenId is rejected rather than silently persisted).
    const kitchen = await resolveKitchenForPincode(String(body.pincode ?? ""));
    if (!kitchen) {
      res.status(400).json({ success: false, error: "No kitchen serves this pincode. Change the pincode or contact an admin." });
      return;
    }
    const clientKitchenId = body.kitchenId ? String(body.kitchenId).trim() : "";
    if (!clientKitchenId) {
      res.status(400).json({ success: false, error: "Kitchen is required." });
      return;
    }
    if (clientKitchenId !== kitchen.id) {
      res.status(400).json({ success: false, error: "Kitchen does not match the kitchen mapped to this pincode." });
      return;
    }

    const [row] = await db.insert(propertiesTable).values({
      id: newId(),
      name: body.name,
      address: body.address,
      city: body.city,
      state: body.state,
      pincode: body.pincode,
      lat: body.lat,
      lng: body.lng,
      totalBeds: body.totalBeds,
      status: body.status || "ACTIVE",
      portfolioType: body.portfolioType || "CO_LIVING",
      portfolioAttributes: body.portfolioAttributes || {},
      wardenId: body.wardenId,
      phone: body.phone,
      email: body.email,
      amenities: body.amenities || [],
      brand,
      kitchenId: kitchen.id,
      updatedAt: new Date(),
    }).returning();
    res.status(201).json({ success: true, data: { ...row, occupiedBeds: 0 } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.get("/:id", authenticate, authorize("PROPERTIES", "view"), async (req, res) => {
  try {
    const [row] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, req.params["id"]!));
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    const [r] = await db.select({ count: sql<number>`count(*)::int` }).from(residentsTable).where(eq(residentsTable.propertyId, row.id));
    res.json({ success: true, data: { ...row, occupiedBeds: r.count || 0 } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.put("/:id", authenticate, authorize("PROPERTIES", "edit"), async (req, res) => {
  try {
    const body = pick(req.body, PROPERTY_FIELDS);

    const [existing] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, req.params["id"]!));
    if (!existing) { res.status(404).json({ success: false, error: "Not found" }); return; }

    // Brand is freely editable, but if supplied it must be a known active brand.
    if (body.brand !== undefined) {
      const brand = body.brand ? String(body.brand).trim() : "";
      if (!brand || !(await isActiveBrand(brand))) {
        res.status(400).json({ success: false, error: "Unknown or inactive brand." });
        return;
      }
      body.brand = brand;
    }

    // Kitchen is auto-derived from pincode. When the pincode changes (or a
    // kitchenId is supplied), re-derive server-side and validate — the client's
    // kitchenId is never trusted. A pincode with no mapped kitchen is rejected.
    const pincodeChanged = body.pincode !== undefined && String(body.pincode) !== String(existing.pincode);
    if (pincodeChanged || body.kitchenId !== undefined) {
      const pincode = body.pincode !== undefined ? String(body.pincode) : String(existing.pincode);
      const kitchen = await resolveKitchenForPincode(pincode);
      if (!kitchen) {
        res.status(400).json({ success: false, error: "No kitchen serves this pincode. Change the pincode or contact an admin." });
        return;
      }
      if (body.kitchenId !== undefined && String(body.kitchenId).trim() !== kitchen.id) {
        res.status(400).json({ success: false, error: "Kitchen does not match the kitchen mapped to this pincode." });
        return;
      }
      body.kitchenId = kitchen.id; // always persist the server-derived kitchen
    } else {
      // No pincode/kitchen change in this request — don't touch the column.
      delete body.kitchenId;
    }

    const [row] = await db.update(propertiesTable).set({ ...body, updatedAt: new Date() }).where(eq(propertiesTable.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ success: false, error: "Not found" }); return; }
    const [r] = await db.select({ count: sql<number>`count(*)::int` }).from(residentsTable).where(eq(residentsTable.propertyId, row.id));
    res.json({ success: true, data: { ...row, occupiedBeds: r.count || 0 } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.delete("/:id", authenticate, authorize("PROPERTIES", "delete"), async (req, res) => {
  try {
    await db.delete(propertiesTable).where(eq(propertiesTable.id, req.params["id"]!));
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
