# UNILIV ADMIN

A complete multi-property co-living management platform built as a full-stack monorepo web application.

## Overview

UNILIV Admin is an operations command center for managing student/young-professional co-living properties. It covers all 12+ operational modules: Properties, Rooms, Residents, Complaints, HRMS, Procurement, Kitchen, Sales/CRM, L&D, Property Acquisition, Users, and Announcements.

## Architecture

### Stack
- **Frontend**: React + Vite + TypeScript, Tailwind CSS + shadcn/ui, Zustand (auth), TanStack Query, Recharts, wouter (routing), Lucide icons
- **Backend**: Express 5, Drizzle ORM, PostgreSQL, JWT auth (jsonwebtoken + bcryptjs)
- **API Client**: Orval-generated React Query hooks from OpenAPI spec

### Monorepo Structure
```
artifacts/
  api-server/          # Express backend (port 8080, path: /api)
  uniliv-admin/        # React+Vite frontend (port 21571, path: /)
lib/
  db/                  # Drizzle ORM schema + DB connection
  api-spec/            # OpenAPI spec (openapi.yaml)
  api-zod/             # Generated Zod schemas
  api-client-react/    # Generated React Query hooks + custom-fetch
scripts/
  src/seed.ts          # Database seeder
```

### Database Schema (PostgreSQL via Drizzle)
- **core.ts**: properties, rooms, users, residents, ledger_entries, payments, complaints, escalations, announcements, refresh_tokens
- **hrms.ts**: employees, attendance, leaves, job_requisitions, candidates
- **procurement.ts**: vendors, indents, purchase_orders, grns, inventory
- **kitchen.ts**: recipes, menu_plans
- **sales.ts**: leads, property_leads
- **lnd.ts**: courses, course_enrollments

## Authentication

- JWT-based: access token (15min) + refresh token (7d, httpOnly cookie)
- Access token stored in localStorage as `uniliv_token`
- Auth token getter wired in `main.tsx` via `setAuthTokenGetter`
- Admin credentials: `admin@uniliv.com` / `Admin@123`
- All API routes protected by `authenticate` middleware

## API Routes

All routes under `/api/`:
- `POST /api/auth/login` — login, returns accessToken
- `POST /api/auth/logout` — logout
- `POST /api/auth/refresh` — refresh token
- `GET /api/auth/me` — current user
- `GET/POST /api/dashboard/stats` — dashboard KPIs
- `GET /api/dashboard/charts` — chart data
- `GET/POST/PUT/DELETE /api/properties`
- `GET/POST/PUT/DELETE /api/rooms`
- `GET/POST/PUT/DELETE /api/residents`
- `GET/POST /api/residents/:id/ledger`
- `GET/POST /api/residents/:id/payments`
- `GET/POST/PUT /api/complaints`
- `POST /api/escalations`
- `GET/POST/PUT/DELETE /api/employees`
- `GET/POST/PUT /api/attendance`
- `GET/POST/PUT /api/leaves`
- `GET/POST /api/job-requisitions`
- `GET/POST/PUT /api/candidates`
- `GET/POST/PUT /api/vendors`
- `GET/POST/PUT /api/indents`
- `GET/POST/PUT /api/purchase-orders`
- `GET/POST /api/grn`
- `GET/POST/PUT /api/inventory`
- `GET/POST/PUT/DELETE /api/recipes`
- `GET/POST/PUT /api/menu-plans`
- `GET/POST/PUT/DELETE /api/leads`
- `GET/POST/PUT /api/property-leads`
- `GET/POST/PUT /api/courses`
- `GET/POST/PUT /api/enrollments`
- `GET/POST/PUT/DELETE /api/users`
- `GET/POST/DELETE /api/announcements`

## Frontend Pages

- `/login` — Login page with JWT auth
- `/` — Dashboard with stats cards and Recharts charts
- `/properties` — Property list with occupancy badges
- `/properties/:id` — Property detail with rooms grid
- `/rooms` — Room inventory with status filters
- `/residents` — Resident directory with search and status badges
- `/residents/:id` — Resident detail with ledger & payments tabs
- `/complaints` — Complaint tracker with priority indicators
- `/employees` — HRMS employee directory
- `/employees/:id` — Employee detail page
- `/attendance` — Attendance marking table
- `/leaves` — Leave requests with approve/reject
- `/recruitment` — Job requisitions + candidate pipeline
- `/vendors` — Vendor directory with ratings
- `/indents` — Indent requests workflow
- `/purchase-orders` — PO list
- `/inventory` — Inventory with low-stock warnings
- `/kitchen` — Recipes and menu plans
- `/leads` — CRM lead pipeline
- `/courses` — L&D course library
- `/property-leads` — Property acquisition pipeline
- `/users` — User management
- `/settings` — Settings placeholder

## Development

```bash
# Install dependencies
pnpm install

# Push DB schema
cd lib/db && pnpm run push

# Seed database
pnpm --filter @workspace/scripts run seed

# Start API server (auto-managed by Replit workflow)
# Start frontend (auto-managed by Replit workflow)

# Regenerate API client after OpenAPI spec changes
pnpm --filter @workspace/api-spec run codegen
```

## Design System (May 2026 overhaul)

- **Colors** (CSS vars in `src/index.css`): primary `#0F172A` (dark navy), accent `#F97316` (orange), success `#16A34A`, warning `#D97706`, danger `#DC2626`, surface `#F8FAFC`, card `#FFFFFF`, border `#E2E8F0`, muted `#64748B`
- **Fonts** (Google, loaded in `index.html`): Sora (display), DM Sans (body, default `--font-sans`), JetBrains Mono (codes/IDs). Use `.font-display` utility for headings.
- **Layout**: 240px dark navy sidebar with 8 grouped nav sections (OVERVIEW, OPERATIONS, PEOPLE, SUPPLY CHAIN, FOOD, GROWTH, FINANCE, SETTINGS), property selector, user footer; topbar with page title, global search, notification bell, user dropdown.
- **Reusable components** in `src/components/`: `PageHeader`, `DataTable` (TanStack Table wrapper), `StatCard`, `StatusBadge`, plus `ui/form-modal.tsx` (slide-over right), `ui/empty-state.tsx`, `ui/file-upload.tsx`, `ui/confirm-dialog.tsx`, `ui/avatar.tsx`.
- **New routes**: `/laundry` (placeholder — no backend), `/communications` (announcements), `/grn`, `/menu-planning`, `/ledger`, `/payments`, `/recipes` (replaces `/kitchen`).

## Properties + Residents Modules

- **Properties** (`/properties`): list with stat cards, city/status filters, occupancy bars; `PropertyFormModal` with amenities chips, Nominatim geocoding (`https://nominatim.openstreetmap.org/search`), OpenStreetMap iframe embed (no API key needed). Detail page has 5 tabs (Overview / Rooms / Residents / Complaints / Documents); Rooms tab supports inline CRUD.
- **Residents** (`/residents`): list with stat cards, property/status filters, CSV export, 3-step add modal (Personal → Accommodation → Emergency & Docs) with per-step Zod validation, vacant-room dropdown, jsPDF agreement preview. Detail page has 5 tabs (Profile / Ledger / Payments / Complaints / Documents) with running balance ledger, jsPDF receipts, embedded Add Ledger / Record Payment modals, and "Check Out" quick action.
- **Bulk Rent Charge**: slide-over from Residents page calling `POST /residents/bulk-rent` (creates RENT ledger entries for all active residents in a property for a given month).
- **Check-out flow**: `POST /residents/:id/checkout` marks resident `CHECKED_OUT`, frees the room (`VACANT`), records deductions/refund as ledger entries.
- **Custom (non-OpenAPI) endpoints**: bulk-rent and checkout — frontend calls them via `src/lib/api-fetch.ts` (`apiFetch` helper). Response shape is `{ success: boolean, data: ... }` — always read `res.data.X` not `res.X`.
- **PDF generation**: client-side via `jspdf` (agreements, receipts) — no Puppeteer or backend PDF.
- **Razorpay**: stubbed in UI ("Generate Payment Link" card) — needs API keys to enable.

## HRMS Module (Phase 5)

- **Schema** (`lib/db/src/schema/hrms.ts`): extended `employees` with `basic`/`hra`/`specialAllowance`/`exitedAt`. New tables: `leaveBalances` (per emp/year/type CL/SL/EL/PL with total+used), `performanceNotes` (APPRECIATION/WARNING/NEUTRAL timeline), `interviews`, `offers` (CTC + joining date), `exits` (RESIGNATION/TERMINATION/CONTRACT_END), `exitClearances` (4 depts: IT/ADMIN/FINANCE/ASSETS), `exitAssets` (5 items: LAPTOP/ID_CARD/KEYS/ACCESS_CARDS/UNIFORM).
- **Routes** (`artifacts/api-server/src/routes/employees.ts` ~700 lines): `GET /employees/stats/overview`; `GET /employees/:id/leave-balances`, `/attendance`, `/performance` (+POST), `/exit` (+POST creates 4 clearances + 5 assets); `PUT /exit-clearances/:cid`, `/exit-assets/:aid`; `POST /exits/:eid/finalize` (validates all CLEARED, sets emp EXITED). Attendance: `POST /attendance/bulk` (idempotent — upserts on day midnight, dedupes), `GET /by-date`, `GET /export-csv` (month CSV with day columns). Leave PUT auto-reconciles balances using prev-vs-row deltas (handles edits on approved leaves correctly). POST /employees seeds default balances (CL:12, SL:12, EL:15, PL:0) and uses `MAX(employeeCode)` for next code (no in-memory counter). Recruitment: `GET /candidates/:id` (with interviews+offers), `POST /candidates/:id/interviews`, `POST /candidates/:id/offers` (auto-moves stage to OFFER).
- **Frontend** (5 pages rebuilt): `employees.tsx` (stats + 4-tab add modal), `employee-detail.tsx` (6 tabs: Profile/Attendance/Leave/Performance/Documents/Exit — calendar grid with click-to-edit, bulk-mark-range, balance cards + Apply modal, performance timeline, exit lifecycle UI with clearance + asset checklists + finalize gating), `attendance.tsx` (date picker, inline status select, bulk mark all present, CSV export), `leaves.tsx` (status tabs with counts), `recruitment.tsx` (HTML5 DnD kanban with 7 stages APPLIED/SCREENED/INTERVIEW_1/INTERVIEW_2/OFFER/JOINED/REJECTED, candidate slide-over with BGV/notes/schedule interview, generate offer with jsPDF download, list view, requisitions grid).
- **Custom endpoints called via `apiFetch`** (not in OpenAPI): all the new HRMS detail endpoints above.

## Procurement & Inventory Module (Phase 6)

- **Schema** (`lib/db/src/schema/procurement.ts`): extended `vendors` (categories[], banking, status); added `rateContracts`, `vendorDocuments`, `stockMovements`. Indents now have `indentNumber` (IND-XXXXX), `totalEstimatedValue`, `submittedAt/approvedAt/rejectionReason`. POs have `poNumber` (PO-YYYYMMDD-XXX), `indentId`, `subtotal/gstApplicable/gstAmount`, `paymentTerms`, `sentAt`. GRNs have `invoiceNumber/invoicePhotoUrl/qcPass/qcNotes`.
- **Routes** (`artifacts/api-server/src/routes/procurement.ts` ~780 lines): vendor CRUD enriched with active-PO count; vendor sub-routes: `/vendors/:id/rate-contracts` (CRUD), `/documents` (with 30-day expiry alert flag), `/performance` (4 quarters of delivery accuracy + quality + complaints), `/purchase-orders`. Indents: auto IND-XXXXX numbering, `/approve`, `/reject`. POs: GST 18% server-side calc, `/send`, indent linkage auto-flips indent → PO_RAISED. **GRN POST is fully transactional** — single `db.transaction` wraps GRN insert + atomic SQL `currentStock + qty` increments (with `FOR UPDATE` row locks to prevent races) + stock movements + PO status advance to PARTIAL_DELIVERY/DELIVERED. Vendor complaint auto-creation on damage/short happens outside the tx so it can't roll back the GRN. Inventory: `/stats`, `/alerts`, `/movements`, `/consume` (atomic `GREATEST(stock - qty, 0)`), `/audit` (variance write inside tx), computed `stockStatus` (OK/LOW_STOCK/OUT_OF_STOCK/EXPIRING_SOON/EXPIRED). All auto-generated numbers (IND/PO/GRN) wrapped in `withUniqueRetry` to handle MAX+1 races on unique-constraint violations.
- **Frontend** (6 pages): `vendors.tsx` (search + status/category filters, add modal with 8-category multi-select), `vendor-detail.tsx` (5 tabs: Profile/Rate Contracts/POs/Compliance/Performance with recharts bar chart), `indents.tsx` (status tabs, raise indent multi-line modal with live total, approve/reject/convert-to-PO), `purchase-orders.tsx` (PO modal with rate-contract auto-suggest, slide-over with status timeline, jsPDF download, send-to-vendor, create-GRN), `grn.tsx` (PO-prefilled items with condition select, QC pass toggle), `inventory.tsx` (stat cards, alerts panel, item detail with movements log, consume + audit modals).
- **Custom endpoints called via `apiFetch`** (not in OpenAPI codegen): all procurement endpoints above.

## Key Implementation Notes

- `lib/api-zod/src/index.ts` must only export `from "./generated/api"` (not types) — orval codegen otherwise creates duplicate exports
- The API client uses `setAuthTokenGetter` in `main.tsx` to auto-attach JWT tokens
- wouter routes use children-as-function syntax: `<Route path="/">{() => <ProtectedRoute component={Dashboard} />}</Route>`
- Drizzle `numeric` columns must be converted to `Number()` before returning in API responses
- All numeric DB fields (amounts, ctc, askingRent) stored as `text` in DB but returned as `number` in API
