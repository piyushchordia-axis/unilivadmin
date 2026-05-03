import { pgTable, text, timestamp, boolean, json, integer } from "drizzle-orm/pg-core";
import { usersTable, propertiesTable } from "./core";

export const notificationsTable = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  body: text("body"),
  type: text("type").notNull(),
  link: text("link"),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const auditLogTable = pgTable("audit_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  changes: json("changes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const slaConfigTable = pgTable("sla_config", {
  id: text("id").primaryKey(),
  category: text("category").notNull().unique(),
  slaHours: integer("sla_hours").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const complaintRoutingTable = pgTable("complaint_routing", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull().references(() => propertiesTable.id),
  category: text("category").notNull(),
  assignedTo: text("assigned_to").notNull().references(() => usersTable.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const integrationStatusTable = pgTable("integration_status", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  enabled: boolean("enabled").default(false).notNull(),
  config: json("config"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
