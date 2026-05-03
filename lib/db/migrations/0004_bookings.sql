-- Bookings: short-stay reservations for SERVICED_APARTMENTS portfolios.
--
-- Apply with:
--   psql "$DATABASE_URL" -f lib/db/migrations/0004_bookings.sql
--
-- Day-to-day dev uses `pnpm --filter @workspace/db run push` against
-- `src/schema/core.ts`. This SQL captures the same change for
-- environments where push isn't appropriate (production).

BEGIN;

DO $$ BEGIN
  CREATE TYPE "booking_status" AS ENUM (
    'CONFIRMED',
    'CHECKED_IN',
    'CHECKED_OUT',
    'CANCELLED',
    'NO_SHOW'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "rate_period" AS ENUM ('NIGHTLY', 'WEEKLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "bookings" (
  "id" text PRIMARY KEY,
  "booking_no" text NOT NULL UNIQUE,
  "property_id" text NOT NULL REFERENCES "properties"("id"),
  "room_id" text REFERENCES "rooms"("id"),
  "guest_name" text NOT NULL,
  "guest_email" text,
  "guest_phone" text NOT NULL,
  "guest_count" integer NOT NULL DEFAULT 1,
  "check_in_date" timestamp NOT NULL,
  "check_out_date" timestamp NOT NULL,
  "nights" integer NOT NULL,
  "rate_period" "rate_period" NOT NULL DEFAULT 'NIGHTLY',
  "rate_per_period" numeric NOT NULL,
  "subtotal" numeric NOT NULL,
  "tax_amount" numeric NOT NULL DEFAULT '0',
  "total_amount" numeric NOT NULL,
  "status" "booking_status" NOT NULL DEFAULT 'CONFIRMED',
  "notes" text,
  "created_by" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_bookings_property" ON "bookings"("property_id");
CREATE INDEX IF NOT EXISTS "idx_bookings_room" ON "bookings"("room_id");
CREATE INDEX IF NOT EXISTS "idx_bookings_status" ON "bookings"("status");
CREATE INDEX IF NOT EXISTS "idx_bookings_dates" ON "bookings"("check_in_date", "check_out_date");

COMMIT;
