-- 0006_kitchen_pincodes.sql
-- WS1 (Unit-Lead v2): master map of pincode → kitchen so a property's kitchen can
-- be auto-derived from its pincode. A kitchen serves many pincodes; each pincode
-- maps to exactly one kitchen (pincode globally unique) for deterministic lookup.

CREATE TABLE IF NOT EXISTS "kitchen_pincodes" (
  "id" text PRIMARY KEY NOT NULL,
  "kitchen_id" text NOT NULL,
  "pincode" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "kitchen_pincodes_pincode_unique" UNIQUE ("pincode")
);

DO $$ BEGIN
  ALTER TABLE "kitchen_pincodes"
    ADD CONSTRAINT "kitchen_pincodes_kitchen_id_kitchens_id_fk"
    FOREIGN KEY ("kitchen_id") REFERENCES "kitchens"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "idx_kitchen_pincodes_kitchen" ON "kitchen_pincodes" ("kitchen_id");
