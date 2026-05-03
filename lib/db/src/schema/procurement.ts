import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  pgEnum,
  json,
  doublePrecision,
} from "drizzle-orm/pg-core";

export const indentStatusEnum = pgEnum("indent_status", [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "PO_RAISED",
  "DELIVERED",
]);
export const poStatusEnum = pgEnum("po_status", [
  "DRAFT",
  "SENT",
  "ACKNOWLEDGED",
  "PARTIAL_DELIVERY",
  "DELIVERED",
  "CANCELLED",
]);

export const vendorsTable = pgTable("vendors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  gstin: text("gstin"),
  pan: text("pan"),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address"),
  categories: json("categories").$type<string[]>().default([]).notNull(),
  bankAccount: text("bank_account"),
  ifscCode: text("ifsc_code"),
  rating: doublePrecision("rating"),
  status: text("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const indentsTable = pgTable("indents", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull(),
  department: text("department").notNull(),
  items: json("items").$type<Record<string, unknown>[]>().notNull(),
  status: indentStatusEnum("status").default("DRAFT").notNull(),
  urgency: text("urgency").default("NORMAL").notNull(),
  purpose: text("purpose"),
  budgetHead: text("budget_head"),
  approvedBy: text("approved_by"),
  poId: text("po_id"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const purchaseOrdersTable = pgTable("purchase_orders", {
  id: text("id").primaryKey(),
  poNumber: text("po_number").notNull().unique(),
  vendorId: text("vendor_id")
    .notNull()
    .references(() => vendorsTable.id),
  propertyId: text("property_id"),
  items: json("items").$type<Record<string, unknown>[]>().notNull(),
  totalAmount: numeric("total_amount").notNull(),
  status: poStatusEnum("status").default("DRAFT").notNull(),
  approvedBy: text("approved_by"),
  deliveryDate: timestamp("delivery_date"),
  grnId: text("grn_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const grnTable = pgTable("grns", {
  id: text("id").primaryKey(),
  grnNumber: text("grn_number").notNull().unique(),
  poId: text("po_id").notNull(),
  propertyId: text("property_id").notNull(),
  items: json("items").$type<Record<string, unknown>[]>().notNull(),
  status: text("status").default("PENDING_QC").notNull(),
  qcNotes: text("qc_notes"),
  photos: json("photos").$type<string[]>().default([]).notNull(),
  receivedBy: text("received_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const inventoryTable = pgTable("inventory", {
  id: text("id").primaryKey(),
  propertyId: text("property_id"),
  name: text("name").notNull(),
  sku: text("sku"),
  category: text("category").notNull(),
  unit: text("unit").notNull(),
  currentStock: numeric("current_stock").default("0").notNull(),
  minStock: numeric("min_stock").default("0").notNull(),
  expiryDate: timestamp("expiry_date"),
  unitCost: numeric("unit_cost"),
  location: text("location"),
  isAsset: boolean("is_asset").default(false).notNull(),
  assetTag: text("asset_tag"),
  condition: text("condition"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Vendor = typeof vendorsTable.$inferSelect;
export type Indent = typeof indentsTable.$inferSelect;
export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;
export type GRN = typeof grnTable.$inferSelect;
export type InventoryItem = typeof inventoryTable.$inferSelect;
