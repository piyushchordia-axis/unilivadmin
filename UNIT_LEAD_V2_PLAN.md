# Unit-Lead v2 — Locked Spec & Build Plan

> Source of truth for the multi-area Unit-Lead / Food-module overhaul requested 2026-06-23.
> All decisions below are **locked** (confirmed via Q&A). Delivery = **one branch** — work on the
> **CURRENT branch (`main`), no new branch**. Orchestrate the build with multi-agent Workflows.
> DB iterates via `drizzle-kit push` (dev) **and** a consolidated prod migration is authored before deploy.

## Final decisions (resolved)
1. **Meals stay 4** (NO enum change). Keep `mealTypeEnum` = BREAKFAST, LUNCH, SNACKS, DINNER; just **relabel
   `SNACKS` → "High Tea / Evening Snacks"** in the UI label map. Place Order creates **up to 4** meal-orders per batch
   (only meals that have a menu that day).
2. **Download menu stays for Unit Lead** (+ FnB roles), shown **only on the success page**.

## Resolved blocking decisions (post-blueprint)
- **Cut-off anchoring** (WS3, `food-ops.ts` checkOrderCutoff): deadline = `atTime(serviceDate − 1 day, cutoffTime)`. Service date is tomorrow → tomorrow's order must be placed before **today's** cut-off. Everyone else treats this as done.
- **resolveCutoff fallback** (WS3): when no property/brand cut-off row exists, fall back to `getDefaultCutoffTime()` (system_config `food_default_cutoff`, default "09:00").
- **system_config canonical keys** (raw JSON scalars): `food_default_cutoff` = `"09:00"`, `food_waste_edit_window_minutes` = `60`. Reader helpers live in `food-service.ts` (`getWasteEditWindowMs`, `getDefaultCutoffTime`) — DONE in WS1. Seeded by WS2.
- **kitchen_pincodes** (DONE, WS1): pincode globally UNIQUE (one kitchen per pincode); kitchen serves many.
- **Migrations**: WS1 = `0006_kitchen_pincodes.sql` (done); WS12 = `0007_*` consolidated idempotent prod reconciliation (superset).
- **SNACKS label**: hardcoded `MEAL_LABEL[SNACKS]="High Tea / Evening Snacks"` (DONE) + WS2 seeds `food_meal_config.displayLabel` to match. No dynamic fetch.
- **SUPER_ADMIN global food defaults** (WS3): `GET /food/system-config/food-defaults` (auth) + `PUT` (SUPER_ADMIN only) for cut-off + waste window; plus a minimal SUPER_ADMIN-gated UI section in `food-settings.tsx`.
- **FnB cancel** (WS3): cancel endpoint authorizes `FOOD_PLACE_ORDER:edit` **OR** `FOOD_KITCHEN_SUMMARY:edit` (do NOT grant FnB place-order). Cancel allowed while status ∈ {PLACED, ACCEPTED, PREPARING}.
- **Home route** (WS7): new top-level `/home` (outside `/food`); `homeForRole(UNIT_LEAD)` → `/home`.
- **Backfill** (WS2): seed `kitchen_pincodes` covering ALL existing property pincodes (each property's pincode → its city's kitchen); backfill brand+kitchen on every property so none are NULL. New creates via the form are strict.

---

## Workstream 1 — Schema & config foundation
- **Meals stay 4** — NO enum surgery. Only relabel `SNACKS` → "High Tea / Evening Snacks" in the UI `MEAL_LABEL` map.
- New master table **`kitchen_pincodes`** (kitchen ↔ many pincodes; one pincode → one kitchen). Admin-managed.
- `system_config` defaults, **configured by SUPER_ADMIN**:
  - global default cut-off `09:00` — applied to **order-blocking** when no brand/property cut-off exists (not just UI).
  - waste-edit window minutes (default 60) — replaces hardcoded `3600000ms`.
- `properties.brand` + `properties.kitchenId` already exist (text cols).

## Workstream 2 — Seeds (update existing seed data, no grandfathering)
- Seed brands (UNILIV, HUDDLE) — already present.
- Seed `kitchen_pincodes` mappings.
- **Backfill ALL existing properties** with brand + kitchen (derive kitchen from pincode mapping).
- Seed meal config/windows/rotation for HIGH_TEA.
- Seed system_config defaults (cut-off 09:00, waste window 60).

## Workstream 3 — RBAC
- Remove `FOOD_DISPATCH` from `UNIT_LEAD` **entirely (no view)** in both matrices
  (`api-server/src/lib/permissions.ts` + `uniliv-admin/src/lib/permissions.ts`). FnB Supervisor owns dispatch.
- Cancel-order allowed for **UNIT_LEAD + FnB roles**, only before DISPATCHED.
- SUPER_ADMIN gets write access to the new global food defaults (cut-off, waste window).

## Workstream 4 — Property form (create / edit / view) — `property-form-modal.tsx`
- Add **Brand** dropdown (from admin-managed `foodBrandsTable`, dynamic). Required.
- Add **Kitchen** — auto-derived from pincode via `kitchen_pincodes` (read-only). Required.
  - On edit, changing pincode **re-derives** kitchen (read-only); brand freely editable.
  - If pincode matches **no kitchen** → **block creation** with a clear error.
- Surface brand + kitchen in the **view** screen too.

## Workstream 5 — Navigation
- Create a **PROPERTIES** sidebar group. Move **My Properties** out of *Food Ordering* into **PROPERTIES** (visible to unit lead).
- Keep `/food/my-properties` route; re-gate as needed.

## Workstream 6 — Food Dashboard rework — `food-dashboard.tsx`
- Cards:
  - "Ordered" → **variance card**: # orders with **any nonzero** ordered-vs-received qty diff;
    period **toggle** 1mo / 3mo / 6mo / this-FY (single number, switches).
  - **Active** card (PLACED only, not PREPARING) **replaces** the old "Ordered" slot.
  - **Remove** "Dispatched" and "Delivered" cards.
  - **Awaiting Confirmation** becomes a **display-only stat card** in the old Dispatched slot
    (confirm action stays on order detail page).
  - **Remove** the "Awaiting Dispatch" action card (dispatch left the unit lead).
  - **Waste Pending** → **table UI** with **live-ticking** "NN mins left" per order (window from config).
- **Move property Overview card** to the new Home dashboard; **keep "Today's cut-offs"** card here.
  - Cut-off display: show the global default (9:00 AM) instead of "Not set".
- **Order Status Breakdown** chart: only show statuses **still represented by the remaining cards**.
- Add **"time left to place tomorrow's order"** countdown (also on Place Order page).

## Workstream 7 — NEW Unit-Lead Home dashboard (post-login landing)
- Becomes the **landing page** after OTP login for unit leads.
- Contains the **property overview** (moved from food dashboard) + high-level charts:
  - People ordered for — comparison **across time periods AND across properties**.
  - Total wastage trend (day/week/month/qtr/FY).
  - Top 20% highest-wastage items (monthly/qtr/FY).
  - Active resident trends (monthly/qtr/FY).
  - Food-order delays count (weekly/monthly/qtr/FY).
  - Occupancy, Collections (real), **Renewals + New signups = stubbed/placeholder** for v1.
- Filters: Week / Month / **FY-quarter** / **FY-year (Apr–Mar)**.
- Scope: **aggregate all** the unit lead's properties + optional **single-property filter**.
- **Move analytics out of `/food/reports`** into Home; slim down the reports page.

## Workstream 8 — My Properties cards — `food-my-properties.tsx`
- Add **Vacant beds** (= totalBeds − occupied).
- Rename **"Revenue (mo)" → "Revenue (month)"**.
- Make stats clickable → their UIs:
  - Active guests → `/food/guests?propertyId`
  - Active orders → `/food/orders?propertyId`
  - Occupancy + Vacant beds → a **beds page** (build if missing)
  - Revenue (month) → a **payments page** (build if missing)

## Workstream 9 — Place Order rework — `food-place-order.tsx`
- **Service date = tomorrow only**, shown **read-only** (remove picker).
- **Cut-off check**: enforce **day-before-service-date** deadline (fix server `checkOrderCutoff` anchoring).
  Block placing after cut-off (client + server).
- **Disable** per-item edit pencil + checkboxes → "coming soon"; **all dishes always included**.
- Create one order **per meal that has a menu** that day (up to 4).
- **Success page**: toast + **batch reference + all per-meal order IDs**, each linking to tracking.
  - **Download** (menu, kept for unit lead + FnB) and **Share** appear **only on the success page**.
  - **Share = menu link only** (drop the "to guests" recipient targeting).
- Build a **standalone tracking page** with an **order-ID input box** (Persona story 21); track link opens it pre-filled.

## Workstream 10 — Order detail (bottom sheet) — `food-order-detail.tsx`
- Convert lifecycle timeline to **horizontal**, move to **top**.
- Add **Cancel Order** — visible/functional only **before DISPATCHED** (PLACED/ACCEPTED/PREPARING); UNIT_LEAD + FnB.
- **Remove the "Prepared" column** from the per-item ordered-vs-delivered table.

## Workstream 11 — Exports (all places)
- Standardize on **CSV + PDF** everywhere (**drop `.xls`/SpreadsheetML**). Apply to **every DataTable** in the app.
- **Bug fix**: exports currently emit **propertyId** instead of **propertyName** in the data — fix at all places.
- **Format date fields** correctly wherever they appear in exports.
- Put **property name + date** in filename **and** in-document header.

## Workstream 12 — Migration
- Author a **consolidated prod migration** covering org overhaul + all phases + these changes.

## Final
- Reminder: **check Place Orders end-to-end** after everything is done.
