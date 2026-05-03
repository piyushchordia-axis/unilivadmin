import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  json,
  date,
} from "drizzle-orm/pg-core";
import { propertiesTable, residentsTable, roomsTable, usersTable } from "./core";

// ─── Facility Management ──────────────────────────────────
export const facilityAssetsTable = pgTable("facility_assets", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
  assetCode: text("asset_code").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(), // LIFT | GENSET | WATER_TANK | HVAC | FIRE_SAFETY | DG | STP | OTHER
  location: text("location"),
  manufacturer: text("manufacturer"),
  modelNo: text("model_no"),
  installDate: timestamp("install_date"),
  warrantyExpiry: timestamp("warranty_expiry"),
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | UNDER_MAINTENANCE | DECOMMISSIONED
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const facilitySchedulesTable = pgTable("facility_schedules", {
  id: text("id").primaryKey(),
  assetId: text("asset_id").notNull().references(() => facilityAssetsTable.id, { onDelete: "cascade" }),
  taskName: text("task_name").notNull(),
  frequencyDays: integer("frequency_days").notNull(),
  vendorId: text("vendor_id"),
  assignedTo: text("assigned_to"),
  nextDueDate: timestamp("next_due_date").notNull(),
  lastDoneAt: timestamp("last_done_at"),
  isActive: boolean("is_active").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const facilityLogsTable = pgTable("facility_logs", {
  id: text("id").primaryKey(),
  scheduleId: text("schedule_id").references(() => facilitySchedulesTable.id, { onDelete: "set null" }),
  assetId: text("asset_id").notNull().references(() => facilityAssetsTable.id, { onDelete: "cascade" }),
  performedAt: timestamp("performed_at").notNull(),
  performedBy: text("performed_by"),
  vendorId: text("vendor_id"),
  cost: numeric("cost"),
  outcome: text("outcome").notNull().default("COMPLETED"), // COMPLETED | PARTIAL | FAILED
  notes: text("notes"),
  attachment: text("attachment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Electricity ──────────────────────────────────────────
export const electricityTariffsTable = pgTable("electricity_tariffs", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").references(() => propertiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  ratePerUnit: numeric("rate_per_unit").notNull(),
  fixedCharge: numeric("fixed_charge").default("0").notNull(),
  effectiveFrom: timestamp("effective_from").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const electricityMetersTable = pgTable("electricity_meters", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
  roomId: text("room_id").references(() => roomsTable.id, { onDelete: "set null" }),
  residentId: text("resident_id").references(() => residentsTable.id, { onDelete: "set null" }),
  meterNo: text("meter_no").notNull(),
  label: text("label"),
  tariffId: text("tariff_id").references(() => electricityTariffsTable.id, { onDelete: "set null" }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const electricityReadingsTable = pgTable("electricity_readings", {
  id: text("id").primaryKey(),
  meterId: text("meter_id").notNull().references(() => electricityMetersTable.id, { onDelete: "cascade" }),
  readingDate: timestamp("reading_date").notNull(),
  reading: numeric("reading").notNull(),
  prevReading: numeric("prev_reading"),
  unitsConsumed: numeric("units_consumed"),
  amount: numeric("amount"),
  ledgerEntryId: text("ledger_entry_id"),
  posted: boolean("posted").default(false).notNull(),
  notes: text("notes"),
  recordedBy: text("recorded_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Resident Attendance & Out-pass ───────────────────────
export const residentAttendanceTable = pgTable("resident_attendance", {
  id: text("id").primaryKey(),
  residentId: text("resident_id").notNull().references(() => residentsTable.id, { onDelete: "cascade" }),
  propertyId: text("property_id").notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
  attendanceDate: date("attendance_date").notNull(),
  status: text("status").notNull().default("PRESENT"), // PRESENT | ABSENT | OUT_PASS
  notes: text("notes"),
  markedBy: text("marked_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const outPassesTable = pgTable("out_passes", {
  id: text("id").primaryKey(),
  residentId: text("resident_id").notNull().references(() => residentsTable.id, { onDelete: "cascade" }),
  propertyId: text("property_id").notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  destination: text("destination"),
  leaveOn: timestamp("leave_on").notNull(),
  expectedReturn: timestamp("expected_return").notNull(),
  actualReturn: timestamp("actual_return"),
  status: text("status").notNull().default("PENDING"), // PENDING | APPROVED | REJECTED | RETURNED | OVERDUE
  approverId: text("approver_id"),
  approverNote: text("approver_note"),
  parentNotified: boolean("parent_notified").default(false).notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── IoT ──────────────────────────────────────────────────
export const iotDevicesTable = pgTable("iot_devices", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
  roomId: text("room_id").references(() => roomsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  deviceType: text("device_type").notNull(), // SMART_LOCK | ENERGY_METER | TEMP_SENSOR | OCCUPANCY | LEAK | OTHER
  adapter: text("adapter").notNull().default("GENERIC"), // GENERIC | SMART_LOCK | ENERGY_METER | ...
  endpoint: text("endpoint"),
  ingestionToken: text("ingestion_token").notNull(),
  config: json("config").$type<Record<string, unknown>>().default({}).notNull(),
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | INACTIVE | OFFLINE
  lastSeenAt: timestamp("last_seen_at"),
  registeredBy: text("registered_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const iotReadingsTable = pgTable("iot_readings", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull().references(() => iotDevicesTable.id, { onDelete: "cascade" }),
  metric: text("metric").notNull(),
  value: numeric("value"),
  rawPayload: json("raw_payload").$type<Record<string, unknown>>(),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});
