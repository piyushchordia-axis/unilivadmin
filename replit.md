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

## Key Implementation Notes

- `lib/api-zod/src/index.ts` must only export `from "./generated/api"` (not types) — orval codegen otherwise creates duplicate exports
- The API client uses `setAuthTokenGetter` in `main.tsx` to auto-attach JWT tokens
- wouter routes use children-as-function syntax: `<Route path="/">{() => <ProtectedRoute component={Dashboard} />}</Route>`
- Drizzle `numeric` columns must be converted to `Number()` before returning in API responses
- All numeric DB fields (amounts, ctc, askingRent) stored as `text` in DB but returned as `number` in API
