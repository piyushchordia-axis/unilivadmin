import {
  pgTable,
  text,
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

export const rateContractsTable = pgTable("rate_contracts", {
  id: text("id").primaryKey(),
  vendorId: text("vendor_id").notNull().references(() => vendorsTable.id),
  itemName: text("item_name").notNull(),
  unit: text("unit").notNull(),
  rate: numeric("rate").notNull(),
  validFrom: timestamp("valid_from").notNull(),
  validTo: timestamp("valid_to").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const vendorDocumentsTable = pgTable("vendor_documents", {
  id: text("id").primaryKey(),
  vendorId: text("vendor_id").notNull().references(() => vendorsTable.id),
  docType: text("doc_type").notNull(),
  fileUrl: text("file_url"),
  expiryDate: timestamp("expiry_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const indentsTable = pgTable("indents", {
  id: text("id").primaryKey(),
  indentNumber: text("indent_number").unique(),
  propertyId: text("property_id").notNull(),
  department: text("department").notNull(),
  items: json("items").$type<Record<string, unknown>[]>().notNull(),
  totalEstimatedValue: numeric("total_estimated_value").default("0").notNull(),
  status: indentStatusEnum("status").default("DRAFT").notNull(),
  urgency: text("urgency").default("NORMAL").notNull(),
  purpose: text("purpose"),
  budgetHead: text("budget_head"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  submittedAt: timestamp("submitted_at"),
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
  indentId: text("indent_id"),
  items: json("items").$type<Record<string, unknown>[]>().notNull(),
  subtotal: numeric("subtotal").default("0").notNull(),
  gstApplicable: boolean("gst_applicable").default(false).notNull(),
  gstAmount: numeric("gst_amount").default("0").notNull(),
  totalAmount: numeric("total_amount").notNull(),
  paymentTerms: text("payment_terms"),
  status: poStatusEnum("status").default("DRAFT").notNull(),
  approvedBy: text("approved_by"),
  deliveryDate: timestamp("delivery_date"),
  sentAt: timestamp("sent_at"),
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
  invoiceNumber: text("invoice_number"),
  invoicePhotoUrl: text("invoice_photo_url"),
  qcPass: boolean("qc_pass").default(true).notNull(),
  qcNotes: text("qc_notes"),
  status: text("status").default("PENDING_QC").notNull(),
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

export const stockMovementsTable = pgTable("stock_movements", {
  id: text("id").primaryKey(),
  inventoryId: text("inventory_id").notNull().references(() => inventoryTable.id),
  type: text("type").notNull(),
  quantity: numeric("quantity").notNull(),
  reference: text("reference"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Vendor = typeof vendorsTable.$inferSelect;
export type RateContract = typeof rateContractsTable.$inferSelect;
export type VendorDocument = typeof vendorDocumentsTable.$inferSelect;
export type Indent = typeof indentsTable.$inferSelect;
export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;
export type GRN = typeof grnTable.$inferSelect;
export type InventoryItem = typeof inventoryTable.$inferSelect;
export type StockMovement = typeof stockMovementsTable.$inferSelect;
