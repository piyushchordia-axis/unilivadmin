-- Operations expansion: Facility Management, Electricity, Resident Attendance,
-- Out-pass workflow, and IoT integration.
--
-- Apply with:
--   psql "$DATABASE_URL" -f lib/db/migrations/0003_operations.sql
--
-- Day-to-day dev uses `pnpm --filter @workspace/db run push` against
-- `src/schema/operations.ts`. This SQL captures the same change for
-- environments where push isn't appropriate (production).

BEGIN;

-- ─── Facility Management ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "facility_assets" (
  "id" text PRIMARY KEY,
  "property_id" text NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "asset_code" text NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "location" text,
  "manufacturer" text,
  "model_no" text,
  "install_date" timestamp,
  "warranty_expiry" timestamp,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_facility_assets_property" ON "facility_assets"("property_id");

CREATE TABLE IF NOT EXISTS "facility_schedules" (
  "id" text PRIMARY KEY,
  "asset_id" text NOT NULL REFERENCES "facility_assets"("id") ON DELETE CASCADE,
  "task_name" text NOT NULL,
  "frequency_days" integer NOT NULL,
  "vendor_id" text,
  "assigned_to" text,
  "next_due_date" timestamp NOT NULL,
  "last_done_at" timestamp,
  "is_active" boolean NOT NULL DEFAULT true,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_facility_schedules_asset" ON "facility_schedules"("asset_id");
CREATE INDEX IF NOT EXISTS "idx_facility_schedules_due" ON "facility_schedules"("next_due_date");

CREATE TABLE IF NOT EXISTS "facility_logs" (
  "id" text PRIMARY KEY,
  "schedule_id" text REFERENCES "facility_schedules"("id") ON DELETE SET NULL,
  "asset_id" text NOT NULL REFERENCES "facility_assets"("id") ON DELETE CASCADE,
  "performed_at" timestamp NOT NULL,
  "performed_by" text,
  "vendor_id" text,
  "cost" numeric,
  "outcome" text NOT NULL DEFAULT 'COMPLETED',
  "notes" text,
  "attachment" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_facility_logs_asset" ON "facility_logs"("asset_id");

-- ─── Electricity ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "electricity_tariffs" (
  "id" text PRIMARY KEY,
  "property_id" text REFERENCES "properties"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "rate_per_unit" numeric NOT NULL,
  "fixed_charge" numeric NOT NULL DEFAULT '0',
  "effective_from" timestamp NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "electricity_meters" (
  "id" text PRIMARY KEY,
  "property_id" text NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "room_id" text REFERENCES "rooms"("id") ON DELETE SET NULL,
  "resident_id" text REFERENCES "residents"("id") ON DELETE SET NULL,
  "meter_no" text NOT NULL,
  "label" text,
  "tariff_id" text REFERENCES "electricity_tariffs"("id") ON DELETE SET NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_electricity_meters_property" ON "electricity_meters"("property_id");
CREATE INDEX IF NOT EXISTS "idx_electricity_meters_resident" ON "electricity_meters"("resident_id");

CREATE TABLE IF NOT EXISTS "electricity_readings" (
  "id" text PRIMARY KEY,
  "meter_id" text NOT NULL REFERENCES "electricity_meters"("id") ON DELETE CASCADE,
  "reading_date" timestamp NOT NULL,
  "reading" numeric NOT NULL,
  "prev_reading" numeric,
  "units_consumed" numeric,
  "amount" numeric,
  "ledger_entry_id" text,
  "posted" boolean NOT NULL DEFAULT false,
  "notes" text,
  "recorded_by" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_electricity_readings_meter" ON "electricity_readings"("meter_id");
CREATE INDEX IF NOT EXISTS "idx_electricity_readings_date" ON "electricity_readings"("reading_date");

-- ─── Resident Attendance & Out-pass ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "resident_attendance" (
  "id" text PRIMARY KEY,
  "resident_id" text NOT NULL REFERENCES "residents"("id") ON DELETE CASCADE,
  "property_id" text NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "attendance_date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'PRESENT',
  "notes" text,
  "marked_by" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_resident_attendance_date" ON "resident_attendance"("attendance_date");
CREATE INDEX IF NOT EXISTS "idx_resident_attendance_resident" ON "resident_attendance"("resident_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_resident_attendance_resident_date" ON "resident_attendance"("resident_id","attendance_date");

CREATE TABLE IF NOT EXISTS "out_passes" (
  "id" text PRIMARY KEY,
  "resident_id" text NOT NULL REFERENCES "residents"("id") ON DELETE CASCADE,
  "property_id" text NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "destination" text,
  "leave_on" timestamp NOT NULL,
  "expected_return" timestamp NOT NULL,
  "actual_return" timestamp,
  "status" text NOT NULL DEFAULT 'PENDING',
  "approver_id" text,
  "approver_note" text,
  "parent_notified" boolean NOT NULL DEFAULT false,
  "created_by" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_out_passes_resident" ON "out_passes"("resident_id");
CREATE INDEX IF NOT EXISTS "idx_out_passes_status" ON "out_passes"("status");

-- ─── IoT ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "iot_devices" (
  "id" text PRIMARY KEY,
  "property_id" text NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "room_id" text REFERENCES "rooms"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "device_type" text NOT NULL,
  "adapter" text NOT NULL DEFAULT 'GENERIC',
  "endpoint" text,
  "ingestion_token" text NOT NULL,
  "config" json NOT NULL DEFAULT '{}'::json,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "last_seen_at" timestamp,
  "registered_by" text REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_iot_devices_property" ON "iot_devices"("property_id");
CREATE INDEX IF NOT EXISTS "idx_iot_devices_room" ON "iot_devices"("room_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_iot_devices_token" ON "iot_devices"("ingestion_token");

CREATE TABLE IF NOT EXISTS "iot_readings" (
  "id" text PRIMARY KEY,
  "device_id" text NOT NULL REFERENCES "iot_devices"("id") ON DELETE CASCADE,
  "metric" text NOT NULL,
  "value" numeric,
  "raw_payload" json,
  "recorded_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_iot_readings_device" ON "iot_readings"("device_id");
CREATE INDEX IF NOT EXISTS "idx_iot_readings_recorded" ON "iot_readings"("recorded_at");

COMMIT;
