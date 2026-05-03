-- Portfolio sub-types for properties
-- Adds portfolio_type enum + portfolio_attributes JSON column on properties.
-- Existing rows are backfilled to CO_LIVING with empty attributes via the
-- column DEFAULTs, then the columns are tightened to NOT NULL.

DO $$ BEGIN
  CREATE TYPE "portfolio_type" AS ENUM (
    'CO_LIVING',
    'STUDENT_HOUSING',
    'SERVICED_APARTMENTS',
    'PG',
    'COLLEGE_HOSTEL',
    'COWORKING',
    'MANAGED_OFFICE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "portfolio_type" "portfolio_type"
    NOT NULL DEFAULT 'CO_LIVING';

ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "portfolio_attributes" json
    NOT NULL DEFAULT '{}'::json;

-- Explicit backfill (defensive — DEFAULTs above already cover existing rows).
UPDATE "properties"
  SET "portfolio_type" = 'CO_LIVING'
  WHERE "portfolio_type" IS NULL;

UPDATE "properties"
  SET "portfolio_attributes" = '{}'::json
  WHERE "portfolio_attributes" IS NULL;
