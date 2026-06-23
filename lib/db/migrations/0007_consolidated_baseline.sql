-- 0007_consolidated_baseline.sql
-- WS12 (Unit-Lead v2): CONSOLIDATED, IDEMPOTENT PRODUCTION BASELINE.
--
-- Purpose
-- -------
-- The hand-written migrations 0001..0006 predate the org overhaul
-- (India -> City -> Kitchen -> Property hierarchy, foodBrands, agencies, the menu
-- module, the dispatch/batch lifecycle, etc.) and DEV/PROD actually provision the
-- schema via `drizzle-kit push --force` against lib/db/src/schema/*. Applying
-- 0001..0006 to a fresh database would NOT reproduce the current schema.
--
-- This file is the reviewable SQL artifact + fallback that brings a brand-new
-- Postgres database to the EXACT current schema. It was derived from the live dev
-- database ("uniliv") via `pg_dump --schema-only --no-owner --no-privileges` and
-- sanitized to be idempotent so it can be re-run safely and layered on top of a DB
-- that already has some objects (e.g. one provisioned by push-force).
--
-- It is a SUPERSET of 0006_kitchen_pincodes.sql (kitchen_pincodes is included
-- below) and additionally seeds the two food system_config defaults so a fresh
-- prod has working food cut-off / waste-edit-window behaviour on first boot.
--
-- Idempotency
-- -----------
--   * CREATE TYPE ......... wrapped in DO $$ ... EXCEPTION WHEN duplicate_object
--   * CREATE TABLE ........ CREATE TABLE IF NOT EXISTS
--   * CREATE INDEX ........ CREATE INDEX IF NOT EXISTS
--   * ADD CONSTRAINT ...... wrapped in DO $$ ... EXCEPTION WHEN duplicate_object
--                           OR duplicate_table (covers UNIQUE/PK backing indexes)
--   * system_config seed .. INSERT ... ON CONFLICT (key) DO NOTHING
--
-- Apply with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 0007_consolidated_baseline.sql
--
-- NOTE: This is intentionally NOT wrapped in a single BEGIN/COMMIT. Each guarded
-- DO block / IF NOT EXISTS statement is independently idempotent, and DDL that
-- references types/tables created in the same script must see them committed.
-- Run against an empty or push-provisioned database.


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DO $$ BEGIN
  CREATE TYPE public.attendance_status AS ENUM (
      'PRESENT',
      'ABSENT',
      'HALF_DAY',
      'WFH',
      'ON_LEAVE'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.booking_status AS ENUM (
      'CONFIRMED',
      'CHECKED_IN',
      'CHECKED_OUT',
      'CANCELLED',
      'NO_SHOW'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.complaint_category AS ENUM (
      'ELECTRICAL',
      'PLUMBING',
      'HOUSEKEEPING',
      'INTERNET',
      'SECURITY',
      'FOOD',
      'LAUNDRY',
      'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.complaint_status AS ENUM (
      'OPEN',
      'ASSIGNED',
      'IN_PROGRESS',
      'RESOLVED',
      'CLOSED',
      'REOPENED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.employee_status AS ENUM (
      'ACTIVE',
      'INACTIVE',
      'ON_LEAVE',
      'EXITED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.food_dish_component AS ENUM (
      'HOT_FOOD',
      'SABZI',
      'DAL',
      'RICE',
      'BREAD',
      'SALAD',
      'CURD_RAITA',
      'DESSERT',
      'PAPAD_PICKLE',
      'CHUTNEY',
      'PICKLE',
      'FRUITS',
      'BAKERY',
      'BEVERAGE',
      'SNACK',
      'MILK',
      'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.food_dispatch_status AS ENUM (
      'LOADING',
      'IN_TRANSIT',
      'DELIVERED',
      'PARTIAL'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.food_meal_type AS ENUM (
      'BREAKFAST',
      'LUNCH',
      'SNACKS',
      'DINNER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.food_measurement_unit AS ENUM (
      'G',
      'KG',
      'ML',
      'LITRE',
      'PCS',
      'PLATE',
      'SERVING'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.food_menu_share_channel AS ENUM (
      'EMAIL',
      'WHATSAPP',
      'LINK'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.food_order_status AS ENUM (
      'PLACED',
      'ACCEPTED',
      'REJECTED',
      'PREPARING',
      'DISPATCHED',
      'DELIVERED',
      'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.food_scope_level AS ENUM (
      'GLOBAL',
      'ZONE',
      'CITY',
      'KITCHEN',
      'CLUSTER',
      'PROPERTY'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.food_vehicle_type AS ENUM (
      'VAN',
      'BIKE',
      'TRUCK',
      'CAR',
      'TEMPO',
      'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.indent_status AS ENUM (
      'DRAFT',
      'SUBMITTED',
      'APPROVED',
      'REJECTED',
      'PO_RAISED',
      'DELIVERED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.laundry_status AS ENUM (
      'RECEIVED',
      'IN_WASH',
      'READY',
      'PICKED_UP',
      'DAMAGED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.lead_source AS ENUM (
      'WEBSITE',
      'WHATSAPP',
      'INSTAGRAM',
      'COLD_CALL',
      'REFERRAL',
      'COLLEGE',
      'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.lead_stage AS ENUM (
      'NEW',
      'CONTACTED',
      'VISIT_SCHEDULED',
      'VISIT_DONE',
      'NEGOTIATING',
      'CONVERTED',
      'LOST'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.leave_status AS ENUM (
      'PENDING',
      'APPROVED',
      'REJECTED',
      'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.leave_type AS ENUM (
      'CL',
      'SL',
      'EL',
      'PL',
      'COMP_OFF'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.ledger_type AS ENUM (
      'RENT',
      'UTILITY',
      'FOOD',
      'LAUNDRY',
      'PENALTY',
      'ADJUSTMENT',
      'INCENTIVE',
      'DEPOSIT'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_channel AS ENUM (
      'EMAIL',
      'SMS',
      'PUSH',
      'WHATSAPP',
      'IN_APP'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_send_status AS ENUM (
      'PENDING',
      'SENT',
      'FAILED',
      'SKIPPED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.otp_purpose AS ENUM (
      'LOGIN',
      'FORGOT_USERNAME',
      'FORGOT_PASSWORD',
      'MOBILE_VERIFY'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.otp_status AS ENUM (
      'PENDING',
      'VERIFIED',
      'CONSUMED',
      'EXPIRED',
      'LOCKED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_mode AS ENUM (
      'UPI',
      'NETBANKING',
      'CARD',
      'CASH',
      'BANK_TRANSFER',
      'WALLET',
      'WALLET_PARTIAL'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM (
      'PENDING',
      'SUCCESS',
      'FAILED',
      'REFUNDED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.po_status AS ENUM (
      'DRAFT',
      'SENT',
      'ACKNOWLEDGED',
      'PARTIAL_DELIVERY',
      'DELIVERED',
      'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.portfolio_type AS ENUM (
      'CO_LIVING',
      'STUDENT_HOUSING',
      'SERVICED_APARTMENTS',
      'PG',
      'COLLEGE_HOSTEL',
      'COWORKING',
      'MANAGED_OFFICE'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.priority AS ENUM (
      'LOW',
      'MEDIUM',
      'HIGH',
      'CRITICAL'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.property_status AS ENUM (
      'ACTIVE',
      'INACTIVE',
      'UNDER_RENOVATION'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.rate_period AS ENUM (
      'NIGHTLY',
      'WEEKLY'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.resident_status AS ENUM (
      'ACTIVE',
      'CHECKED_OUT',
      'NOTICE_PERIOD'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.room_status AS ENUM (
      'VACANT',
      'OCCUPIED',
      'MAINTENANCE',
      'RESERVED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.room_type AS ENUM (
      'SINGLE',
      'DOUBLE',
      'TRIPLE',
      'DORMITORY'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM (
      'SUPER_ADMIN',
      'HR_MANAGER',
      'OPERATIONS_MANAGER',
      'PROCUREMENT_MANAGER',
      'KITCHEN_MANAGER',
      'PROJECTS_MANAGER',
      'PROPERTY_ACQUISITION',
      'FINANCE',
      'SALES_EXECUTIVE',
      'WARDEN',
      'VENDOR_RESTRICTED',
      'AUDIT_READONLY',
      'UNIT_LEAD',
      'CLUSTER_MANAGER',
      'CITY_HEAD',
      'ZONAL_HEAD',
      'OPS_EXCELLENCE',
      'SENIOR_VICE_PRESIDENT',
      'FNB_SUPERVISOR',
      'FNB_MANAGER',
      'FNB_ZONAL_HEAD'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.wallet_transaction_type AS ENUM (
      'TOPUP',
      'PAYMENT',
      'PARTIAL_PAYMENT',
      'ADJUSTMENT_CREDIT',
      'ADJUSTMENT_DEBIT',
      'REFUND_WITHDRAWAL',
      'REVERSAL'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TABLE IF NOT EXISTS public.agencies (
    id text NOT NULL,
    name text NOT NULL,
    phone text,
    contact_name text,
    email text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.agency_locations (
    id text NOT NULL,
    agency_id text NOT NULL,
    name text NOT NULL,
    address text,
    city text,
    state text,
    pincode text,
    contact_name text,
    contact_phone text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.agency_vehicles (
    id text NOT NULL,
    agency_id text NOT NULL,
    location_id text,
    vehicle_number text NOT NULL,
    vehicle_type public.food_vehicle_type DEFAULT 'VAN'::public.food_vehicle_type NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.announcements (
    id text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    property_id text,
    target_roles json DEFAULT '[]'::json NOT NULL,
    created_by text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.attendance (
    id text NOT NULL,
    employee_id text NOT NULL,
    date timestamp without time zone NOT NULL,
    status public.attendance_status NOT NULL,
    in_time timestamp without time zone,
    out_time timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.audit_log (
    id text NOT NULL,
    user_id text,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id text,
    changes json,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bank_imports (
    id text NOT NULL,
    file_name text NOT NULL,
    account_label text,
    total_lines integer DEFAULT 0 NOT NULL,
    matched_lines integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    uploaded_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bank_statement_lines (
    id text NOT NULL,
    import_id text NOT NULL,
    txn_date timestamp without time zone NOT NULL,
    description text NOT NULL,
    reference text,
    amount numeric NOT NULL,
    direction text DEFAULT 'CREDIT'::text NOT NULL,
    status text DEFAULT 'UNMATCHED'::text NOT NULL,
    matched_resident_id text,
    matched_ledger_entry_id text,
    matched_payment_id text,
    suggestion_payload json,
    reconciled_at timestamp without time zone,
    reconciled_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.billing_cycles (
    id text NOT NULL,
    name text NOT NULL,
    property_id text,
    cadence text DEFAULT 'MONTHLY'::text NOT NULL,
    day_of_month integer DEFAULT 1 NOT NULL,
    custom_days integer,
    ledger_type text DEFAULT 'RENT'::text NOT NULL,
    description_template text DEFAULT 'Rent for {{month}}'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_run_at timestamp without time zone,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.billing_runs (
    id text NOT NULL,
    cycle_id text,
    triggered_by text,
    period_label text NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    skipped_count integer DEFAULT 0 NOT NULL,
    total_eligible integer DEFAULT 0 NOT NULL,
    notes text,
    errors json DEFAULT '[]'::json NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bookings (
    id text NOT NULL,
    booking_no text NOT NULL,
    property_id text NOT NULL,
    room_id text,
    guest_name text NOT NULL,
    guest_email text,
    guest_phone text NOT NULL,
    guest_count integer DEFAULT 1 NOT NULL,
    check_in_date timestamp without time zone NOT NULL,
    check_out_date timestamp without time zone NOT NULL,
    nights integer NOT NULL,
    rate_period public.rate_period DEFAULT 'NIGHTLY'::public.rate_period NOT NULL,
    rate_per_period numeric NOT NULL,
    subtotal numeric NOT NULL,
    tax_amount numeric DEFAULT '0'::numeric NOT NULL,
    total_amount numeric NOT NULL,
    status public.booking_status DEFAULT 'CONFIRMED'::public.booking_status NOT NULL,
    notes text,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.candidates (
    id text NOT NULL,
    job_requisition_id text,
    name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    resume_url text,
    source text,
    stage text DEFAULT 'APPLIED'::text NOT NULL,
    bgv_status text,
    offer_status text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.cities (
    id text NOT NULL,
    name text NOT NULL,
    zone_id text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.clusters (
    id text NOT NULL,
    name text NOT NULL,
    city_id text NOT NULL,
    manager_id text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.communication_logs (
    id text NOT NULL,
    channel text NOT NULL,
    subject text,
    body text NOT NULL,
    recipient_count integer DEFAULT 0 NOT NULL,
    recipient_filter json DEFAULT '{}'::json NOT NULL,
    sent_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.complaint_events (
    id text NOT NULL,
    complaint_id text NOT NULL,
    type text NOT NULL,
    from_value text,
    to_value text,
    note text,
    actor_id text,
    actor_name text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.complaint_routing (
    id text NOT NULL,
    property_id text NOT NULL,
    category text NOT NULL,
    assigned_to text NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.complaints (
    id text NOT NULL,
    property_id text NOT NULL,
    resident_id text,
    ticket_no text NOT NULL,
    category public.complaint_category NOT NULL,
    sub_category text,
    title text NOT NULL,
    description text NOT NULL,
    photos json DEFAULT '[]'::json NOT NULL,
    status public.complaint_status DEFAULT 'OPEN'::public.complaint_status NOT NULL,
    priority public.priority DEFAULT 'MEDIUM'::public.priority NOT NULL,
    assigned_to text,
    sla_hours integer DEFAULT 24 NOT NULL,
    sla_deadline timestamp without time zone,
    sla_breach boolean DEFAULT false NOT NULL,
    resolved_at timestamp without time zone,
    resolution_note text,
    rating integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.course_enrollments (
    id text NOT NULL,
    course_id text NOT NULL,
    employee_id text NOT NULL,
    progress double precision DEFAULT 0 NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    completed_at timestamp without time zone,
    score integer,
    attempts integer DEFAULT 0 NOT NULL,
    certificate_url text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.courses (
    id text NOT NULL,
    title text NOT NULL,
    description text,
    category text NOT NULL,
    target_roles json DEFAULT '[]'::json NOT NULL,
    content_url text,
    content_type text NOT NULL,
    thumbnail_url text,
    duration_minutes integer,
    is_mandatory boolean DEFAULT false NOT NULL,
    expiry_date timestamp without time zone,
    is_active boolean DEFAULT true NOT NULL,
    quiz json,
    pass_score integer DEFAULT 70,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.daily_production (
    id text NOT NULL,
    property_id text NOT NULL,
    date timestamp without time zone NOT NULL,
    dispatches json DEFAULT '[]'::json NOT NULL,
    wastage json DEFAULT '[]'::json NOT NULL,
    receivings json DEFAULT '[]'::json NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.delivery_partners (
    id text NOT NULL,
    name text NOT NULL,
    phone text,
    vehicle_number text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.dish_ingredients (
    id text NOT NULL,
    dish_id text NOT NULL,
    raw_material_id text NOT NULL,
    quantity numeric(12,3),
    unit public.food_measurement_unit,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.dishes (
    id text NOT NULL,
    name text NOT NULL,
    component public.food_dish_component NOT NULL,
    unit public.food_measurement_unit NOT NULL,
    photo_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    brands text[] DEFAULT '{}'::text[] NOT NULL,
    preparations text[] DEFAULT '{}'::text[] NOT NULL
);

CREATE TABLE IF NOT EXISTS public.electricity_meters (
    id text NOT NULL,
    property_id text NOT NULL,
    room_id text,
    resident_id text,
    meter_no text NOT NULL,
    label text,
    tariff_id text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.electricity_readings (
    id text NOT NULL,
    meter_id text NOT NULL,
    reading_date timestamp without time zone NOT NULL,
    reading numeric NOT NULL,
    prev_reading numeric,
    units_consumed numeric,
    amount numeric,
    ledger_entry_id text,
    posted boolean DEFAULT false NOT NULL,
    notes text,
    recorded_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.electricity_tariffs (
    id text NOT NULL,
    property_id text,
    name text NOT NULL,
    rate_per_unit numeric NOT NULL,
    fixed_charge numeric DEFAULT '0'::numeric NOT NULL,
    effective_from timestamp without time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.employees (
    id text NOT NULL,
    employee_code text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    dob timestamp without time zone,
    gender text,
    photo text,
    department text NOT NULL,
    designation text NOT NULL,
    property_id text,
    manager_id text,
    joining_date timestamp without time zone NOT NULL,
    ctc numeric,
    basic numeric,
    hra numeric,
    special_allowance numeric,
    bank_account text,
    ifsc_code text,
    pan_number text,
    pf_number text,
    esic_number text,
    status public.employee_status DEFAULT 'ACTIVE'::public.employee_status NOT NULL,
    exited_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.escalations (
    id text NOT NULL,
    complaint_id text NOT NULL,
    level integer NOT NULL,
    escalated_to text NOT NULL,
    reason text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.esign_events (
    id text NOT NULL,
    esign_request_id text NOT NULL,
    type text NOT NULL,
    ip text,
    user_agent text,
    payload json,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.esign_requests (
    id text NOT NULL,
    resident_id text NOT NULL,
    document_name text NOT NULL,
    document_body text NOT NULL,
    signer_email text,
    signer_phone text,
    signer_token text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    viewed_at timestamp without time zone,
    signed_at timestamp without time zone,
    signer_name text,
    signature_svg text,
    signer_ip text,
    signer_user_agent text,
    signed_pdf text,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.exit_assets (
    id text NOT NULL,
    exit_id text NOT NULL,
    asset text NOT NULL,
    returned boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.exit_clearances (
    id text NOT NULL,
    exit_id text NOT NULL,
    department text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    cleared_by text,
    cleared_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.exits (
    id text NOT NULL,
    employee_id text NOT NULL,
    exit_type text NOT NULL,
    exit_date timestamp without time zone NOT NULL,
    reason text,
    status text DEFAULT 'IN_PROGRESS'::text NOT NULL,
    final_settlement numeric,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.expense_categories (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.expense_events (
    id text NOT NULL,
    expense_id text NOT NULL,
    type text NOT NULL,
    actor_id text,
    actor_name text,
    note text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.expenses (
    id text NOT NULL,
    category_id text,
    property_id text,
    vendor text,
    amount numeric NOT NULL,
    expense_date timestamp without time zone NOT NULL,
    description text,
    reference text,
    attachment text,
    status text DEFAULT 'SUBMITTED'::text NOT NULL,
    rejection_reason text,
    submitted_by text,
    reviewed_by text,
    reviewed_at timestamp without time zone,
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.facility_assets (
    id text NOT NULL,
    property_id text NOT NULL,
    asset_code text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    location text,
    manufacturer text,
    model_no text,
    install_date timestamp without time zone,
    warranty_expiry timestamp without time zone,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.facility_logs (
    id text NOT NULL,
    schedule_id text,
    asset_id text NOT NULL,
    performed_at timestamp without time zone NOT NULL,
    performed_by text,
    vendor_id text,
    cost numeric,
    outcome text DEFAULT 'COMPLETED'::text NOT NULL,
    notes text,
    attachment text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.facility_schedules (
    id text NOT NULL,
    asset_id text NOT NULL,
    task_name text NOT NULL,
    frequency_days integer NOT NULL,
    vendor_id text,
    assigned_to text,
    next_due_date timestamp without time zone NOT NULL,
    last_done_at timestamp without time zone,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.food_brands (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.food_cutoffs (
    id text NOT NULL,
    brand text NOT NULL,
    property_id text,
    cutoff_time text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.food_dispatches (
    id text NOT NULL,
    dispatch_number text NOT NULL,
    kitchen_id text,
    delivery_partner_id text,
    vehicle_number text,
    driver_name text,
    driver_phone text,
    dispatched_by_id text,
    dispatched_at timestamp without time zone,
    estimated_arrival_at timestamp without time zone,
    status public.food_dispatch_status DEFAULT 'LOADING'::public.food_dispatch_status NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    vehicle_id text
);

CREATE TABLE IF NOT EXISTS public.food_meal_config (
    id text NOT NULL,
    meal_type public.food_meal_type NOT NULL,
    display_label text NOT NULL,
    brand text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.food_meal_windows (
    id text NOT NULL,
    brand text,
    property_id text,
    meal_type public.food_meal_type NOT NULL,
    cutoff_time text,
    service_time text,
    lead_time_minutes integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.food_menu_rotation (
    id text NOT NULL,
    brand text NOT NULL,
    rotation_week integer DEFAULT 1 NOT NULL,
    day_of_week integer NOT NULL,
    meal_type public.food_meal_type NOT NULL,
    dish_id text NOT NULL,
    slot_label text,
    sort_order integer DEFAULT 0 NOT NULL,
    effective_from timestamp without time zone,
    effective_to timestamp without time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    kitchen_id text
);

CREATE TABLE IF NOT EXISTS public.food_menu_shares (
    id text NOT NULL,
    shared_by_id text NOT NULL,
    property_id text NOT NULL,
    brand text NOT NULL,
    meal_type public.food_meal_type,
    menu_date timestamp without time zone,
    channel public.food_menu_share_channel NOT NULL,
    recipient_type text NOT NULL,
    recipients json DEFAULT '[]'::json NOT NULL,
    share_token text,
    shared_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.food_order_batches (
    id text NOT NULL,
    batch_number text NOT NULL,
    property_id text NOT NULL,
    unit_lead_id text NOT NULL,
    brand text NOT NULL,
    service_date timestamp without time zone NOT NULL,
    residents_count integer NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.food_order_events (
    id text NOT NULL,
    order_id text NOT NULL,
    status public.food_order_status NOT NULL,
    note text,
    actor_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.food_order_items (
    id text NOT NULL,
    order_id text NOT NULL,
    dish_id text NOT NULL,
    unit public.food_measurement_unit NOT NULL,
    ordered_qty numeric(12,3) NOT NULL,
    prepared_qty numeric(12,3),
    received_qty numeric(12,3),
    wasted_qty numeric(12,3),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    persons_count integer
);

CREATE TABLE IF NOT EXISTS public.food_orders (
    id text NOT NULL,
    order_number text NOT NULL,
    property_id text NOT NULL,
    brand text NOT NULL,
    meal_type public.food_meal_type NOT NULL,
    unit_lead_id text NOT NULL,
    residents_count integer NOT NULL,
    total_quantity numeric(12,3),
    status public.food_order_status DEFAULT 'PLACED'::public.food_order_status NOT NULL,
    service_date timestamp without time zone NOT NULL,
    notes text,
    delivery_partner_id text,
    dispatched_by_id text,
    dispatch_started_at timestamp without time zone,
    dispatched_at timestamp without time zone,
    confirmed_by_id text,
    delivered_at timestamp without time zone,
    delivery_remarks text,
    waste_editable_until timestamp without time zone,
    preparing_at timestamp without time zone,
    cancelled_at timestamp without time zone,
    cancel_reason text,
    created_by_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    accepted_by_id text,
    accepted_at timestamp without time zone,
    rejected_at timestamp without time zone,
    rejection_reason text,
    batch_id text,
    kitchen_id text,
    dispatch_id text,
    expected_delivery_at timestamp without time zone,
    vehicle_id text
);

CREATE TABLE IF NOT EXISTS public.grns (
    id text NOT NULL,
    grn_number text NOT NULL,
    po_id text NOT NULL,
    property_id text NOT NULL,
    items json NOT NULL,
    invoice_number text,
    invoice_photo_url text,
    qc_pass boolean DEFAULT true NOT NULL,
    qc_notes text,
    status text DEFAULT 'PENDING_QC'::text NOT NULL,
    photos json DEFAULT '[]'::json NOT NULL,
    received_by text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.indents (
    id text NOT NULL,
    indent_number text,
    property_id text NOT NULL,
    department text NOT NULL,
    items json NOT NULL,
    total_estimated_value numeric DEFAULT '0'::numeric NOT NULL,
    status public.indent_status DEFAULT 'DRAFT'::public.indent_status NOT NULL,
    urgency text DEFAULT 'NORMAL'::text NOT NULL,
    purpose text,
    budget_head text,
    approved_by text,
    approved_at timestamp without time zone,
    rejection_reason text,
    submitted_at timestamp without time zone,
    po_id text,
    created_by text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.integration_status (
    id text NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    config json,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.interviews (
    id text NOT NULL,
    candidate_id text NOT NULL,
    scheduled_at timestamp without time zone NOT NULL,
    panel text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.inventory (
    id text NOT NULL,
    property_id text,
    name text NOT NULL,
    sku text,
    category text NOT NULL,
    unit text NOT NULL,
    current_stock numeric DEFAULT '0'::numeric NOT NULL,
    min_stock numeric DEFAULT '0'::numeric NOT NULL,
    expiry_date timestamp without time zone,
    unit_cost numeric,
    location text,
    is_asset boolean DEFAULT false NOT NULL,
    asset_tag text,
    condition text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.iot_devices (
    id text NOT NULL,
    property_id text NOT NULL,
    room_id text,
    name text NOT NULL,
    device_type text NOT NULL,
    adapter text DEFAULT 'GENERIC'::text NOT NULL,
    endpoint text,
    ingestion_token text NOT NULL,
    config json DEFAULT '{}'::json NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    last_seen_at timestamp without time zone,
    registered_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.iot_readings (
    id text NOT NULL,
    device_id text NOT NULL,
    metric text NOT NULL,
    value numeric,
    raw_payload json,
    recorded_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.job_requisitions (
    id text NOT NULL,
    role text NOT NULL,
    department text NOT NULL,
    headcount integer NOT NULL,
    status text DEFAULT 'OPEN'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.kitchen_pincodes (
    id text NOT NULL,
    kitchen_id text NOT NULL,
    pincode text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.kitchens (
    id text NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    brand text,
    address text,
    city text,
    state text,
    pincode text,
    lat double precision,
    lng double precision,
    contact_name text,
    contact_phone text,
    cluster_id text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    city_id text,
    contact_email text
);

CREATE TABLE IF NOT EXISTS public.kyc_events (
    id text NOT NULL,
    kyc_request_id text NOT NULL,
    type text NOT NULL,
    actor_id text,
    ip text,
    user_agent text,
    payload json,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.kyc_requests (
    id text NOT NULL,
    resident_id text NOT NULL,
    id_type text NOT NULL,
    id_number text NOT NULL,
    id_image_front text,
    id_image_back text,
    selfie_image text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    provider text DEFAULT 'MANUAL'::text,
    provider_ref text,
    provider_data json,
    rejection_reason text,
    reviewed_by text,
    reviewed_at timestamp without time zone,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.laundry_batches (
    id text NOT NULL,
    batch_no text NOT NULL,
    resident_id text NOT NULL,
    property_id text NOT NULL,
    drop_date timestamp without time zone NOT NULL,
    commit_tat_days integer DEFAULT 2 NOT NULL,
    items json DEFAULT '{}'::json NOT NULL,
    special_instructions text,
    damage_note text,
    status public.laundry_status DEFAULT 'RECEIVED'::public.laundry_status NOT NULL,
    picked_up_at timestamp without time zone,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.lead_activities (
    id text NOT NULL,
    lead_id text NOT NULL,
    type text NOT NULL,
    note text,
    meta json,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.leads (
    id text NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    source public.lead_source NOT NULL,
    property_id text,
    stage public.lead_stage DEFAULT 'NEW'::public.lead_stage NOT NULL,
    assigned_to text,
    budget_min numeric,
    budget_max numeric,
    move_in_date timestamp without time zone,
    visit_date timestamp without time zone,
    visit_done boolean DEFAULT false NOT NULL,
    visit_outcome text,
    visit_feedback text,
    lost_reason text,
    notes text,
    follow_up_at timestamp without time zone,
    follow_up_note text,
    converted_at timestamp without time zone,
    resident_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.leave_balances (
    id text NOT NULL,
    employee_id text NOT NULL,
    year integer NOT NULL,
    type public.leave_type NOT NULL,
    total double precision NOT NULL,
    used double precision DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.leaves (
    id text NOT NULL,
    employee_id text NOT NULL,
    type public.leave_type NOT NULL,
    from_date timestamp without time zone NOT NULL,
    to_date timestamp without time zone NOT NULL,
    days double precision NOT NULL,
    reason text NOT NULL,
    status public.leave_status DEFAULT 'PENDING'::public.leave_status NOT NULL,
    approved_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
    id text NOT NULL,
    resident_id text NOT NULL,
    type public.ledger_type NOT NULL,
    amount numeric NOT NULL,
    description text NOT NULL,
    due_date timestamp without time zone,
    is_paid boolean DEFAULT false NOT NULL,
    paid_on timestamp without time zone,
    reference text,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.menu_composition_rules (
    id text NOT NULL,
    brand text NOT NULL,
    meal_type public.food_meal_type NOT NULL,
    kitchen_id text,
    name text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.menu_composition_slots (
    id text NOT NULL,
    rule_id text NOT NULL,
    slot_label text,
    component public.food_dish_component,
    preparation text,
    min_count integer DEFAULT 1 NOT NULL,
    max_count integer,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.menu_plans (
    id text NOT NULL,
    property_id text NOT NULL,
    week_start timestamp without time zone NOT NULL,
    slots json NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    published_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.message_templates (
    id text NOT NULL,
    name text NOT NULL,
    channel text NOT NULL,
    body text NOT NULL,
    variables json DEFAULT '[]'::json NOT NULL,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notification_outbox (
    id text NOT NULL,
    user_id text,
    channel public.notification_channel NOT NULL,
    to_address text,
    template_key text,
    subject text,
    body text,
    payload json,
    entity_type text,
    entity_id text,
    status public.notification_send_status DEFAULT 'PENDING'::public.notification_send_status NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    provider_message_id text,
    scheduled_for timestamp without time zone,
    sent_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id text NOT NULL,
    user_id text NOT NULL,
    event_type text NOT NULL,
    email_enabled boolean DEFAULT true NOT NULL,
    push_enabled boolean DEFAULT true NOT NULL,
    in_app_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notification_suppressions (
    id text NOT NULL,
    channel public.notification_channel NOT NULL,
    address text NOT NULL,
    reason text NOT NULL,
    detail text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id text NOT NULL,
    user_id text NOT NULL,
    title text NOT NULL,
    body text,
    type text NOT NULL,
    link text,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.offers (
    id text NOT NULL,
    candidate_id text NOT NULL,
    ctc numeric NOT NULL,
    joining_date timestamp without time zone NOT NULL,
    generated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.otp_challenges (
    id text NOT NULL,
    user_id text,
    phone text NOT NULL,
    purpose public.otp_purpose NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    resend_count integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    max_resend integer DEFAULT 3 NOT NULL,
    last_sent_at timestamp without time zone,
    consumed_at timestamp without time zone,
    verification_token text,
    status public.otp_status DEFAULT 'PENDING'::public.otp_status NOT NULL,
    ip text,
    user_agent text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.out_passes (
    id text NOT NULL,
    resident_id text NOT NULL,
    property_id text NOT NULL,
    reason text NOT NULL,
    destination text,
    leave_on timestamp without time zone NOT NULL,
    expected_return timestamp without time zone NOT NULL,
    actual_return timestamp without time zone,
    status text DEFAULT 'PENDING'::text NOT NULL,
    approver_id text,
    approver_note text,
    parent_notified boolean DEFAULT false NOT NULL,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payments (
    id text NOT NULL,
    resident_id text NOT NULL,
    amount numeric NOT NULL,
    mode public.payment_mode NOT NULL,
    status public.payment_status DEFAULT 'PENDING'::public.payment_status NOT NULL,
    razorpay_order_id text,
    razorpay_pay_id text,
    reference text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.per_resident_rules (
    id text NOT NULL,
    brand text NOT NULL,
    meal_type public.food_meal_type NOT NULL,
    dish_id text NOT NULL,
    property_id text,
    qty_per_resident numeric(12,3) NOT NULL,
    unit public.food_measurement_unit NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.performance_notes (
    id text NOT NULL,
    employee_id text NOT NULL,
    type text NOT NULL,
    text text NOT NULL,
    date timestamp without time zone DEFAULT now() NOT NULL,
    added_by text
);

CREATE TABLE IF NOT EXISTS public.properties (
    id text NOT NULL,
    name text NOT NULL,
    address text NOT NULL,
    city text NOT NULL,
    state text NOT NULL,
    pincode text NOT NULL,
    lat double precision,
    lng double precision,
    total_beds integer NOT NULL,
    status public.property_status DEFAULT 'ACTIVE'::public.property_status NOT NULL,
    portfolio_type public.portfolio_type DEFAULT 'CO_LIVING'::public.portfolio_type NOT NULL,
    portfolio_attributes json DEFAULT '{}'::json NOT NULL,
    warden_id text,
    cluster_id text,
    phone text,
    email text,
    amenities json DEFAULT '[]'::json NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    brand text,
    kitchen_id text
);

CREATE TABLE IF NOT EXISTS public.property_leads (
    id text NOT NULL,
    name text NOT NULL,
    address text NOT NULL,
    city text NOT NULL,
    lat double precision,
    lng double precision,
    owner_name text,
    owner_phone text,
    total_area double precision,
    asking_rent numeric,
    bed_count integer,
    stage text DEFAULT 'SCOUTING'::text NOT NULL,
    viability_data json,
    documents json DEFAULT '[]'::json NOT NULL,
    photos json DEFAULT '[]'::json NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id text NOT NULL,
    po_number text NOT NULL,
    vendor_id text NOT NULL,
    property_id text,
    indent_id text,
    items json NOT NULL,
    subtotal numeric DEFAULT '0'::numeric NOT NULL,
    gst_applicable boolean DEFAULT false NOT NULL,
    gst_amount numeric DEFAULT '0'::numeric NOT NULL,
    total_amount numeric NOT NULL,
    payment_terms text,
    status public.po_status DEFAULT 'DRAFT'::public.po_status NOT NULL,
    approved_by text,
    delivery_date timestamp without time zone,
    sent_at timestamp without time zone,
    grn_id text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id text NOT NULL,
    user_id text NOT NULL,
    endpoint text NOT NULL,
    p256dh text,
    auth text,
    user_agent text,
    is_active boolean DEFAULT true NOT NULL,
    last_used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.rate_contracts (
    id text NOT NULL,
    vendor_id text NOT NULL,
    item_name text NOT NULL,
    unit text NOT NULL,
    rate numeric NOT NULL,
    valid_from timestamp without time zone NOT NULL,
    valid_to timestamp without time zone NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.raw_materials (
    id text NOT NULL,
    name text NOT NULL,
    unit public.food_measurement_unit NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.recipe_feedback (
    id text NOT NULL,
    recipe_id text NOT NULL,
    property_id text NOT NULL,
    rating integer NOT NULL,
    comment text,
    week_start timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.recipes (
    id text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    meal_type text NOT NULL,
    ingredients json NOT NULL,
    method text,
    photo_url text,
    allergens json DEFAULT '[]'::json NOT NULL,
    is_veg boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.refresh_tokens (
    id text NOT NULL,
    user_id text NOT NULL,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.reminder_logs (
    id text NOT NULL,
    rule_id text,
    rule_name text,
    resident_id text NOT NULL,
    ledger_entry_id text,
    channel text NOT NULL,
    subject text,
    body text NOT NULL,
    status text DEFAULT 'SENT'::text NOT NULL,
    triggered_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.reminder_rules (
    id text NOT NULL,
    name text NOT NULL,
    offset_days integer DEFAULT 0 NOT NULL,
    channel text DEFAULT 'EMAIL'::text NOT NULL,
    template_subject text,
    template_body text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.report_jobs (
    id text NOT NULL,
    requested_by_id text,
    kind text NOT NULL,
    format text NOT NULL,
    params json,
    status text DEFAULT 'PENDING'::text NOT NULL,
    file_url text,
    error text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.resident_attendance (
    id text NOT NULL,
    resident_id text NOT NULL,
    property_id text NOT NULL,
    attendance_date date NOT NULL,
    status text DEFAULT 'PRESENT'::text NOT NULL,
    notes text,
    marked_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.residents (
    id text NOT NULL,
    property_id text NOT NULL,
    room_id text,
    name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    dob timestamp without time zone,
    gender text,
    photo text,
    college text,
    course text,
    parent_name text,
    parent_phone text,
    parent_email text,
    emergency_contact text,
    dietary_pref json DEFAULT '[]'::json NOT NULL,
    allergies json DEFAULT '[]'::json NOT NULL,
    check_in_date timestamp without time zone,
    check_out_date timestamp without time zone,
    plan_type text,
    monthly_rent numeric,
    security_deposit numeric,
    status public.resident_status DEFAULT 'ACTIVE'::public.resident_status NOT NULL,
    wallet_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.rooms (
    id text NOT NULL,
    property_id text NOT NULL,
    number text NOT NULL,
    floor integer NOT NULL,
    wing text,
    type public.room_type NOT NULL,
    capacity integer NOT NULL,
    status public.room_status DEFAULT 'VACANT'::public.room_status NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sla_config (
    id text NOT NULL,
    category text NOT NULL,
    sla_hours integer NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
    id text NOT NULL,
    inventory_id text NOT NULL,
    type text NOT NULL,
    quantity numeric NOT NULL,
    reference text,
    notes text,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.system_config (
    id text NOT NULL,
    key text NOT NULL,
    value json,
    description text,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_scopes (
    id text NOT NULL,
    user_id text NOT NULL,
    scope_level public.food_scope_level NOT NULL,
    zone_id text,
    city_id text,
    cluster_id text,
    property_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    kitchen_id text
);

CREATE TABLE IF NOT EXISTS public.users (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    password_hash text NOT NULL,
    role public.user_role NOT NULL,
    property_id text,
    is_active boolean DEFAULT true NOT NULL,
    last_login timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    username text,
    designation text,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp without time zone,
    mobile_verified_at timestamp without time zone,
    current_session_id text
);

CREATE TABLE IF NOT EXISTS public.vendor_documents (
    id text NOT NULL,
    vendor_id text NOT NULL,
    doc_type text NOT NULL,
    file_url text,
    expiry_date timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.vendors (
    id text NOT NULL,
    name text NOT NULL,
    gstin text,
    pan text,
    phone text NOT NULL,
    email text,
    address text,
    categories json DEFAULT '[]'::json NOT NULL,
    bank_account text,
    ifsc_code text,
    rating double precision,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.wallet_config (
    id text NOT NULL,
    property_id text NOT NULL,
    minimum_balance numeric DEFAULT '-100'::numeric NOT NULL,
    low_balance_alert numeric DEFAULT '200'::numeric NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    topup_notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id text NOT NULL,
    wallet_id text NOT NULL,
    resident_id text NOT NULL,
    type public.wallet_transaction_type NOT NULL,
    amount numeric NOT NULL,
    balance_before numeric NOT NULL,
    balance_after numeric NOT NULL,
    description text NOT NULL,
    reference_id text,
    reference_type text,
    reversal_of text,
    recorded_by text NOT NULL,
    notes text,
    property_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.wallets (
    id text NOT NULL,
    resident_id text NOT NULL,
    balance numeric DEFAULT '0'::numeric NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.zones (
    id text NOT NULL,
    name text NOT NULL,
    code text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agencies_pkey') THEN
    ALTER TABLE ONLY public.agencies ADD CONSTRAINT agencies_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agency_locations_pkey') THEN
    ALTER TABLE ONLY public.agency_locations ADD CONSTRAINT agency_locations_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agency_vehicles_pkey') THEN
    ALTER TABLE ONLY public.agency_vehicles ADD CONSTRAINT agency_vehicles_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'announcements_pkey') THEN
    ALTER TABLE ONLY public.announcements ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_pkey') THEN
    ALTER TABLE ONLY public.attendance ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_pkey') THEN
    ALTER TABLE ONLY public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_imports_pkey') THEN
    ALTER TABLE ONLY public.bank_imports ADD CONSTRAINT bank_imports_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_statement_lines_pkey') THEN
    ALTER TABLE ONLY public.bank_statement_lines ADD CONSTRAINT bank_statement_lines_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_cycles_pkey') THEN
    ALTER TABLE ONLY public.billing_cycles ADD CONSTRAINT billing_cycles_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_runs_pkey') THEN
    ALTER TABLE ONLY public.billing_runs ADD CONSTRAINT billing_runs_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_booking_no_unique') THEN
    ALTER TABLE ONLY public.bookings ADD CONSTRAINT bookings_booking_no_unique UNIQUE (booking_no);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_pkey') THEN
    ALTER TABLE ONLY public.bookings ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidates_pkey') THEN
    ALTER TABLE ONLY public.candidates ADD CONSTRAINT candidates_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cities_pkey') THEN
    ALTER TABLE ONLY public.cities ADD CONSTRAINT cities_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clusters_pkey') THEN
    ALTER TABLE ONLY public.clusters ADD CONSTRAINT clusters_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communication_logs_pkey') THEN
    ALTER TABLE ONLY public.communication_logs ADD CONSTRAINT communication_logs_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'complaint_events_pkey') THEN
    ALTER TABLE ONLY public.complaint_events ADD CONSTRAINT complaint_events_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'complaint_routing_pkey') THEN
    ALTER TABLE ONLY public.complaint_routing ADD CONSTRAINT complaint_routing_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'complaints_pkey') THEN
    ALTER TABLE ONLY public.complaints ADD CONSTRAINT complaints_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'complaints_ticket_no_unique') THEN
    ALTER TABLE ONLY public.complaints ADD CONSTRAINT complaints_ticket_no_unique UNIQUE (ticket_no);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'course_enrollments_pkey') THEN
    ALTER TABLE ONLY public.course_enrollments ADD CONSTRAINT course_enrollments_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'courses_pkey') THEN
    ALTER TABLE ONLY public.courses ADD CONSTRAINT courses_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_production_pkey') THEN
    ALTER TABLE ONLY public.daily_production ADD CONSTRAINT daily_production_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_partners_pkey') THEN
    ALTER TABLE ONLY public.delivery_partners ADD CONSTRAINT delivery_partners_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dish_ingredients_pkey') THEN
    ALTER TABLE ONLY public.dish_ingredients ADD CONSTRAINT dish_ingredients_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dishes_pkey') THEN
    ALTER TABLE ONLY public.dishes ADD CONSTRAINT dishes_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'electricity_meters_pkey') THEN
    ALTER TABLE ONLY public.electricity_meters ADD CONSTRAINT electricity_meters_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'electricity_readings_pkey') THEN
    ALTER TABLE ONLY public.electricity_readings ADD CONSTRAINT electricity_readings_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'electricity_tariffs_pkey') THEN
    ALTER TABLE ONLY public.electricity_tariffs ADD CONSTRAINT electricity_tariffs_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_email_unique') THEN
    ALTER TABLE ONLY public.employees ADD CONSTRAINT employees_email_unique UNIQUE (email);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_employee_code_unique') THEN
    ALTER TABLE ONLY public.employees ADD CONSTRAINT employees_employee_code_unique UNIQUE (employee_code);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_pkey') THEN
    ALTER TABLE ONLY public.employees ADD CONSTRAINT employees_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'escalations_pkey') THEN
    ALTER TABLE ONLY public.escalations ADD CONSTRAINT escalations_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'esign_events_pkey') THEN
    ALTER TABLE ONLY public.esign_events ADD CONSTRAINT esign_events_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'esign_requests_pkey') THEN
    ALTER TABLE ONLY public.esign_requests ADD CONSTRAINT esign_requests_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'esign_requests_signer_token_unique') THEN
    ALTER TABLE ONLY public.esign_requests ADD CONSTRAINT esign_requests_signer_token_unique UNIQUE (signer_token);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exit_assets_pkey') THEN
    ALTER TABLE ONLY public.exit_assets ADD CONSTRAINT exit_assets_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exit_clearances_pkey') THEN
    ALTER TABLE ONLY public.exit_clearances ADD CONSTRAINT exit_clearances_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exits_pkey') THEN
    ALTER TABLE ONLY public.exits ADD CONSTRAINT exits_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_categories_name_unique') THEN
    ALTER TABLE ONLY public.expense_categories ADD CONSTRAINT expense_categories_name_unique UNIQUE (name);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_categories_pkey') THEN
    ALTER TABLE ONLY public.expense_categories ADD CONSTRAINT expense_categories_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_events_pkey') THEN
    ALTER TABLE ONLY public.expense_events ADD CONSTRAINT expense_events_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_pkey') THEN
    ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facility_assets_pkey') THEN
    ALTER TABLE ONLY public.facility_assets ADD CONSTRAINT facility_assets_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facility_logs_pkey') THEN
    ALTER TABLE ONLY public.facility_logs ADD CONSTRAINT facility_logs_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facility_schedules_pkey') THEN
    ALTER TABLE ONLY public.facility_schedules ADD CONSTRAINT facility_schedules_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_brands_code_unique') THEN
    ALTER TABLE ONLY public.food_brands ADD CONSTRAINT food_brands_code_unique UNIQUE (code);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_brands_pkey') THEN
    ALTER TABLE ONLY public.food_brands ADD CONSTRAINT food_brands_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_cutoffs_pkey') THEN
    ALTER TABLE ONLY public.food_cutoffs ADD CONSTRAINT food_cutoffs_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_dispatches_dispatch_number_unique') THEN
    ALTER TABLE ONLY public.food_dispatches ADD CONSTRAINT food_dispatches_dispatch_number_unique UNIQUE (dispatch_number);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_dispatches_pkey') THEN
    ALTER TABLE ONLY public.food_dispatches ADD CONSTRAINT food_dispatches_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_meal_config_meal_type_unique') THEN
    ALTER TABLE ONLY public.food_meal_config ADD CONSTRAINT food_meal_config_meal_type_unique UNIQUE (meal_type);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_meal_config_pkey') THEN
    ALTER TABLE ONLY public.food_meal_config ADD CONSTRAINT food_meal_config_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_meal_windows_pkey') THEN
    ALTER TABLE ONLY public.food_meal_windows ADD CONSTRAINT food_meal_windows_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_menu_rotation_pkey') THEN
    ALTER TABLE ONLY public.food_menu_rotation ADD CONSTRAINT food_menu_rotation_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_menu_shares_pkey') THEN
    ALTER TABLE ONLY public.food_menu_shares ADD CONSTRAINT food_menu_shares_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_menu_shares_share_token_unique') THEN
    ALTER TABLE ONLY public.food_menu_shares ADD CONSTRAINT food_menu_shares_share_token_unique UNIQUE (share_token);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_order_batches_batch_number_unique') THEN
    ALTER TABLE ONLY public.food_order_batches ADD CONSTRAINT food_order_batches_batch_number_unique UNIQUE (batch_number);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_order_batches_pkey') THEN
    ALTER TABLE ONLY public.food_order_batches ADD CONSTRAINT food_order_batches_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_order_events_pkey') THEN
    ALTER TABLE ONLY public.food_order_events ADD CONSTRAINT food_order_events_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_order_items_pkey') THEN
    ALTER TABLE ONLY public.food_order_items ADD CONSTRAINT food_order_items_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_orders_order_number_unique') THEN
    ALTER TABLE ONLY public.food_orders ADD CONSTRAINT food_orders_order_number_unique UNIQUE (order_number);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_orders_pkey') THEN
    ALTER TABLE ONLY public.food_orders ADD CONSTRAINT food_orders_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grns_grn_number_unique') THEN
    ALTER TABLE ONLY public.grns ADD CONSTRAINT grns_grn_number_unique UNIQUE (grn_number);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grns_pkey') THEN
    ALTER TABLE ONLY public.grns ADD CONSTRAINT grns_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indents_indent_number_unique') THEN
    ALTER TABLE ONLY public.indents ADD CONSTRAINT indents_indent_number_unique UNIQUE (indent_number);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indents_pkey') THEN
    ALTER TABLE ONLY public.indents ADD CONSTRAINT indents_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_status_name_unique') THEN
    ALTER TABLE ONLY public.integration_status ADD CONSTRAINT integration_status_name_unique UNIQUE (name);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_status_pkey') THEN
    ALTER TABLE ONLY public.integration_status ADD CONSTRAINT integration_status_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interviews_pkey') THEN
    ALTER TABLE ONLY public.interviews ADD CONSTRAINT interviews_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_pkey') THEN
    ALTER TABLE ONLY public.inventory ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'iot_devices_pkey') THEN
    ALTER TABLE ONLY public.iot_devices ADD CONSTRAINT iot_devices_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'iot_readings_pkey') THEN
    ALTER TABLE ONLY public.iot_readings ADD CONSTRAINT iot_readings_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_requisitions_pkey') THEN
    ALTER TABLE ONLY public.job_requisitions ADD CONSTRAINT job_requisitions_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_pincodes_pincode_unique') THEN
    ALTER TABLE ONLY public.kitchen_pincodes ADD CONSTRAINT kitchen_pincodes_pincode_unique UNIQUE (pincode);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_pincodes_pkey') THEN
    ALTER TABLE ONLY public.kitchen_pincodes ADD CONSTRAINT kitchen_pincodes_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchens_code_unique') THEN
    ALTER TABLE ONLY public.kitchens ADD CONSTRAINT kitchens_code_unique UNIQUE (code);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchens_pkey') THEN
    ALTER TABLE ONLY public.kitchens ADD CONSTRAINT kitchens_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kyc_events_pkey') THEN
    ALTER TABLE ONLY public.kyc_events ADD CONSTRAINT kyc_events_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kyc_requests_pkey') THEN
    ALTER TABLE ONLY public.kyc_requests ADD CONSTRAINT kyc_requests_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'laundry_batches_batch_no_unique') THEN
    ALTER TABLE ONLY public.laundry_batches ADD CONSTRAINT laundry_batches_batch_no_unique UNIQUE (batch_no);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'laundry_batches_pkey') THEN
    ALTER TABLE ONLY public.laundry_batches ADD CONSTRAINT laundry_batches_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_activities_pkey') THEN
    ALTER TABLE ONLY public.lead_activities ADD CONSTRAINT lead_activities_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_pkey') THEN
    ALTER TABLE ONLY public.leads ADD CONSTRAINT leads_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_balances_pkey') THEN
    ALTER TABLE ONLY public.leave_balances ADD CONSTRAINT leave_balances_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leaves_pkey') THEN
    ALTER TABLE ONLY public.leaves ADD CONSTRAINT leaves_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_entries_pkey') THEN
    ALTER TABLE ONLY public.ledger_entries ADD CONSTRAINT ledger_entries_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_composition_rules_pkey') THEN
    ALTER TABLE ONLY public.menu_composition_rules ADD CONSTRAINT menu_composition_rules_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_composition_slots_pkey') THEN
    ALTER TABLE ONLY public.menu_composition_slots ADD CONSTRAINT menu_composition_slots_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_plans_pkey') THEN
    ALTER TABLE ONLY public.menu_plans ADD CONSTRAINT menu_plans_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_templates_pkey') THEN
    ALTER TABLE ONLY public.message_templates ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_outbox_pkey') THEN
    ALTER TABLE ONLY public.notification_outbox ADD CONSTRAINT notification_outbox_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_preferences_pkey') THEN
    ALTER TABLE ONLY public.notification_preferences ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_suppressions_channel_address_uq') THEN
    ALTER TABLE ONLY public.notification_suppressions ADD CONSTRAINT notification_suppressions_channel_address_uq UNIQUE (channel, address);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_suppressions_pkey') THEN
    ALTER TABLE ONLY public.notification_suppressions ADD CONSTRAINT notification_suppressions_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_pkey') THEN
    ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offers_pkey') THEN
    ALTER TABLE ONLY public.offers ADD CONSTRAINT offers_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'otp_challenges_pkey') THEN
    ALTER TABLE ONLY public.otp_challenges ADD CONSTRAINT otp_challenges_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'otp_challenges_verification_token_unique') THEN
    ALTER TABLE ONLY public.otp_challenges ADD CONSTRAINT otp_challenges_verification_token_unique UNIQUE (verification_token);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'out_passes_pkey') THEN
    ALTER TABLE ONLY public.out_passes ADD CONSTRAINT out_passes_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_pkey') THEN
    ALTER TABLE ONLY public.payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'per_resident_rules_pkey') THEN
    ALTER TABLE ONLY public.per_resident_rules ADD CONSTRAINT per_resident_rules_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_notes_pkey') THEN
    ALTER TABLE ONLY public.performance_notes ADD CONSTRAINT performance_notes_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_pkey') THEN
    ALTER TABLE ONLY public.properties ADD CONSTRAINT properties_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_leads_pkey') THEN
    ALTER TABLE ONLY public.property_leads ADD CONSTRAINT property_leads_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_pkey') THEN
    ALTER TABLE ONLY public.purchase_orders ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_po_number_unique') THEN
    ALTER TABLE ONLY public.purchase_orders ADD CONSTRAINT purchase_orders_po_number_unique UNIQUE (po_number);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_endpoint_unique') THEN
    ALTER TABLE ONLY public.push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_pkey') THEN
    ALTER TABLE ONLY public.push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rate_contracts_pkey') THEN
    ALTER TABLE ONLY public.rate_contracts ADD CONSTRAINT rate_contracts_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raw_materials_pkey') THEN
    ALTER TABLE ONLY public.raw_materials ADD CONSTRAINT raw_materials_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipe_feedback_pkey') THEN
    ALTER TABLE ONLY public.recipe_feedback ADD CONSTRAINT recipe_feedback_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipes_pkey') THEN
    ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refresh_tokens_pkey') THEN
    ALTER TABLE ONLY public.refresh_tokens ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refresh_tokens_token_unique') THEN
    ALTER TABLE ONLY public.refresh_tokens ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reminder_logs_pkey') THEN
    ALTER TABLE ONLY public.reminder_logs ADD CONSTRAINT reminder_logs_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reminder_rules_pkey') THEN
    ALTER TABLE ONLY public.reminder_rules ADD CONSTRAINT reminder_rules_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_jobs_pkey') THEN
    ALTER TABLE ONLY public.report_jobs ADD CONSTRAINT report_jobs_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resident_attendance_pkey') THEN
    ALTER TABLE ONLY public.resident_attendance ADD CONSTRAINT resident_attendance_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'residents_pkey') THEN
    ALTER TABLE ONLY public.residents ADD CONSTRAINT residents_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_pkey') THEN
    ALTER TABLE ONLY public.rooms ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sla_config_category_unique') THEN
    ALTER TABLE ONLY public.sla_config ADD CONSTRAINT sla_config_category_unique UNIQUE (category);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sla_config_pkey') THEN
    ALTER TABLE ONLY public.sla_config ADD CONSTRAINT sla_config_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_pkey') THEN
    ALTER TABLE ONLY public.stock_movements ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'system_config_key_unique') THEN
    ALTER TABLE ONLY public.system_config ADD CONSTRAINT system_config_key_unique UNIQUE (key);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'system_config_pkey') THEN
    ALTER TABLE ONLY public.system_config ADD CONSTRAINT system_config_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_scopes_pkey') THEN
    ALTER TABLE ONLY public.user_scopes ADD CONSTRAINT user_scopes_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique') THEN
    ALTER TABLE ONLY public.users ADD CONSTRAINT users_email_unique UNIQUE (email);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_pkey') THEN
    ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_unique') THEN
    ALTER TABLE ONLY public.users ADD CONSTRAINT users_username_unique UNIQUE (username);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_documents_pkey') THEN
    ALTER TABLE ONLY public.vendor_documents ADD CONSTRAINT vendor_documents_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_pkey') THEN
    ALTER TABLE ONLY public.vendors ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_config_pkey') THEN
    ALTER TABLE ONLY public.wallet_config ADD CONSTRAINT wallet_config_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_config_property_id_unique') THEN
    ALTER TABLE ONLY public.wallet_config ADD CONSTRAINT wallet_config_property_id_unique UNIQUE (property_id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transactions_pkey') THEN
    ALTER TABLE ONLY public.wallet_transactions ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_pkey') THEN
    ALTER TABLE ONLY public.wallets ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_resident_id_unique') THEN
    ALTER TABLE ONLY public.wallets ADD CONSTRAINT wallets_resident_id_unique UNIQUE (resident_id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'zones_pkey') THEN
    ALTER TABLE ONLY public.zones ADD CONSTRAINT zones_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_agency_locations_agency ON public.agency_locations USING btree (agency_id);

CREATE INDEX IF NOT EXISTS idx_agency_vehicles_agency ON public.agency_vehicles USING btree (agency_id);

CREATE INDEX IF NOT EXISTS idx_comp_rule_resolve ON public.menu_composition_rules USING btree (brand, meal_type, kitchen_id, is_active);

CREATE INDEX IF NOT EXISTS idx_comp_slot_rule ON public.menu_composition_slots USING btree (rule_id);

CREATE INDEX IF NOT EXISTS idx_dish_ingredients_dish ON public.dish_ingredients USING btree (dish_id);

CREATE INDEX IF NOT EXISTS idx_dish_ingredients_rm ON public.dish_ingredients USING btree (raw_material_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_food_cutoffs_brand_prop ON public.food_cutoffs USING btree (brand, property_id);

CREATE INDEX IF NOT EXISTS idx_kitchen_pincodes_kitchen ON public.kitchen_pincodes USING btree (kitchen_id);

CREATE INDEX IF NOT EXISTS idx_raw_materials_name ON public.raw_materials USING btree (name);

CREATE INDEX IF NOT EXISTS idx_rotation_resolve ON public.food_menu_rotation USING btree (kitchen_id, brand, meal_type, rotation_week, day_of_week, is_active);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agency_locations_agency_id_agencies_id_fk') THEN
    ALTER TABLE ONLY public.agency_locations ADD CONSTRAINT agency_locations_agency_id_agencies_id_fk FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agency_vehicles_agency_id_agencies_id_fk') THEN
    ALTER TABLE ONLY public.agency_vehicles ADD CONSTRAINT agency_vehicles_agency_id_agencies_id_fk FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agency_vehicles_location_id_agency_locations_id_fk') THEN
    ALTER TABLE ONLY public.agency_vehicles ADD CONSTRAINT agency_vehicles_location_id_agency_locations_id_fk FOREIGN KEY (location_id) REFERENCES public.agency_locations(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_employee_id_employees_id_fk') THEN
    ALTER TABLE ONLY public.attendance ADD CONSTRAINT attendance_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_user_id_users_id_fk') THEN
    ALTER TABLE ONLY public.audit_log ADD CONSTRAINT audit_log_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_imports_uploaded_by_users_id_fk') THEN
    ALTER TABLE ONLY public.bank_imports ADD CONSTRAINT bank_imports_uploaded_by_users_id_fk FOREIGN KEY (uploaded_by) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_statement_lines_import_id_bank_imports_id_fk') THEN
    ALTER TABLE ONLY public.bank_statement_lines ADD CONSTRAINT bank_statement_lines_import_id_bank_imports_id_fk FOREIGN KEY (import_id) REFERENCES public.bank_imports(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_statement_lines_matched_ledger_entry_id_ledger_entries_id_') THEN
    ALTER TABLE ONLY public.bank_statement_lines ADD CONSTRAINT bank_statement_lines_matched_ledger_entry_id_ledger_entries_id_ FOREIGN KEY (matched_ledger_entry_id) REFERENCES public.ledger_entries(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_statement_lines_matched_resident_id_residents_id_fk') THEN
    ALTER TABLE ONLY public.bank_statement_lines ADD CONSTRAINT bank_statement_lines_matched_resident_id_residents_id_fk FOREIGN KEY (matched_resident_id) REFERENCES public.residents(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_statement_lines_reconciled_by_users_id_fk') THEN
    ALTER TABLE ONLY public.bank_statement_lines ADD CONSTRAINT bank_statement_lines_reconciled_by_users_id_fk FOREIGN KEY (reconciled_by) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_cycles_created_by_users_id_fk') THEN
    ALTER TABLE ONLY public.billing_cycles ADD CONSTRAINT billing_cycles_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_cycles_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.billing_cycles ADD CONSTRAINT billing_cycles_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_runs_cycle_id_billing_cycles_id_fk') THEN
    ALTER TABLE ONLY public.billing_runs ADD CONSTRAINT billing_runs_cycle_id_billing_cycles_id_fk FOREIGN KEY (cycle_id) REFERENCES public.billing_cycles(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.bookings ADD CONSTRAINT bookings_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_room_id_rooms_id_fk') THEN
    ALTER TABLE ONLY public.bookings ADD CONSTRAINT bookings_room_id_rooms_id_fk FOREIGN KEY (room_id) REFERENCES public.rooms(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cities_zone_id_zones_id_fk') THEN
    ALTER TABLE ONLY public.cities ADD CONSTRAINT cities_zone_id_zones_id_fk FOREIGN KEY (zone_id) REFERENCES public.zones(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clusters_city_id_cities_id_fk') THEN
    ALTER TABLE ONLY public.clusters ADD CONSTRAINT clusters_city_id_cities_id_fk FOREIGN KEY (city_id) REFERENCES public.cities(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clusters_manager_id_users_id_fk') THEN
    ALTER TABLE ONLY public.clusters ADD CONSTRAINT clusters_manager_id_users_id_fk FOREIGN KEY (manager_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'complaint_events_complaint_id_complaints_id_fk') THEN
    ALTER TABLE ONLY public.complaint_events ADD CONSTRAINT complaint_events_complaint_id_complaints_id_fk FOREIGN KEY (complaint_id) REFERENCES public.complaints(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'complaint_routing_assigned_to_users_id_fk') THEN
    ALTER TABLE ONLY public.complaint_routing ADD CONSTRAINT complaint_routing_assigned_to_users_id_fk FOREIGN KEY (assigned_to) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'complaint_routing_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.complaint_routing ADD CONSTRAINT complaint_routing_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'complaints_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.complaints ADD CONSTRAINT complaints_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'course_enrollments_course_id_courses_id_fk') THEN
    ALTER TABLE ONLY public.course_enrollments ADD CONSTRAINT course_enrollments_course_id_courses_id_fk FOREIGN KEY (course_id) REFERENCES public.courses(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dish_ingredients_dish_id_dishes_id_fk') THEN
    ALTER TABLE ONLY public.dish_ingredients ADD CONSTRAINT dish_ingredients_dish_id_dishes_id_fk FOREIGN KEY (dish_id) REFERENCES public.dishes(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dish_ingredients_raw_material_id_raw_materials_id_fk') THEN
    ALTER TABLE ONLY public.dish_ingredients ADD CONSTRAINT dish_ingredients_raw_material_id_raw_materials_id_fk FOREIGN KEY (raw_material_id) REFERENCES public.raw_materials(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'electricity_meters_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.electricity_meters ADD CONSTRAINT electricity_meters_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'electricity_meters_resident_id_residents_id_fk') THEN
    ALTER TABLE ONLY public.electricity_meters ADD CONSTRAINT electricity_meters_resident_id_residents_id_fk FOREIGN KEY (resident_id) REFERENCES public.residents(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'electricity_meters_room_id_rooms_id_fk') THEN
    ALTER TABLE ONLY public.electricity_meters ADD CONSTRAINT electricity_meters_room_id_rooms_id_fk FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'electricity_meters_tariff_id_electricity_tariffs_id_fk') THEN
    ALTER TABLE ONLY public.electricity_meters ADD CONSTRAINT electricity_meters_tariff_id_electricity_tariffs_id_fk FOREIGN KEY (tariff_id) REFERENCES public.electricity_tariffs(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'electricity_readings_meter_id_electricity_meters_id_fk') THEN
    ALTER TABLE ONLY public.electricity_readings ADD CONSTRAINT electricity_readings_meter_id_electricity_meters_id_fk FOREIGN KEY (meter_id) REFERENCES public.electricity_meters(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'electricity_tariffs_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.electricity_tariffs ADD CONSTRAINT electricity_tariffs_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'escalations_complaint_id_complaints_id_fk') THEN
    ALTER TABLE ONLY public.escalations ADD CONSTRAINT escalations_complaint_id_complaints_id_fk FOREIGN KEY (complaint_id) REFERENCES public.complaints(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'esign_events_esign_request_id_esign_requests_id_fk') THEN
    ALTER TABLE ONLY public.esign_events ADD CONSTRAINT esign_events_esign_request_id_esign_requests_id_fk FOREIGN KEY (esign_request_id) REFERENCES public.esign_requests(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'esign_requests_created_by_users_id_fk') THEN
    ALTER TABLE ONLY public.esign_requests ADD CONSTRAINT esign_requests_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'esign_requests_resident_id_residents_id_fk') THEN
    ALTER TABLE ONLY public.esign_requests ADD CONSTRAINT esign_requests_resident_id_residents_id_fk FOREIGN KEY (resident_id) REFERENCES public.residents(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exit_assets_exit_id_exits_id_fk') THEN
    ALTER TABLE ONLY public.exit_assets ADD CONSTRAINT exit_assets_exit_id_exits_id_fk FOREIGN KEY (exit_id) REFERENCES public.exits(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exit_clearances_exit_id_exits_id_fk') THEN
    ALTER TABLE ONLY public.exit_clearances ADD CONSTRAINT exit_clearances_exit_id_exits_id_fk FOREIGN KEY (exit_id) REFERENCES public.exits(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exits_employee_id_employees_id_fk') THEN
    ALTER TABLE ONLY public.exits ADD CONSTRAINT exits_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_events_actor_id_users_id_fk') THEN
    ALTER TABLE ONLY public.expense_events ADD CONSTRAINT expense_events_actor_id_users_id_fk FOREIGN KEY (actor_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_events_expense_id_expenses_id_fk') THEN
    ALTER TABLE ONLY public.expense_events ADD CONSTRAINT expense_events_expense_id_expenses_id_fk FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_category_id_expense_categories_id_fk') THEN
    ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_category_id_expense_categories_id_fk FOREIGN KEY (category_id) REFERENCES public.expense_categories(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_reviewed_by_users_id_fk') THEN
    ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_submitted_by_users_id_fk') THEN
    ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_submitted_by_users_id_fk FOREIGN KEY (submitted_by) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facility_assets_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.facility_assets ADD CONSTRAINT facility_assets_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facility_logs_asset_id_facility_assets_id_fk') THEN
    ALTER TABLE ONLY public.facility_logs ADD CONSTRAINT facility_logs_asset_id_facility_assets_id_fk FOREIGN KEY (asset_id) REFERENCES public.facility_assets(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facility_logs_schedule_id_facility_schedules_id_fk') THEN
    ALTER TABLE ONLY public.facility_logs ADD CONSTRAINT facility_logs_schedule_id_facility_schedules_id_fk FOREIGN KEY (schedule_id) REFERENCES public.facility_schedules(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facility_schedules_asset_id_facility_assets_id_fk') THEN
    ALTER TABLE ONLY public.facility_schedules ADD CONSTRAINT facility_schedules_asset_id_facility_assets_id_fk FOREIGN KEY (asset_id) REFERENCES public.facility_assets(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_cutoffs_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.food_cutoffs ADD CONSTRAINT food_cutoffs_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_dispatches_delivery_partner_id_agencies_id_fk') THEN
    ALTER TABLE ONLY public.food_dispatches ADD CONSTRAINT food_dispatches_delivery_partner_id_agencies_id_fk FOREIGN KEY (delivery_partner_id) REFERENCES public.agencies(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_dispatches_dispatched_by_id_users_id_fk') THEN
    ALTER TABLE ONLY public.food_dispatches ADD CONSTRAINT food_dispatches_dispatched_by_id_users_id_fk FOREIGN KEY (dispatched_by_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_dispatches_kitchen_id_kitchens_id_fk') THEN
    ALTER TABLE ONLY public.food_dispatches ADD CONSTRAINT food_dispatches_kitchen_id_kitchens_id_fk FOREIGN KEY (kitchen_id) REFERENCES public.kitchens(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_dispatches_vehicle_id_agency_vehicles_id_fk') THEN
    ALTER TABLE ONLY public.food_dispatches ADD CONSTRAINT food_dispatches_vehicle_id_agency_vehicles_id_fk FOREIGN KEY (vehicle_id) REFERENCES public.agency_vehicles(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_meal_windows_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.food_meal_windows ADD CONSTRAINT food_meal_windows_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_menu_rotation_dish_id_dishes_id_fk') THEN
    ALTER TABLE ONLY public.food_menu_rotation ADD CONSTRAINT food_menu_rotation_dish_id_dishes_id_fk FOREIGN KEY (dish_id) REFERENCES public.dishes(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_menu_rotation_kitchen_id_kitchens_id_fk') THEN
    ALTER TABLE ONLY public.food_menu_rotation ADD CONSTRAINT food_menu_rotation_kitchen_id_kitchens_id_fk FOREIGN KEY (kitchen_id) REFERENCES public.kitchens(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_menu_shares_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.food_menu_shares ADD CONSTRAINT food_menu_shares_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_menu_shares_shared_by_id_users_id_fk') THEN
    ALTER TABLE ONLY public.food_menu_shares ADD CONSTRAINT food_menu_shares_shared_by_id_users_id_fk FOREIGN KEY (shared_by_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_order_batches_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.food_order_batches ADD CONSTRAINT food_order_batches_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_order_batches_unit_lead_id_users_id_fk') THEN
    ALTER TABLE ONLY public.food_order_batches ADD CONSTRAINT food_order_batches_unit_lead_id_users_id_fk FOREIGN KEY (unit_lead_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_order_events_actor_id_users_id_fk') THEN
    ALTER TABLE ONLY public.food_order_events ADD CONSTRAINT food_order_events_actor_id_users_id_fk FOREIGN KEY (actor_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_order_events_order_id_food_orders_id_fk') THEN
    ALTER TABLE ONLY public.food_order_events ADD CONSTRAINT food_order_events_order_id_food_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.food_orders(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_order_items_dish_id_dishes_id_fk') THEN
    ALTER TABLE ONLY public.food_order_items ADD CONSTRAINT food_order_items_dish_id_dishes_id_fk FOREIGN KEY (dish_id) REFERENCES public.dishes(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_order_items_order_id_food_orders_id_fk') THEN
    ALTER TABLE ONLY public.food_order_items ADD CONSTRAINT food_order_items_order_id_food_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.food_orders(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_orders_accepted_by_id_users_id_fk') THEN
    ALTER TABLE ONLY public.food_orders ADD CONSTRAINT food_orders_accepted_by_id_users_id_fk FOREIGN KEY (accepted_by_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_orders_batch_id_food_order_batches_id_fk') THEN
    ALTER TABLE ONLY public.food_orders ADD CONSTRAINT food_orders_batch_id_food_order_batches_id_fk FOREIGN KEY (batch_id) REFERENCES public.food_order_batches(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_orders_confirmed_by_id_users_id_fk') THEN
    ALTER TABLE ONLY public.food_orders ADD CONSTRAINT food_orders_confirmed_by_id_users_id_fk FOREIGN KEY (confirmed_by_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_orders_created_by_id_users_id_fk') THEN
    ALTER TABLE ONLY public.food_orders ADD CONSTRAINT food_orders_created_by_id_users_id_fk FOREIGN KEY (created_by_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_orders_delivery_partner_id_agencies_id_fk') THEN
    ALTER TABLE ONLY public.food_orders ADD CONSTRAINT food_orders_delivery_partner_id_agencies_id_fk FOREIGN KEY (delivery_partner_id) REFERENCES public.agencies(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_orders_dispatch_id_food_dispatches_id_fk') THEN
    ALTER TABLE ONLY public.food_orders ADD CONSTRAINT food_orders_dispatch_id_food_dispatches_id_fk FOREIGN KEY (dispatch_id) REFERENCES public.food_dispatches(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_orders_dispatched_by_id_users_id_fk') THEN
    ALTER TABLE ONLY public.food_orders ADD CONSTRAINT food_orders_dispatched_by_id_users_id_fk FOREIGN KEY (dispatched_by_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_orders_kitchen_id_kitchens_id_fk') THEN
    ALTER TABLE ONLY public.food_orders ADD CONSTRAINT food_orders_kitchen_id_kitchens_id_fk FOREIGN KEY (kitchen_id) REFERENCES public.kitchens(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_orders_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.food_orders ADD CONSTRAINT food_orders_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_orders_unit_lead_id_users_id_fk') THEN
    ALTER TABLE ONLY public.food_orders ADD CONSTRAINT food_orders_unit_lead_id_users_id_fk FOREIGN KEY (unit_lead_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_orders_vehicle_id_agency_vehicles_id_fk') THEN
    ALTER TABLE ONLY public.food_orders ADD CONSTRAINT food_orders_vehicle_id_agency_vehicles_id_fk FOREIGN KEY (vehicle_id) REFERENCES public.agency_vehicles(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'iot_devices_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.iot_devices ADD CONSTRAINT iot_devices_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'iot_devices_registered_by_users_id_fk') THEN
    ALTER TABLE ONLY public.iot_devices ADD CONSTRAINT iot_devices_registered_by_users_id_fk FOREIGN KEY (registered_by) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'iot_devices_room_id_rooms_id_fk') THEN
    ALTER TABLE ONLY public.iot_devices ADD CONSTRAINT iot_devices_room_id_rooms_id_fk FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'iot_readings_device_id_iot_devices_id_fk') THEN
    ALTER TABLE ONLY public.iot_readings ADD CONSTRAINT iot_readings_device_id_iot_devices_id_fk FOREIGN KEY (device_id) REFERENCES public.iot_devices(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_pincodes_kitchen_id_kitchens_id_fk') THEN
    ALTER TABLE ONLY public.kitchen_pincodes ADD CONSTRAINT kitchen_pincodes_kitchen_id_kitchens_id_fk FOREIGN KEY (kitchen_id) REFERENCES public.kitchens(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchens_city_id_cities_id_fk') THEN
    ALTER TABLE ONLY public.kitchens ADD CONSTRAINT kitchens_city_id_cities_id_fk FOREIGN KEY (city_id) REFERENCES public.cities(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchens_cluster_id_clusters_id_fk') THEN
    ALTER TABLE ONLY public.kitchens ADD CONSTRAINT kitchens_cluster_id_clusters_id_fk FOREIGN KEY (cluster_id) REFERENCES public.clusters(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kyc_events_actor_id_users_id_fk') THEN
    ALTER TABLE ONLY public.kyc_events ADD CONSTRAINT kyc_events_actor_id_users_id_fk FOREIGN KEY (actor_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kyc_events_kyc_request_id_kyc_requests_id_fk') THEN
    ALTER TABLE ONLY public.kyc_events ADD CONSTRAINT kyc_events_kyc_request_id_kyc_requests_id_fk FOREIGN KEY (kyc_request_id) REFERENCES public.kyc_requests(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kyc_requests_created_by_users_id_fk') THEN
    ALTER TABLE ONLY public.kyc_requests ADD CONSTRAINT kyc_requests_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kyc_requests_resident_id_residents_id_fk') THEN
    ALTER TABLE ONLY public.kyc_requests ADD CONSTRAINT kyc_requests_resident_id_residents_id_fk FOREIGN KEY (resident_id) REFERENCES public.residents(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kyc_requests_reviewed_by_users_id_fk') THEN
    ALTER TABLE ONLY public.kyc_requests ADD CONSTRAINT kyc_requests_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'laundry_batches_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.laundry_batches ADD CONSTRAINT laundry_batches_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'laundry_batches_resident_id_residents_id_fk') THEN
    ALTER TABLE ONLY public.laundry_batches ADD CONSTRAINT laundry_batches_resident_id_residents_id_fk FOREIGN KEY (resident_id) REFERENCES public.residents(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_activities_lead_id_leads_id_fk') THEN
    ALTER TABLE ONLY public.lead_activities ADD CONSTRAINT lead_activities_lead_id_leads_id_fk FOREIGN KEY (lead_id) REFERENCES public.leads(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_balances_employee_id_employees_id_fk') THEN
    ALTER TABLE ONLY public.leave_balances ADD CONSTRAINT leave_balances_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leaves_employee_id_employees_id_fk') THEN
    ALTER TABLE ONLY public.leaves ADD CONSTRAINT leaves_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_entries_resident_id_residents_id_fk') THEN
    ALTER TABLE ONLY public.ledger_entries ADD CONSTRAINT ledger_entries_resident_id_residents_id_fk FOREIGN KEY (resident_id) REFERENCES public.residents(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_composition_rules_kitchen_id_kitchens_id_fk') THEN
    ALTER TABLE ONLY public.menu_composition_rules ADD CONSTRAINT menu_composition_rules_kitchen_id_kitchens_id_fk FOREIGN KEY (kitchen_id) REFERENCES public.kitchens(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_composition_slots_rule_id_menu_composition_rules_id_fk') THEN
    ALTER TABLE ONLY public.menu_composition_slots ADD CONSTRAINT menu_composition_slots_rule_id_menu_composition_rules_id_fk FOREIGN KEY (rule_id) REFERENCES public.menu_composition_rules(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_outbox_user_id_users_id_fk') THEN
    ALTER TABLE ONLY public.notification_outbox ADD CONSTRAINT notification_outbox_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_preferences_user_id_users_id_fk') THEN
    ALTER TABLE ONLY public.notification_preferences ADD CONSTRAINT notification_preferences_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_users_id_fk') THEN
    ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'otp_challenges_user_id_users_id_fk') THEN
    ALTER TABLE ONLY public.otp_challenges ADD CONSTRAINT otp_challenges_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'out_passes_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.out_passes ADD CONSTRAINT out_passes_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'out_passes_resident_id_residents_id_fk') THEN
    ALTER TABLE ONLY public.out_passes ADD CONSTRAINT out_passes_resident_id_residents_id_fk FOREIGN KEY (resident_id) REFERENCES public.residents(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_resident_id_residents_id_fk') THEN
    ALTER TABLE ONLY public.payments ADD CONSTRAINT payments_resident_id_residents_id_fk FOREIGN KEY (resident_id) REFERENCES public.residents(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'per_resident_rules_dish_id_dishes_id_fk') THEN
    ALTER TABLE ONLY public.per_resident_rules ADD CONSTRAINT per_resident_rules_dish_id_dishes_id_fk FOREIGN KEY (dish_id) REFERENCES public.dishes(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'per_resident_rules_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.per_resident_rules ADD CONSTRAINT per_resident_rules_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_notes_employee_id_employees_id_fk') THEN
    ALTER TABLE ONLY public.performance_notes ADD CONSTRAINT performance_notes_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_vendor_id_vendors_id_fk') THEN
    ALTER TABLE ONLY public.purchase_orders ADD CONSTRAINT purchase_orders_vendor_id_vendors_id_fk FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_user_id_users_id_fk') THEN
    ALTER TABLE ONLY public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rate_contracts_vendor_id_vendors_id_fk') THEN
    ALTER TABLE ONLY public.rate_contracts ADD CONSTRAINT rate_contracts_vendor_id_vendors_id_fk FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipe_feedback_recipe_id_recipes_id_fk') THEN
    ALTER TABLE ONLY public.recipe_feedback ADD CONSTRAINT recipe_feedback_recipe_id_recipes_id_fk FOREIGN KEY (recipe_id) REFERENCES public.recipes(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refresh_tokens_user_id_users_id_fk') THEN
    ALTER TABLE ONLY public.refresh_tokens ADD CONSTRAINT refresh_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reminder_logs_ledger_entry_id_ledger_entries_id_fk') THEN
    ALTER TABLE ONLY public.reminder_logs ADD CONSTRAINT reminder_logs_ledger_entry_id_ledger_entries_id_fk FOREIGN KEY (ledger_entry_id) REFERENCES public.ledger_entries(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reminder_logs_resident_id_residents_id_fk') THEN
    ALTER TABLE ONLY public.reminder_logs ADD CONSTRAINT reminder_logs_resident_id_residents_id_fk FOREIGN KEY (resident_id) REFERENCES public.residents(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reminder_logs_rule_id_reminder_rules_id_fk') THEN
    ALTER TABLE ONLY public.reminder_logs ADD CONSTRAINT reminder_logs_rule_id_reminder_rules_id_fk FOREIGN KEY (rule_id) REFERENCES public.reminder_rules(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reminder_rules_created_by_users_id_fk') THEN
    ALTER TABLE ONLY public.reminder_rules ADD CONSTRAINT reminder_rules_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_jobs_requested_by_id_users_id_fk') THEN
    ALTER TABLE ONLY public.report_jobs ADD CONSTRAINT report_jobs_requested_by_id_users_id_fk FOREIGN KEY (requested_by_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resident_attendance_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.resident_attendance ADD CONSTRAINT resident_attendance_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resident_attendance_resident_id_residents_id_fk') THEN
    ALTER TABLE ONLY public.resident_attendance ADD CONSTRAINT resident_attendance_resident_id_residents_id_fk FOREIGN KEY (resident_id) REFERENCES public.residents(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'residents_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.residents ADD CONSTRAINT residents_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.rooms ADD CONSTRAINT rooms_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_inventory_id_inventory_id_fk') THEN
    ALTER TABLE ONLY public.stock_movements ADD CONSTRAINT stock_movements_inventory_id_inventory_id_fk FOREIGN KEY (inventory_id) REFERENCES public.inventory(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_scopes_city_id_cities_id_fk') THEN
    ALTER TABLE ONLY public.user_scopes ADD CONSTRAINT user_scopes_city_id_cities_id_fk FOREIGN KEY (city_id) REFERENCES public.cities(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_scopes_cluster_id_clusters_id_fk') THEN
    ALTER TABLE ONLY public.user_scopes ADD CONSTRAINT user_scopes_cluster_id_clusters_id_fk FOREIGN KEY (cluster_id) REFERENCES public.clusters(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_scopes_kitchen_id_kitchens_id_fk') THEN
    ALTER TABLE ONLY public.user_scopes ADD CONSTRAINT user_scopes_kitchen_id_kitchens_id_fk FOREIGN KEY (kitchen_id) REFERENCES public.kitchens(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_scopes_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.user_scopes ADD CONSTRAINT user_scopes_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_scopes_user_id_users_id_fk') THEN
    ALTER TABLE ONLY public.user_scopes ADD CONSTRAINT user_scopes_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_scopes_zone_id_zones_id_fk') THEN
    ALTER TABLE ONLY public.user_scopes ADD CONSTRAINT user_scopes_zone_id_zones_id_fk FOREIGN KEY (zone_id) REFERENCES public.zones(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_documents_vendor_id_vendors_id_fk') THEN
    ALTER TABLE ONLY public.vendor_documents ADD CONSTRAINT vendor_documents_vendor_id_vendors_id_fk FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_config_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.wallet_config ADD CONSTRAINT wallet_config_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transactions_property_id_properties_id_fk') THEN
    ALTER TABLE ONLY public.wallet_transactions ADD CONSTRAINT wallet_transactions_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transactions_resident_id_residents_id_fk') THEN
    ALTER TABLE ONLY public.wallet_transactions ADD CONSTRAINT wallet_transactions_resident_id_residents_id_fk FOREIGN KEY (resident_id) REFERENCES public.residents(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transactions_wallet_id_wallets_id_fk') THEN
    ALTER TABLE ONLY public.wallet_transactions ADD CONSTRAINT wallet_transactions_wallet_id_wallets_id_fk FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_resident_id_residents_id_fk') THEN
    ALTER TABLE ONLY public.wallets ADD CONSTRAINT wallets_resident_id_residents_id_fk FOREIGN KEY (resident_id) REFERENCES public.residents(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;


--
-- Food system defaults (WS1/WS2). Seed only when absent so a fresh production
-- database boots with a global order cut-off and a waste-edit window. `key` is
-- UNIQUE; ON CONFLICT keeps any operator-tuned values intact on re-run.
--
INSERT INTO public.system_config (id, key, value, description, updated_at) VALUES
  ('85dd44ec-01bf-40dc-802e-1ce5d22b7af7', 'food_default_cutoff', '"09:00"'::json,
   'Global default order cut-off time (HH:MM 24h) applied when no brand/property cut-off row exists.', now()),
  ('a7fd378f-2ec7-42e0-9461-88ff223f76ff', 'food_waste_edit_window_minutes', '60'::json,
   'Minutes after delivery during which waste quantities remain editable (PRD 7.7).', now())
ON CONFLICT (key) DO NOTHING;
