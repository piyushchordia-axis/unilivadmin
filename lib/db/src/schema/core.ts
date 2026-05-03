import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  numeric,
  pgEnum,
  json,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const propertyStatusEnum = pgEnum("property_status", [
  "ACTIVE",
  "INACTIVE",
  "UNDER_RENOVATION",
]);
export const roomTypeEnum = pgEnum("room_type", [
  "SINGLE",
  "DOUBLE",
  "TRIPLE",
  "DORMITORY",
]);
export const roomStatusEnum = pgEnum("room_status", [
  "VACANT",
  "OCCUPIED",
  "MAINTENANCE",
  "RESERVED",
]);
export const userRoleEnum = pgEnum("user_role", [
  "SUPER_ADMIN",
  "HR_MANAGER",
  "OPERATIONS_MANAGER",
  "PROCUREMENT_MANAGER",
  "KITCHEN_MANAGER",
  "PROJECTS_MANAGER",
  "PROPERTY_ACQUISITION",
  "FINANCE",
  "SALES_EXECUTIVE",
  "WARDEN",
  "VENDOR_RESTRICTED",
  "AUDIT_READONLY",
]);
export const residentStatusEnum = pgEnum("resident_status", [
  "ACTIVE",
  "CHECKED_OUT",
  "NOTICE_PERIOD",
]);
export const ledgerTypeEnum = pgEnum("ledger_type", [
  "RENT",
  "UTILITY",
  "FOOD",
  "LAUNDRY",
  "PENALTY",
  "ADJUSTMENT",
  "INCENTIVE",
  "DEPOSIT",
]);
export const paymentModeEnum = pgEnum("payment_mode", [
  "UPI",
  "NETBANKING",
  "CARD",
  "CASH",
  "BANK_TRANSFER",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING",
  "SUCCESS",
  "FAILED",
  "REFUNDED",
]);
export const complaintCategoryEnum = pgEnum("complaint_category", [
  "ELECTRICAL",
  "PLUMBING",
  "HOUSEKEEPING",
  "INTERNET",
  "SECURITY",
  "FOOD",
  "LAUNDRY",
  "OTHER",
]);
export const complaintStatusEnum = pgEnum("complaint_status", [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
]);
export const priorityEnum = pgEnum("priority", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const propertiesTable = pgTable("properties", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  pincode: text("pincode").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  totalBeds: integer("total_beds").notNull(),
  status: propertyStatusEnum("status").default("ACTIVE").notNull(),
  wardenId: text("warden_id"),
  phone: text("phone"),
  email: text("email"),
  amenities: json("amenities").$type<string[]>().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const roomsTable = pgTable("rooms", {
  id: text("id").primaryKey(),
  propertyId: text("property_id")
    .notNull()
    .references(() => propertiesTable.id),
  number: text("number").notNull(),
  floor: integer("floor").notNull(),
  wing: text("wing"),
  type: roomTypeEnum("type").notNull(),
  capacity: integer("capacity").notNull(),
  status: roomStatusEnum("status").default("VACANT").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull(),
  propertyId: text("property_id"),
  isActive: boolean("is_active").default(true).notNull(),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const refreshTokensTable = pgTable("refresh_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const residentsTable = pgTable("residents", {
  id: text("id").primaryKey(),
  propertyId: text("property_id")
    .notNull()
    .references(() => propertiesTable.id),
  roomId: text("room_id"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  dob: timestamp("dob"),
  gender: text("gender"),
  photo: text("photo"),
  college: text("college"),
  course: text("course"),
  parentName: text("parent_name"),
  parentPhone: text("parent_phone"),
  parentEmail: text("parent_email"),
  emergencyContact: text("emergency_contact"),
  dietaryPref: json("dietary_pref").$type<string[]>().default([]).notNull(),
  allergies: json("allergies").$type<string[]>().default([]).notNull(),
  checkInDate: timestamp("check_in_date"),
  checkOutDate: timestamp("check_out_date"),
  planType: text("plan_type"),
  monthlyRent: numeric("monthly_rent"),
  securityDeposit: numeric("security_deposit"),
  status: residentStatusEnum("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const ledgerEntriesTable = pgTable("ledger_entries", {
  id: text("id").primaryKey(),
  residentId: text("resident_id")
    .notNull()
    .references(() => residentsTable.id),
  type: ledgerTypeEnum("type").notNull(),
  amount: numeric("amount").notNull(),
  description: text("description").notNull(),
  dueDate: timestamp("due_date"),
  isPaid: boolean("is_paid").default(false).notNull(),
  paidOn: timestamp("paid_on"),
  reference: text("reference"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const paymentsTable = pgTable("payments", {
  id: text("id").primaryKey(),
  residentId: text("resident_id")
    .notNull()
    .references(() => residentsTable.id),
  amount: numeric("amount").notNull(),
  mode: paymentModeEnum("mode").notNull(),
  status: paymentStatusEnum("status").default("PENDING").notNull(),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPayId: text("razorpay_pay_id"),
  reference: text("reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const complaintsTable = pgTable("complaints", {
  id: text("id").primaryKey(),
  propertyId: text("property_id")
    .notNull()
    .references(() => propertiesTable.id),
  residentId: text("resident_id"),
  ticketNo: text("ticket_no").notNull().unique(),
  category: complaintCategoryEnum("category").notNull(),
  subCategory: text("sub_category"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  photos: json("photos").$type<string[]>().default([]).notNull(),
  status: complaintStatusEnum("status").default("OPEN").notNull(),
  priority: priorityEnum("priority").default("MEDIUM").notNull(),
  assignedTo: text("assigned_to"),
  slaHours: integer("sla_hours").default(24).notNull(),
  slaDeadline: timestamp("sla_deadline"),
  slaBreach: boolean("sla_breach").default(false).notNull(),
  resolvedAt: timestamp("resolved_at"),
  resolutionNote: text("resolution_note"),
  rating: integer("rating"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const escalationsTable = pgTable("escalations", {
  id: text("id").primaryKey(),
  complaintId: text("complaint_id")
    .notNull()
    .references(() => complaintsTable.id),
  level: integer("level").notNull(),
  escalatedTo: text("escalated_to").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const announcementsTable = pgTable("announcements", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  propertyId: text("property_id"),
  targetRoles: json("target_roles").$type<string[]>().default([]).notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPropertySchema = createInsertSchema(propertiesTable);
export const insertRoomSchema = createInsertSchema(roomsTable);
export const insertUserSchema = createInsertSchema(usersTable);
export const insertResidentSchema = createInsertSchema(residentsTable);
export const insertLedgerEntrySchema = createInsertSchema(ledgerEntriesTable);
export const insertPaymentSchema = createInsertSchema(paymentsTable);
export const insertComplaintSchema = createInsertSchema(complaintsTable);
export const insertEscalationSchema = createInsertSchema(escalationsTable);
export const insertAnnouncementSchema = createInsertSchema(announcementsTable);

export type Property = typeof propertiesTable.$inferSelect;
export type InsertProperty = typeof propertiesTable.$inferInsert;
export type Room = typeof roomsTable.$inferSelect;
export type InsertRoom = typeof roomsTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
export type Resident = typeof residentsTable.$inferSelect;
export type InsertResident = typeof residentsTable.$inferInsert;
export type LedgerEntry = typeof ledgerEntriesTable.$inferSelect;
export type InsertLedgerEntry = typeof ledgerEntriesTable.$inferInsert;
export type Payment = typeof paymentsTable.$inferSelect;
export type InsertPayment = typeof paymentsTable.$inferInsert;
export type Complaint = typeof complaintsTable.$inferSelect;
export type InsertComplaint = typeof complaintsTable.$inferInsert;
export type Escalation = typeof escalationsTable.$inferSelect;
export type Announcement = typeof announcementsTable.$inferSelect;
