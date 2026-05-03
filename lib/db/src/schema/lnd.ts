import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  doublePrecision,
  json,
} from "drizzle-orm/pg-core";

export const coursesTable = pgTable("courses", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  targetRoles: json("target_roles").$type<string[]>().default([]).notNull(),
  contentUrl: text("content_url"),
  contentType: text("content_type").notNull(),
  isMandatory: boolean("is_mandatory").default(false).notNull(),
  expiryDate: timestamp("expiry_date"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const courseEnrollmentsTable = pgTable("course_enrollments", {
  id: text("id").primaryKey(),
  courseId: text("course_id")
    .notNull()
    .references(() => coursesTable.id),
  employeeId: text("employee_id").notNull(),
  progress: doublePrecision("progress").default(0).notNull(),
  completed: boolean("completed").default(false).notNull(),
  completedAt: timestamp("completed_at"),
  score: integer("score"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Course = typeof coursesTable.$inferSelect;
export type CourseEnrollment = typeof courseEnrollmentsTable.$inferSelect;
