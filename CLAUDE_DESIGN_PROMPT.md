# Claude Design Prompt — Uniliv Admin Redesign

> Copy everything below this line into Claude Design.

---

Redesign the frontend of **Uniliv Admin** — a multi-property co-living operations platform used across India. It covers property operations, residents, food ordering & kitchen operations, quality audits, HR, procurement, sales CRM, and finance.

## 1. The single most important design goal

**Most daily users are NOT tech-savvy.** They are people on the ground: property managers (called **unit leads**) standing in a hostel corridor, kitchen staff on a hot kitchen floor, wardens at a gate desk, and cluster managers walking between properties. Many use the app one-handed on a mid-range Android phone, in bright sunlight, sometimes on patchy networks.

Design every field-facing screen so that a first-time user succeeds without training:

- **One primary action per screen**, as a large, obvious button. Big tap targets (minimum 44px, prefer larger).
- **Plain language, no jargon.** "Send today's food order", not "Create requisition". Short sentences. Numbers big, labels small.
- **Wizards over forms**: break multi-field tasks into one-question-at-a-time steps with a progress indicator. Smart defaults everywhere (today's date, my property, last-used values).
- **Cards over tables on mobile.** Tables are for HQ desktop screens only.
- **Status through color + icon + words together** (never color alone): e.g. a green check with "Delivered".
- **Forgiving flows**: confirmation before anything destructive, undo where possible, autosave with a visible "Saved" indicator, clear friendly error messages that say what to do next.
- **Visual empty states** that explain what the screen is for and show the one button to get started.
- Back-office/HQ screens (finance, HR, procurement, template building, admin consoles) can be denser and desktop-first — those users are office staff — but should share the same visual system.

## 2. Visual identity — KEEP EXACTLY AS IS (do not restyle)

Keep the current "Sunset" theme and typography unchanged. These are the exact tokens:

**Fonts (Google Fonts):**
- Body / UI: **DM Sans** (variable weight)
- Headings / display: **Hanken Grotesk** (400–800), letter-spacing -0.012em
- Numbers / IDs / metrics: **JetBrains Mono** (400–600), tabular numerals

**Brand:**
- Brand accent (links, active nav, primary actions): coral **#E8602C** (light mode) / **#F2703A** (dark mode); AA-safe text variant **#C24A1C**
- Signature brand gradient (hero moments, active-nav rail, app icon): `linear-gradient(120deg, #FF9A3D 0%, #F2603C 50%, #C2459A 100%)`
- Secondary "pop" accent: violet **#7C5CFF** (light) / **#9B82FF** (dark)
- Logo: flat orange "UNILIV" wordmark (#F18642); favicon is a gradient rounded square with a white "U"

**Light mode:**
- Background: warm off-white **#FCF9F6**; cards/popovers: **#FFFFFF**
- Ink / strong text: warm espresso **#241A15**; muted text: **#7C6E64**; muted bg: **#F4EDE6**
- Borders/inputs (hairlines): **#EFE6DE**
- Semantic: success **#157F5B**, warning **#9A6206**, danger **#C73B33**, info **#3666CF**

**Dark mode (fully supported, user-toggleable):**
- Background **#181210**, card **#221A16**, border **#322620**
- Ink **#F2E9E3**, muted **#A99C92**
- Semantic: success **#34C58A**, warning **#E0A33A**, danger **#F0857C**, info **#6FA0F0**

**Component system & density:**
- shadcn/ui ("new-york" style) on Radix primitives; icons: lucide. Keep this component vocabulary.
- Flat design: surfaces separated by 1px hairline borders, not shadows.
- Border radius base: **0.625rem (10px)** (sm 6 / md 8 / lg 10 / xl 14).
- Charts (Recharts) use the semantic tokens as series colors; small axis type; 4px bar radius.

## 3. App architecture & the Home experience (launcher-first — warm and gamified, NOT transactional)

**The navigation model (keep it):**

- **Launcher-first**: after login, every user lands on **Home** — an icon-grid of module tiles showing ONLY the modules that person's role can access. At first glance, a user sees everything they can do, as a grid. Tiles have a colored icon, module name, and a one-line description. A search box filters tiles.
- Clicking a tile opens that module: a **left sidebar listing only that module's pages** plus a pinned "Home" link back to the grid. Active page gets a gradient rail.
- Topbar: greeting + clock, global ⌘K command palette (searches permitted pages), theme toggle, notification bell, account menu.
- Mobile (breakpoint 768px): sidebar becomes a hamburger drawer; field screens are card-based and thumb-reachable.
- Access control hides everything a role can't use — users never see disabled/locked features.

**Home must NOT feel like a transactional admin dashboard. Gamify it:**

The module grid stays the centerpiece, but wrap it in a personal, motivating layer that makes opening the app feel like checking your own progress, not clocking into software. Ground every mechanic in data the platform already tracks:

- **Personal header**: warm greeting with the user's name and property/scope, avatar, and a **daily progress ring** — "3 of 4 tasks done today" (today's food order placed, deliveries confirmed, audits due, findings to fix). Use the brand gradient for the filled ring.
- **Live tile badges**: each module tile carries a small, glanceable nudge — "Order by 6:00 PM" countdown on Food, "2 audits due today" on Audits, "1 finding to fix" — so the grid itself tells the user what needs them, without opening anything.
- **Streaks**: consecutive days of placing the food order before cut-off, confirming deliveries on time, completing audits by their due date. A visible streak flame with a count; losing a streak is quiet, never shaming.
- **Scores as progress, not tables**: the property's audit compliance score and waste % as friendly progress rings/meters that visibly improve, with celebratory micro-moments when a personal best is hit.
- **Badges & milestones**: "10 audits on time", "Zero-waste week", "Full month of on-time orders" — small collectible achievements on the profile.
- **Friendly leaderboards** (optional, cluster/city scope): properties ranked by compliance or waste reduction — celebrate the top three, never display shame for the bottom.
- **Celebration moments**: a light confetti/checkmark animation on completing the daily ring, submitting an audit, or a mismatch-free delivery confirmation. Keep animations lightweight for low-end phones.
- **Tone rules**: encouraging, never punitive; gamification must never block, slow, or clutter a core task — it decorates the path, it is not a gate. All gamification visuals use the existing Sunset palette and gradient.

## 4. Personas and what each can access

There are ~21 system roles. Grouped into design personas, from least to most tech-savvy context:

### A. Field / ground staff (mobile-first, low tech comfort — design for them first)

| Persona | Who they are | Modules they see |
|---|---|---|
| **Unit Lead (the property manager)** | Manages ONE property on the ground and runs its food operations; on their feet all day, phone-only. **The primary persona for the Home experience.** | Food (My Dashboard, My Properties, Active Guests, Place Order, Confirm Delivery, Waste Tracking, Track Order, Reports view) + Audits (My Audits, execute assigned audits, My Findings — they are also the "auditee" who fixes findings for their property) |
| **Kitchen staff / F&B Supervisor** | Works the kitchen floor for one cluster's kitchen; needs prep counts and dispatch at a glance | Food only: Kitchen Summary (edit), Dispatch (edit), Dashboard, Place Order, Delivery Tracking, Confirm Delivery, Waste, Reports (view) |
| **Warden** | Lives on-site at a property; gate desk + resident care | Residents (full), Complaints (full), Laundry (full), Attendance & Out-pass (full), Communications (create), Properties/Facility/Electricity/IoT/Wallet (view) |
| **Cluster Manager** | Oversees a handful of properties; half field, half phone-admin | Food (same field screens as Unit Lead, plus edit on All Orders, view Dispatch) + Audits (conducts CM and UL audits for their cluster; views CX read-only; NC board view) |
| **CX Auditor (Customer Experience)** | Does surprise "customer experience" inspections at any property | Audits only: My Audits, create & run ad-hoc CX audits (camera + GPS evidence), Register/Dashboard/NCs/Reports (view) |

### B. Oversight / management (mostly read, mobile + desktop)

| Persona | Who they are | Modules they see |
|---|---|---|
| **City Head / Zonal Head** | Food-ops oversight for a city/zone | Food (view dashboards, orders — can edit All Orders, view dispatch/waste/reports) + Audits (dashboards, register, NCs, reports — view only, never CX audits) |
| **F&B Manager / F&B Zonal Head** | Owns kitchen operations & food master data (manager: global; zonal: one zone) | Food: Kitchen Summary + Dispatch (edit), Dashboard, Reports; F&B Manager additionally owns **Food Settings & Masters** (dishes, ingredients, portion rules, cut-offs, agencies…) |
| **Senior Vice President** | Executive; global read-only oversight | Food (view) + Audits (view, UL/CM only) |

### C. HQ back-office specialists (desktop-first, comfortable with density)

| Persona | Who they are | Modules they see |
|---|---|---|
| **Operations Manager** | Runs property operations centrally | Properties, Residents, Complaints, Laundry, Communications, Facility, Electricity, Resident Attendance, IoT (all full); Wallet (view) |
| **HR Manager** | People operations | Employees, Attendance, Leaves, Recruitment, L&D (full); Users & Roles (full) |
| **Procurement Manager** | Purchasing | Vendors, Indents, Purchase Orders, GRN, Inventory (full) |
| **Kitchen Manager** | Central-kitchen recipes & menu planning (legacy kitchen module, separate from Food ops) | Recipes, Menu Planning (full); Inventory (view) |
| **Finance** | Accounts & collections | Ledger, Payments, Wallet, Billing Cycles, Reminders, Banking, Expenses (full); Executive Dashboard, Residents, Indents/POs (view) |
| **Sales Executive** | Resident-acquisition CRM | Sales Pipeline (full), Sales Dashboard (view), Property Leads (view) |
| **Projects Manager / Property Acquisition** | New-property scouting & expansion | Property Leads (full); Projects Manager also views Ledger/Payments/Indents/POs |

### D. Admin & special

| Persona | Who they are | Modules they see |
|---|---|---|
| **Super Admin / Ops Excellence** | Platform owners; Ops Excellence is the audit-program owner (reviews/approves audits) | Everything, full access |
| **Audit Readonly** | Compliance viewer | Everything, view-only |
| **Vendor (restricted)** | External vendor portal | Dashboard only (minimal) |

Note: the "property manager" on the ground IS the **Unit Lead** — there is no separate property-owner role. Design Home and the field flows for the Unit Lead first; every other field persona (kitchen staff, warden, cluster manager) reuses the same patterns.

Scoping rule to reflect in the UI: what a user SEES inside Food and Audits is bounded by their place in the org hierarchy — **Zone → City → (Kitchen) → Cluster → Property**. A Unit Lead sees one property; a Cluster Manager their cluster; a City Head their city. Screens should always make the current scope visible ("Sunrise Heights, Koramangala") rather than making users pick from global lists.

## 5. Complete module & feature inventory

### 5.1 Home (Module Launcher)
- Icon-grid of permitted modules with search. The entire nav model. Keep it, make it beautiful and instantly scannable.

### 5.2 Food — food ordering & kitchen operations (largest module, most field usage)
The daily pipeline: property places meal order → central kitchen preps → dispatch builds delivery trips → property confirms receipt → waste recorded.
- **My Dashboard** (unit lead home): greeting, KPIs (active guests, occupancy, collections), per-property cards with demand/wastage/occupancy.
- **My Properties**: card per property with photo carousel, brand/kitchen tags, awaiting-delivery badge, tappable stats deep-linking to guests/orders.
- **Active Guests**: searchable list of current residents (drives meal headcount).
- **Place Order** ⭐ (the highest-traffic field flow): pick property → meal & date (enforces order cut-off windows) → set headcount once and per-dish quantities auto-calculate from portion rules → review, per-item override → place. Also: share menu as public link/image/WhatsApp. Confirmation with live "track status".
- **Confirm Delivery** ⭐: verify dispatched orders arrived; fix quantity mismatches (validation blocks confirm until resolved); proof of delivery.
- **Waste Tracking**: log post-delivery wastage within a 1-hour edit window.
- **Track Order**: enter order number → kitchen→delivery timeline.
- **Kitchen Summary** ⭐ (kitchen floor): consolidated prep plan — meals to prep, dish/component breakdowns, start prep.
- **Dispatch** ⭐ (logistics desk): queue / in-transit / trips tabs; build a trip (select orders → pick agency → assign vehicle + driver → depart), cancel trip.
- **Food Dashboard** (HQ): order KPIs, overview & insight charts.
- **All Orders** + **Order Detail**: master list across properties; full order timeline, items, delivery info.
- **Organization** (HQ): hierarchy console — cities/kitchens/properties, brands, delivery agencies, tag unit leads to properties.
- **Reports** & **Waste Analytics** (HQ): volume/status/waste charts, exports; cross-property wastage trends.
- **Food Settings & Masters** (HQ admin): dishes, ingredients, menu rotation, composition rules, portion-size rules, agencies, kitchens, meal types, cut-offs, hierarchy, users & scopes.

### 5.3 Audits — audit & inspection (second-largest, heavy field usage)
Quality program: build checklist templates → schedule recurring audits → field execution with photo/GPS evidence → review & approval → findings (non-conformances) with CAPA deadlines → reports; append-only audit trail.
- **My Audits** ⭐ (field queue): mobile card list grouped Overdue / Today / Upcoming / Rework, due countdowns, tap to run.
- **Audit Runner** ⭐: section-by-section question flow (yes/no, numeric, select, N/A), weights with live provisional score, mandatory-question enforcement, inline finding creation, ad-hoc items, autosave with visible save state, submit for review. Scores are always computed, never manually overridden.
- **Camera Capture** ⭐: full-screen live camera with timestamp + GPS + auditor watermark; submission proof requires GPS lock and live capture (no gallery picks).
- **My Findings** ⭐: card list of NCs the user must fix, grouped by SLA urgency; submit resolution/CAPA.
- **Audit Dashboard** (HQ): completion rate, average score, on-time %, overdue, compliance; trends, top failing questions.
- **Audit Register**: all audits in scope; segments (overdue/draft/in review/completed/mine), search/filter, bulk reassign.
- **New Audit**: create ad-hoc audit from a published template (CX audits are ad-hoc only).
- **Audit Detail**: details / comments / activity; cancel, reassign.
- **NC Board** + **NC Detail**: kanban Open → In Progress → Extension Requested → Resolved → Reopened → Closed → Waived; severity + SLA countdown; verify/reject/waive; due-date extension requests.
- **Review Queue & Workspace** (Ops Excellence / Super Admin only): per-question review, approve / reject (sends back for rework) / reopen; add findings.
- **Reports**: generated PDF registry with share links + five named reports (Audit Summary, Property Compliance, Auditor Performance, Failed Audits, Overdue Audits) with CSV/Excel/PDF export.
- **Schedules** + **Calendar**: recurring audit programs; materialized vs projected occurrences.
- **Templates**: versioned checklist library with publish workflow (published versions immutable); **Template Builder** (sections, questions, weights, response types), preview with live score; **Question Bank** of reusable questions.
- **Audit Admin**: role grants, rating scales, bands, severity & SLA, notifications, attachment policies, feature toggles, master data, numbering.
- **Trail Explorer**: append-only hash-chained trail of every change.

### 5.4 Operations (property day-to-day)
- **Rooms**: room inventory across properties; add/edit (number, type, capacity, rent).
- **Residents** + **Resident Detail**: lifecycle KPIs; deep 10-tab profile (Profile, Ledger, Payments, Complaints, Documents, KYC approve/reject, E-sign, Reminders, Attendance, Wallet); onboard, record payment, share payment link, message resident.
- **Complaints** + **Detail**: ticket KPIs and SLA tracking; assign, resolve, escalate; timeline; analytics tab.
- **Laundry**: log inward; advance batches wash → ready → delivered; TAT-breach tracking.
- **Communications**: announcements, bulk messages, templates, send log.
- **Facility**: assets, preventive-maintenance schedules, service logs.
- **Electricity**: meters, readings (single/bulk), tariffs; post computed charges to resident ledgers.
- **Attendance & Out-pass** (gate desk, field): daily resident roll-call; create/approve out-passes.
- **IoT Devices**: register devices, live telemetry, recent readings.

### 5.5 People (HR)
- **Employees** + **Detail**: staff records; add-employee wizard (Personal / Employment / Compensation / Banking); attendance calendar, leave, performance notes, exit/offboarding flow.
- **Attendance**: daily staff board.
- **Leaves**: request queue, approve/reject.
- **Recruitment**: kanban pipeline, requisitions, interviews, offers.
- **Learning & Development**: course library, enrollments, compliance %, certificates; course detail with PDF content.

### 5.6 Supply Chain (procurement)
- **Vendors** + **Detail**: vendor list with ratings; rate contracts, POs, compliance docs, quarterly performance.
- **Indents**: material requests; create, approve/reject.
- **Purchase Orders**: create POs against vendors; track fulfilment.
- **GRN**: record goods received against POs.
- **Inventory**: SKU stock, low-stock/expiry alerts, movements, consumption recording, stock audit.

### 5.7 Kitchen & Menu (central-kitchen planning)
- **Recipes**: master recipe library.
- **Menu Planning**: weekly plan, daily production & dispatch, wastage logging, analytics (rating by recipe, wastage trend).

### 5.8 Growth (sales)
- **Sales Dashboard**: funnel by stage, volume by source, team performance.
- **Sales Pipeline**: leads; schedule visit, visit outcome, follow-up, mark lost, convert to resident.
- **Property Leads**: property-acquisition scouting; financial viability, documents & photos.

### 5.9 Finance
- **Ledger**: all resident financial transactions.
- **Payments**: receipts across the portfolio.
- **Wallet** + **Detail**: resident wallet balances, top-up, manual adjustment, reverse transaction.
- **Recurring Billing**: per-property billing cycles auto-generating rent invoices; run history.
- **Rent Reminders**: automated pre/post-due reminder rules; sent history.
- **Smart Banking**: import bank statements, reconcile against invoices.
- **Expense Management**: record expenses with submit → approve → paid workflow; categories.

### 5.10 Settings (platform admin)
- **Masters**: reference-data hub (brands, cities, clusters, zones, kitchens; dishes, ingredients, agencies, composition & portion rules).
- **Users & Roles**: invite users, assign roles.
- **Audit Log**: platform-wide change trail (separate from the Audits module trail).
- **Configuration**: general, complaint SLA, complaint routing, notifications, integrations (Razorpay/Twilio/SMTP), KYC gate, electricity tariffs, wallet, login security/OTP.

### 5.11 Currently hidden (routes exist, tiles hidden — design them anyway as HQ screens)
- **Dashboard** (property-scoped ops KPIs), **Executive Dashboard** (org-wide finance/ops/people KPIs), **Properties** + **Property Detail** (catalog with rooms, residents, complaints, documents, bookings, photos).

### 5.12 Public pages (no login, no shell)
- **Login** (email + password + OTP step), password reset, username recovery.
- **E-sign page**: public document signing with a draw-signature canvas.
- **Shared Menu** (`/m/:token`): read-only menu a unit lead shares to residents via WhatsApp — this is resident/consumer-facing, make it delightful.
- Forbidden (403) and Not Found pages.

## 6. Priority order for the redesign

1. The **gamified Home launcher** (section 3) + module sidebar + mobile shell — the first thing every persona sees, and the emotional center of the redesign.
2. The five ⭐ field flows: **Place Order, Confirm Delivery, My Audits + Audit Runner + Camera, My Findings, Kitchen Summary + Dispatch** — these are used daily by the least tech-savvy users.
3. Unit-lead home (My Dashboard), My Properties, Attendance & Out-pass, Laundry.
4. HQ dashboards (Food, Audits) and the review/NC workflows.
5. Back-office modules (People, Supply Chain, Finance, Growth, Settings) — visual refresh on the shared system, density is fine here.

## 7. Hard constraints

- Keep the Sunset palette, the three fonts, the gradient, the 10px radius, flat hairline-border style, and light + dark modes exactly as specified in section 2.
- Keep the launcher-first navigation model and per-module sidebars. Home is always the role-filtered module grid; gamification wraps around the grid, it never replaces or buries it.
- Gamification is encouraging, never punitive, and never blocks or slows a core task.
- Keep shadcn/Radix + lucide as the component/icon vocabulary.
- Everything must work beautifully at 360–430px width; HQ screens also at desktop widths.
- Role-gating means hidden, not disabled: never show a user a module or action they can't use.
- Language: English UI, but written at a simple reading level (many users' second language).
