import { pgTable, text, boolean, timestamp, json, integer, doublePrecision, numeric } from "drizzle-orm/pg-core";

export const recipesTable = pgTable("recipes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  mealType: text("meal_type").notNull(),
  ingredients: json("ingredients").$type<Record<string, unknown>[]>().notNull(),
  method: text("method"),
  photoUrl: text("photo_url"),
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
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const dailyProductionTable = pgTable("daily_production", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull(),
  date: timestamp("date").notNull(),
  dispatches: json("dispatches").$type<Record<string, unknown>[]>().default([]).notNull(),
  wastage: json("wastage").$type<Record<string, unknown>[]>().default([]).notNull(),
  receivings: json("receivings").$type<Record<string, unknown>[]>().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const recipeFeedbackTable = pgTable("recipe_feedback", {
  id: text("id").primaryKey(),
  recipeId: text("recipe_id").notNull().references(() => recipesTable.id),
  propertyId: text("property_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  weekStart: timestamp("week_start"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Recipe = typeof recipesTable.$inferSelect;
export type MenuPlan = typeof menuPlansTable.$inferSelect;
export type DailyProduction = typeof dailyProductionTable.$inferSelect;
export type RecipeFeedback = typeof recipeFeedbackTable.$inferSelect;

// re-export to avoid TS unused errors when `numeric`/`doublePrecision` not yet used
void numeric; void doublePrecision;
