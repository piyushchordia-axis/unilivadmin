import { pgTable, text, boolean, timestamp, json } from "drizzle-orm/pg-core";

export const recipesTable = pgTable("recipes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  mealType: text("meal_type").notNull(),
  ingredients: json("ingredients")
    .$type<Record<string, unknown>[]>()
    .notNull(),
  method: text("method"),
  allergens: json("allergens").$type<string[]>().default([]).notNull(),
  isVeg: boolean("is_veg").default(true).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const menuPlansTable = pgTable("menu_plans", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull(),
  weekStart: timestamp("week_start").notNull(),
  slots: json("slots").$type<Record<string, unknown>>().notNull(),
  status: text("status").default("DRAFT").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Recipe = typeof recipesTable.$inferSelect;
export type MenuPlan = typeof menuPlansTable.$inferSelect;
