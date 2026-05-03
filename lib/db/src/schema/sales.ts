import {
  pgTable,
  text,
  boolean,
  timestamp,
  numeric,
  pgEnum,
  integer,
  doublePrecision,
  json,
} from "drizzle-orm/pg-core";

export const leadSourceEnum = pgEnum("lead_source", [
  "WEBSITE",
  "WHATSAPP",
  "INSTAGRAM",
  "COLD_CALL",
  "REFERRAL",
  "COLLEGE",
  "OTHER",
]);
export const leadStageEnum = pgEnum("lead_stage", [
  "NEW",
  "CONTACTED",
  "VISIT_SCHEDULED",
  "VISIT_DONE",
  "NEGOTIATING",
  "CONVERTED",
  "LOST",
]);

export const leadsTable = pgTable("leads", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  source: leadSourceEnum("source").notNull(),
  propertyId: text("property_id"),
  stage: leadStageEnum("stage").default("NEW").notNull(),
  assignedTo: text("assigned_to"),
  budgetMin: numeric("budget_min"),
  budgetMax: numeric("budget_max"),
  moveInDate: timestamp("move_in_date"),
  visitDate: timestamp("visit_date"),
  visitDone: boolean("visit_done").default(false).notNull(),
  visitOutcome: text("visit_outcome"),
  visitFeedback: text("visit_feedback"),
  lostReason: text("lost_reason"),
  notes: text("notes"),
  followUpAt: timestamp("follow_up_at"),
  followUpNote: text("follow_up_note"),
  convertedAt: timestamp("converted_at"),
  residentId: text("resident_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const leadActivitiesTable = pgTable("lead_activities", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leadsTable.id),
  type: text("type").notNull(), // STAGE_CHANGE | NOTE | CALL | VISIT_SCHEDULED | VISIT_OUTCOME | FOLLOWUP_SET | QUOTE_SENT
  note: text("note"),
  meta: json("meta"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const propertyLeadsTable = pgTable("property_leads", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  ownerName: text("owner_name"),
  ownerPhone: text("owner_phone"),
  totalArea: doublePrecision("total_area"),
  askingRent: numeric("asking_rent"),
  bedCount: integer("bed_count"),
  stage: text("stage").default("SCOUTING").notNull(),
  viabilityData: json("viability_data"),
  documents: json("documents").$type<string[]>().default([]).notNull(),
  photos: json("photos").$type<string[]>().default([]).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Lead = typeof leadsTable.$inferSelect;
export type LeadActivity = typeof leadActivitiesTable.$inferSelect;
export type PropertyLead = typeof propertyLeadsTable.$inferSelect;
