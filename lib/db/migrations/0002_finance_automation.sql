-- Finance automation: billing cycles, reminder rules/logs, bank reconciliation,
-- and expense management with approval workflow.
--
-- Apply with:
--   psql "$DATABASE_URL" -f lib/db/migrations/0002_finance_automation.sql
--
-- Day-to-day dev uses `pnpm --filter @workspace/db run push` which keeps the
-- live database in sync with `src/schema/finance.ts`. This SQL captures the
-- same change for environments where push isn't appropriate (production).

BEGIN;

-- ─── Billing cycles ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "billing_cycles" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "property_id" text REFERENCES "properties"("id"),
  "cadence" text NOT NULL DEFAULT 'MONTHLY',
  "day_of_month" integer NOT NULL DEFAULT 1,
  "custom_days" integer,
  "ledger_type" text NOT NULL DEFAULT 'RENT',
  "description_template" text NOT NULL DEFAULT 'Rent for {{month}}',
  "is_active" boolean NOT NULL DEFAULT true,
  "last_run_at" timestamp,
  "created_by" text REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "billing_runs" (
  "id" text PRIMARY KEY,
  "cycle_id" text REFERENCES "billing_cycles"("id") ON DELETE CASCADE,
  "triggered_by" text,
  "period_label" text NOT NULL,
  "success_count" integer NOT NULL DEFAULT 0,
  "failed_count" integer NOT NULL DEFAULT 0,
  "skipped_count" integer NOT NULL DEFAULT 0,
  "total_eligible" integer NOT NULL DEFAULT 0,
  "notes" text,
  "errors" json NOT NULL DEFAULT '[]',
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- ─── Reminders ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "reminder_rules" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "offset_days" integer NOT NULL DEFAULT 0,
  "channel" text NOT NULL DEFAULT 'EMAIL',
  "template_subject" text,
  "template_body" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" text REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "reminder_logs" (
  "id" text PRIMARY KEY,
  "rule_id" text REFERENCES "reminder_rules"("id") ON DELETE SET NULL,
  "rule_name" text,
  "resident_id" text NOT NULL REFERENCES "residents"("id") ON DELETE CASCADE,
  "ledger_entry_id" text REFERENCES "ledger_entries"("id") ON DELETE SET NULL,
  "channel" text NOT NULL,
  "subject" text,
  "body" text NOT NULL,
  "status" text NOT NULL DEFAULT 'SENT',
  "triggered_by" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "reminder_logs_resident_idx"
  ON "reminder_logs" ("resident_id");
CREATE INDEX IF NOT EXISTS "reminder_logs_ledger_idx"
  ON "reminder_logs" ("ledger_entry_id");

-- ─── Bank reconciliation ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bank_imports" (
  "id" text PRIMARY KEY,
  "file_name" text NOT NULL,
  "account_label" text,
  "total_lines" integer NOT NULL DEFAULT 0,
  "matched_lines" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'PENDING',
  "uploaded_by" text REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "bank_statement_lines" (
  "id" text PRIMARY KEY,
  "import_id" text NOT NULL REFERENCES "bank_imports"("id") ON DELETE CASCADE,
  "txn_date" timestamp NOT NULL,
  "description" text NOT NULL,
  "reference" text,
  "amount" numeric NOT NULL,
  "direction" text NOT NULL DEFAULT 'CREDIT',
  "status" text NOT NULL DEFAULT 'UNMATCHED',
  "matched_resident_id" text REFERENCES "residents"("id") ON DELETE SET NULL,
  "matched_ledger_entry_id" text REFERENCES "ledger_entries"("id") ON DELETE SET NULL,
  "matched_payment_id" text,
  "suggestion_payload" json,
  "reconciled_at" timestamp,
  "reconciled_by" text REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "bank_statement_lines_import_idx"
  ON "bank_statement_lines" ("import_id");
CREATE INDEX IF NOT EXISTS "bank_statement_lines_status_idx"
  ON "bank_statement_lines" ("status");

-- ─── Expenses ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "expense_categories" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL UNIQUE,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "expenses" (
  "id" text PRIMARY KEY,
  "category_id" text REFERENCES "expense_categories"("id") ON DELETE SET NULL,
  "property_id" text REFERENCES "properties"("id") ON DELETE SET NULL,
  "vendor" text,
  "amount" numeric NOT NULL,
  "expense_date" timestamp NOT NULL,
  "description" text,
  "reference" text,
  "attachment" text,
  "status" text NOT NULL DEFAULT 'SUBMITTED',
  "rejection_reason" text,
  "submitted_by" text REFERENCES "users"("id"),
  "reviewed_by" text REFERENCES "users"("id"),
  "reviewed_at" timestamp,
  "paid_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "expenses_status_idx"
  ON "expenses" ("status");
CREATE INDEX IF NOT EXISTS "expenses_property_idx"
  ON "expenses" ("property_id");

CREATE TABLE IF NOT EXISTS "expense_events" (
  "id" text PRIMARY KEY,
  "expense_id" text NOT NULL REFERENCES "expenses"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "actor_id" text REFERENCES "users"("id"),
  "actor_name" text,
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "expense_events_expense_idx"
  ON "expense_events" ("expense_id");

COMMIT;
