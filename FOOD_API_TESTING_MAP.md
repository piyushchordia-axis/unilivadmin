# Food Module — Complete API Testing Map

A route-by-route testing map for the UNILIV **Food** module: every `/api/food/*` endpoint,
what it does, exactly where the frontend calls it, the click-path to reach it, what user action
fires it, params, responses, roles, and whether it is wired to the UI at all.

**How paths work:** the web client's `apiFetch(path)` prepends `/api`, and `foodApi.*` wrappers
use paths like `/food/...`, so `foodApi.listOrders()` → **`GET /api/food/orders`**. Ad-hoc curl goes
through the proxy: `curl localhost:80/api/food/...`. Query params with value `undefined`, `null`,
`""` or `"ALL"` are dropped client-side (`qs()`), so `ALL` filters are simply omitted.

**Two routers, one mount:** `food.ts` and `food-ops.ts` both mount at `/api/food` (food.ts first).
Every endpoint below says which file owns it.

---

## 0. How a tester reaches the Food module

There is **no top "Food" menu**. Login → `homeForRole(role)`:
- `FNB_MANAGER` → `/food/kitchen-summary` (straight into Kitchen Summary).
- Everyone else → `/apps` (**App Launcher**).

In the launcher, click the **Food** tile → `/food/dashboard`. Inside the module the **sidebar shows
only the Food group**; "All Modules" returns to `/apps`. Solo-persona roles (e.g. UNIT_LEAD) see each
Food workspace as its own launcher tile instead of one "Food" tile.

**Sidebar (Food group) order:** Food Overview · Organization · All Orders · Kitchen Summary ·
Dispatch · Recipes · Menu Planning · Reports · Waste Analytics · Settings.

Pages with **no nav item** (deep-link / CTA / detail only): `/food/orders/:id`, `/food/track`,
`/food/guests`, `/food/my-properties`, `/home` (UnitLeadHome), `/masters`, `/m/:token` (public).

**Nav-path shorthand used below:** `Launcher → Food → <Page>` means App-launcher Food tile then the
sidebar item; for detail/CTA pages the trigger column names the origin.

---

## 1. MASTER TABLE — every Food API

Status legend: **✅ Used** (wired to a Food page) · **🔵 Used (non-Food page)** · **🌐 Public** ·
**⚠️ Not currently invoked from the UI** (endpoint exists, no caller — test via curl/Postman only).

Role shorthand: module + permission, e.g. `FOOD_DISPATCH:edit`. `auth-only` = any logged-in user
(no `authorize`). `SUPER_ADMIN` = hard super-admin gate.

### 1a. Orders — lifecycle

| API | Purpose | Frontend Screen | Navigation Path | Trigger | Role | Status |
|---|---|---|---|---|---|---|
| `GET /orders` | Paginated/filtered order list | All Orders, Food Overview, Track, Dispatch, Kitchen Summary | Launcher → Food → All Orders | Page load + filter/search/date change; dashboard **polls 60s** | `authorizeAny(FOOD_ALL_ORDERS/FOOD_DISPATCH/FOOD_KITCHEN_SUMMARY):view` | ✅ |
| `GET /orders/:id` | Order detail (items+events) | Order Detail, Food Overview | All Orders → row click | Page load; meal-tab select on dashboard | `FOOD_ALL_ORDERS:view` | ✅ |
| `GET /orders/track` | Look up one order by number/id | Track an Order | All Orders → row "Track" / deep link `?order=` | Track form submit / active-order pill / URL param | `FOOD_ALL_ORDERS:view` | ✅ |
| `POST /orders` | Create **single-meal** order | — | — | — | `FOOD_PLACE_ORDER:create` | ⚠️ (UI uses `/order-batches`) |
| `POST /order-batches` | Create **multi-meal** order (1–4 orders) | Food Overview | Launcher → Food → Food Overview → order day | Click **"Send … order"** | `FOOD_PLACE_ORDER:create` | ✅ |
| `GET /order-preview` | Per-item qty preview | Food Overview | (same) | On order day when place-order panel active | `FOOD_PLACE_ORDER:view` | ✅ |
| `GET /order-draft` | Load saved place-order draft | Food Overview | (same) | On order day with pending order | `FOOD_PLACE_ORDER:create` | ✅ |
| `PUT /order-draft` | Upsert draft | Food Overview | (same) | **800ms-debounced autosave** on edit | `FOOD_PLACE_ORDER:create` | ✅ |
| `DELETE /order-draft` | Delete draft | Food Overview | (same) | After successful place-order | `FOOD_PLACE_ORDER:create` | ✅ |
| `PUT /orders/:id` | Edit people count / notes (qty recomputed) | Order Detail | All Orders → row → **Edit order** | Click **"Save changes"** | `FOOD_PLACE_ORDER:edit` | ✅ |
| `POST /orders/:id/accept` | Kitchen accept (PLACED→ACCEPTED) | Kitchen Summary, Order Detail | Launcher → Food → Kitchen Summary | Click **Accept** / **Start prep** / **Mark all preparing** | `FOOD_KITCHEN_SUMMARY:edit` | ✅ |
| `POST /orders/:id/reject` | Kitchen reject | Order Detail | All Orders → row → **Reject** | Reject dialog **"Reject order"** | `FOOD_KITCHEN_SUMMARY:edit` | ✅ |
| `POST /orders/:id/prepare` | ACCEPTED→PREPARING | Kitchen Summary | Launcher → Food → Kitchen Summary | Click **Mark Preparing** / **Start prep** | `FOOD_KITCHEN_SUMMARY:edit` | ✅ |
| `POST /orders/:id/cancel` | Cancel (pre-dispatch only) | Food Overview, Order Detail, Track | (each origin) | Cancel dialog / arm-twice cancel | inline: `FOOD_PLACE_ORDER:edit` **or** `FOOD_KITCHEN_SUMMARY:edit` | ✅ |
| `POST /orders/:id/dispatch` | Start/dispatch a **single** order | — | — | — | `FOOD_DISPATCH:edit` | ⚠️ (UI uses trip `/dispatches`) |
| `POST /orders/dispatch/bulk` | Bulk-dispatch orders | — | — | — | `FOOD_DISPATCH:edit` | ⚠️ (UI uses trip `/dispatches`) |
| `POST /orders/:id/confirm-delivery` | Confirm receipt + received qty | Food Overview | Launcher → Food → Food Overview | Click **"Confirm delivery"** | `FOOD_CONFIRM_DELIVERY:edit` | ✅ |
| `POST /orders/:id/waste` | Record wasted qty | Food Overview | (same) | Click **Save** in waste column (after window opens) | `FOOD_WASTE_TRACKING:edit` | ✅ |

### 1b. Dispatch (trips) — `food-ops.ts`

| API | Purpose | Frontend Screen | Navigation Path | Trigger | Role | Status |
|---|---|---|---|---|---|---|
| `GET /dispatches` | List trips | Dispatch (Trips tab) | Launcher → Food → Dispatch | Page load | `FOOD_DISPATCH:view` | ✅ |
| `GET /dispatches/active-vehicles` | Vehicle ids on active trips | Dispatch | (same) | Page load (disables in-use vehicles) | `FOOD_DISPATCH:view` | ✅ |
| `GET /dispatches/:id` | Trip detail + orders | Dispatch (trip sheet) | Dispatch → click a trip row | Open trip sheet | `FOOD_DISPATCH:view` | ✅ |
| `GET /dispatches/:id/events` | Trip audit timeline | Dispatch (trip sheet) | (same) | Open trip sheet | `FOOD_DISPATCH:view` | ✅ |
| `POST /dispatches` | **Create trip / "Load the van"** | Dispatch (Queue tab) | (same) | **"Send it off"** / **"Create trip"** | `FOOD_DISPATCH:edit` | ✅ |
| `PATCH /dispatches/:id/status` | Trip status transition | Dispatch | (same) | **"Mark departed" / Depart / Mark delivered / Mark partial** | `FOOD_DISPATCH:edit` | ✅ |
| `PATCH /dispatches/:id/orders/:orderId` | Mark one order delivered / undo | Dispatch (trip sheet) | (same) | Per-order **"Done" checkbox** | `FOOD_DISPATCH:edit` | ✅ |
| `POST /dispatches/:id/cancel` | Cancel trip, revert orders→PREPARING | Dispatch (trip sheet) | (same) | **"Cancel trip"** | `FOOD_DISPATCH:edit` | ✅ |

### 1c. Kitchen Summary, Dashboard & pending

| API | Purpose | Frontend Screen | Navigation Path | Trigger | Role | Status |
|---|---|---|---|---|---|---|
| `GET /kitchen-summary` | Aggregated dish quantities per meal | Kitchen Summary | Launcher → Food → Kitchen Summary | Page load + filter; **Refresh** button | `FOOD_KITCHEN_SUMMARY:view` | ✅ |
| `GET /dashboard` | KPIs + pending-action counts | — | — | — | `FOOD_DASHBOARD:view` | ⚠️ Not invoked (dashboard uses other calls) |
| `GET /waste-pending` | Delivered orders awaiting waste log | — | — | — | `FOOD_DASHBOARD:view` | ⚠️ Not invoked |
| `GET /cutoffs` | Resolved per-meal cut-off state | Food Overview | Launcher → Food → Food Overview | Page load | auth-only | ✅ |
| `GET /lookups` | Properties, agencies, brands, meals | Most Food pages | (every page) | Page load | auth-only | ✅ |

### 1d. Unit-Lead home & guests — `food-ops.ts`

| API | Purpose | Frontend Screen | Navigation Path | Trigger | Role | Status |
|---|---|---|---|---|---|---|
| `GET /my-properties` | Property cards | My Properties; `/home` | deep link `/food/my-properties` | Page load | `FOOD_DASHBOARD:view` | ✅ |
| `GET /next-orders` | Next-orderable board | Food Overview | Launcher → Food → Food Overview | Page load; **polls 300s** | `FOOD_PLACE_ORDER:view` | ✅ |
| `GET /property-overview` | Single-property occupancy/revenue | Food Overview, Guests | (each) | Page load when property resolved | `FOOD_DASHBOARD:view` | ✅ |
| `GET /revenue` | Monthly revenue series | `/home` (UnitLeadHome) | deep link `/home` | Page load | `FOOD_DASHBOARD:view` | 🔵 (non-nav `/home`) |
| `GET /home-analytics` | Unit-lead home analytics | `/home` (UnitLeadHome) | deep link `/home` | Page load | `FOOD_REPORTS:view` | 🔵 (non-nav `/home`) |
| `GET /guests` | Active-resident roster (paged) | Active Guests | deep link `/food/guests` | Page load + property/search/pagination | `FOOD_DASHBOARD:view` | ✅ |
| `GET /guests/export.csv/.pdf/.xls` | Export guests | Active Guests | (same) | **Download** menu | `FOOD_DASHBOARD:view` | ✅ |

### 1e. Reports & analytics

| API | Purpose | Frontend Screen | Navigation Path | Trigger | Role | Status |
|---|---|---|---|---|---|---|
| `GET /reports` | Orders/meal/resident/status report | Reports | Launcher → Food → Reports | Page load + filter change | `FOOD_REPORTS:view` | ✅ |
| `GET /analytics` | Wastage/delay analytics | Reports | (same) | Page load + filter | `FOOD_REPORTS:view` | ✅ |
| `GET /reports/on-time` | On-time % + trend | Reports | (same) | Page load + filter | `FOOD_REPORTS:view` | ✅ |
| `GET /reports/variance-by-day` | Per-day ordered-vs-received | Reports | (same) | Meal-badge / period / property change | `FOOD_REPORTS:view` | ✅ |
| `GET /reports/variance` | Variance grouped by meal | — | — | — | `FOOD_REPORTS:view` | ⚠️ Not invoked |
| `GET /settings/ontime-tolerance` | Read on-time tolerance | Reports | (same) | Page load | auth-only | ✅ |
| `PUT /settings/ontime-tolerance` | Set tolerance (0–240) | Reports | (same) | Tolerance popover **Save** | **SUPER_ADMIN** | ✅ |
| `GET /reports/export.{csv,pdf,xls}` + `/reports/export.:fmt` | Export report | Reports | (same) | **Download → report → format** | `FOOD_REPORTS:view` | ✅ |
| `GET /waste-analytics` | Cross-property waste analytics | Waste Analytics | Launcher → Food → Waste Analytics | Page load + filter/granularity | `FOOD_REPORTS:view` | ✅ |
| `GET /waste-analytics/export.:fmt` | Per-widget waste export | Waste Analytics | (same) | Per-chart **Export** dropdown | `FOOD_REPORTS:view` | ✅ |

### 1f. Masters: dishes, ingredients, rotation, composition, portion rules — `food.ts`

| API | Purpose | Frontend Screen | Navigation Path | Trigger | Role | Status |
|---|---|---|---|---|---|---|
| `GET /dishes` | List dishes | Settings → Dishes; Rotation/Rules tabs | Launcher → Food → Settings | Page load + search | auth-only | ✅ |
| `GET /dishes/:id` | Dish detail (+ingredients) | Settings → Dishes | (same) | Click **Edit** | auth-only | ✅ |
| `POST /dishes` | Create dish | Settings → Dishes | (same) | Add-dish **submit** | `FOOD_SETTINGS:create` | ✅ |
| `PUT /dishes/:id` | Update dish | Settings → Dishes | (same) | Edit-dish **submit** | `FOOD_SETTINGS:edit` | ✅ |
| `DELETE /dishes/:id` | Soft-delete dish | Settings → Dishes | (same) | ConfirmDelete | `FOOD_SETTINGS:delete` | ✅ |
| `GET /ingredients` | List ingredients | Settings → Ingredients / Dishes form | (same) | Page load | auth-only | ✅ |
| `POST/PUT/DELETE /ingredients[/:id]` | Ingredient CRUD | Settings → Ingredients | (same) | submit / ConfirmDelete | `FOOD_SETTINGS:create/edit/delete` | ✅ |
| `GET /menu-rotation` | List rotation rows | Settings → Menu Rotation | (same) | Page load + filter | auth-only | ✅ |
| `POST /menu-rotation/bulk` | Bulk create rotation | Settings → Menu Rotation | (same) | Add-entry **submit** (create) | `FOOD_SETTINGS:create` | ✅ |
| `PUT /menu-rotation/slot` | Replace a slot | Settings → Menu Rotation | (same) | Edit-slot **submit** | `FOOD_SETTINGS:edit` | ✅ |
| `GET /menu-rotation/validate` | Composition verdict for a selection | Settings → Menu Rotation | (same) | Live as dishes checked (`validateComposition`) | auth-only | ✅ |
| `GET /menu-rotation/auto-fill` | Suggest dishes for slots | Settings → Menu Rotation | (same) | **"Auto-fill from rule"** | auth-only | ✅ |
| `DELETE /menu-rotation/:id` | Delete rotation row (hard) | Settings → Menu Rotation | (same) | ConfirmDelete | `FOOD_SETTINGS:delete` | ✅ |
| `GET /menu-rotation/export.csv/.pdf` | Export rotation | Settings → Menu Rotation | (same) | Export dropdown | auth-only | ✅ |
| `POST /menu-rotation` | Create **single** rotation row | — | — | — | `FOOD_SETTINGS:create` | ⚠️ (UI uses `/bulk`) |
| `PUT /menu-rotation/:id` | Update single rotation row | — | — | — | `FOOD_SETTINGS:edit` | ⚠️ (UI uses `/slot`) |
| `GET /menu-rotation/resolve` | Resolve effective menu | — | — | — | auth-only | ⚠️ Not invoked |
| `GET /composition-rules` | List composition rules | Settings → Menu Rules | (same) | Page load | auth-only | ✅ |
| `POST/PUT/DELETE /composition-rules[/:id]` | Composition rule CRUD | Settings → Menu Rules | (same) | submit / ConfirmDelete | `FOOD_SETTINGS:create/edit/delete` | ✅ |
| `GET /rules` | List portion (per-resident) rules | Settings → Portion Size Rules | (same) | Page load + filter | auth-only | ✅ |
| `POST/PUT/DELETE /rules[/:id]` | Portion rule CRUD | Settings → Portion Size Rules | (same) | submit / ConfirmDelete | `FOOD_SETTINGS:create/edit/delete` | ✅ |

### 1g. Masters: kitchens, brands, meal config, cut-offs — `food-ops.ts` (+brands)

| API | Purpose | Frontend Screen | Navigation Path | Trigger | Role | Status |
|---|---|---|---|---|---|---|
| `GET /kitchens` | List kitchens | Settings, Dispatch, Organization, Agencies | (each) | Page load | auth-only | ✅ |
| `POST/PUT/DELETE /kitchens[/:id]` | Kitchen CRUD (soft delete) | Settings → Kitchens; Organization | Launcher → Food → Settings/Organization | submit / ConfirmDelete | `FOOD_SETTINGS:create/edit/delete` | ✅ |
| `GET /kitchen-by-pincode` | Resolve kitchen for a pincode | Property form modal | (property create/edit) | Pincode entered | auth-only | 🔵 (non-Food page) |
| `GET /brands` | List brands | Settings tabs, Organization | (each) | Page load | auth-only | ✅ |
| `POST/PUT/DELETE /brands[/:id]` | Brand CRUD (soft delete) | Organization → Brands | Launcher → Food → Organization | submit / deactivate | `FOOD_SETTINGS:create/edit/delete` | ✅ |
| `GET /meal-config` | Meal-type config | Settings → Meal Types | Launcher → Food → Settings | Page load | auth-only | ✅ |
| `PUT /meal-config/:mealType` | Update meal config | Settings → Meal Types | (same) | Enabled toggle / edit submit | `FOOD_SETTINGS:edit` | ✅ |
| `GET /meal-windows` | Service windows | Settings → Cut-offs & Service | (same) | Page load + brand filter | auth-only | ✅ |
| `POST/PUT/DELETE /meal-windows[/:id]` | Window CRUD (hard delete) | Settings → Cut-offs & Service | (same) | submit / ConfirmDelete | `FOOD_SETTINGS:create/edit/delete` | ✅ |
| `GET /cutoff-config` | Per-brand cut-off | Settings → Cut-offs & Service | (same) | Page load | auth-only | ✅ |
| `POST/PUT/DELETE /cutoff-config[/:id]` | Cut-off CRUD (hard delete) | Settings → Cut-offs & Service | (same) | submit / ConfirmDelete | `FOOD_SETTINGS:create/edit/delete` | ✅ |
| `GET /system-config/food-defaults` | Read global defaults | Settings → Food Defaults | (same) | Page load | auth-only | ✅ |
| `PUT /system-config/food-defaults` | Set defaults | Settings → Food Defaults | (same) | **Save defaults** | **SUPER_ADMIN** | ✅ |

### 1h. Organization: hierarchy, agencies, geo, scopes — `food.ts` / `food-ops.ts`

| API | Purpose | Frontend Screen | Navigation Path | Trigger | Role | Status |
|---|---|---|---|---|---|---|
| `GET /hierarchy` | City→Kitchen→Property tree | Organization → Hierarchy | Launcher → Food → Organization | Page load | `FOOD_DASHBOARD:view` | ✅ |
| `POST /properties/:id/assign-brand` | Set property brand | Organization | (same) | Configure-property **Save** | `FOOD_SETTINGS:edit` | ✅ |
| `POST /properties/:id/assign-kitchen` | Set property kitchen | Organization | (same) | Configure-property **Save** | `FOOD_SETTINGS:edit` | ✅ |
| `POST /properties/:id/assign-cluster` | Set property cluster | Settings → Hierarchy | Launcher → Food → Settings | Cluster Select change | `FOOD_ORG:edit` | ✅ |
| `GET /agencies` | List agencies (+vehicles/locations) | Organization → Agencies; Settings → Agencies | (each) | Page load + search | `FOOD_ORG:view` | ✅ |
| `POST/PUT/DELETE /agencies[/:id]` | Agency CRUD (soft delete) | Organization → Agencies | (same) | submit / toggle / ConfirmDelete | `FOOD_ORG:create/edit/delete` | ✅ |
| `POST /agencies/:id/locations` | Add location | Organization → Agencies | (same) | Add-location submit | `FOOD_ORG:create` | ✅ |
| `PUT/DELETE /agency-locations/:id` | Location update/delete (hard) | Organization → Agencies | (same) | submit / ConfirmDelete | `FOOD_ORG:edit/delete` | ✅ |
| `POST /agencies/:id/vehicles` | Add vehicle | Organization → Agencies | (same) | Add-vehicle submit | `FOOD_ORG:create` | ✅ |
| `PUT/DELETE /agency-vehicles/:id` | Vehicle update/delete (hard) | Organization → Agencies | (same) | submit / ConfirmDelete | `FOOD_ORG:edit/delete` | ✅ |
| `GET /agencies/:id/kitchens` | Kitchens an agency serves | Organization → Agencies | (same) | Expand "Serves kitchens" | `FOOD_ORG:view` | ✅ |
| `PUT /agencies/:id/kitchens` | Replace agency↔kitchen links | Organization → Agencies | (same) | **Save** kitchen checkboxes | `FOOD_ORG:edit` | ✅ |
| `GET /kitchens/:id/agencies` | Reverse: agencies for a kitchen | — | — | — | `FOOD_ORG:view` | ⚠️ Not invoked |
| `GET /zones` | List zones | Settings → Hierarchy; Users&Scopes | (same) | Page load | `FOOD_ORG:view` | ✅ |
| `POST /zones` | Create zone | Settings → Hierarchy | (same) | Add-zone submit | `FOOD_ORG:create` | ✅ |
| `PUT /zones/:id`, `DELETE /zones/:id` | Update/delete zone (hard) | — | — | — | `FOOD_ORG:edit/delete` | ⚠️ No wrapper |
| `GET /cities` | List cities | Settings, Organization, Waste Analytics | (each) | Page load | `FOOD_ORG:view` | ✅ |
| `POST /cities` | Create city | Settings → Hierarchy; Organization | (same) | Add-city submit | `FOOD_ORG:create` | ✅ |
| `PUT /cities/:id`, `DELETE /cities/:id` | Update/delete city (hard) | — | — | — | `FOOD_ORG:edit/delete` | ⚠️ No wrapper |
| `GET /clusters` | List clusters | Settings, Waste Analytics | (each) | Page load + city filter | `FOOD_ORG:view` | ✅ |
| `POST /clusters` | Create cluster | Settings → Hierarchy | (same) | Add-cluster submit | `FOOD_ORG:create` | ✅ |
| `PUT /clusters/:id`, `DELETE /clusters/:id` | Update/delete cluster (hard) | — | — | — | `FOOD_ORG:edit/delete` | ⚠️ No wrapper |
| `GET /food-users` | Food-role users | Settings → Users&Scopes; Organization → Unit Leads | (same) | Page load | `FOOD_ORG:view` | ✅ |
| `GET /scopes` | User scope grants | Settings → Users&Scopes; Organization → Unit Leads | (same) | Select a user | `FOOD_ORG:view` | ✅ |
| `POST /scopes` | Grant a scope | Settings → Users&Scopes; Organization → Unit Leads | (same) | Add-scope / Tag-property submit | `FOOD_ORG:edit` | ✅ |
| `DELETE /scopes/:id` | Revoke scope (hard) | Settings → Users&Scopes; Organization → Unit Leads | (same) | Remove / untag | `FOOD_ORG:delete` | ✅ |

### 1i. Delivery partners (legacy), menu-share, public

| API | Purpose | Frontend Screen | Navigation Path | Trigger | Role | Status |
|---|---|---|---|---|---|---|
| `GET/POST /delivery-partners`, `PUT/DELETE /delivery-partners/:id` | Legacy partner CRUD | — | — | — | GET auth-only; write `FOOD_SETTINGS:*` | ⚠️ Superseded by agencies |
| `GET /menu/full` | Full-day menu | — | — | — | auth-only | ⚠️ Not invoked |
| `POST /menu/share` | Share menu to guests | — | — | — | `FOOD_PLACE_ORDER:view` | ⚠️ Not invoked |
| `GET /menu/shared/:token` | Read shared menu (no PII) | Shared Menu page | `/m/:token` (public link) | Page load (raw `fetch`) | **none (public)** | 🌐 |

> **Recipes** (`/recipes`, `/kitchen`): `GET/POST/PUT/DELETE /api/recipes` — separate router, **not** `/food`.
> Uses generated OpenAPI hooks (`useGetRecipes`/`useCreateRecipe`/…). Gate `RECIPES`. Out of the `/food` scope but part of the Food nav group.

---

## 2. GROUPED BY FRONTEND PAGE

Each page's APIs, in the order they typically fire. `L→F→X` = Launcher → Food → X.

### Food Overview — `/food/dashboard` (`FOOD_DASHBOARD`) · L→F→Food Overview
- `GET /lookups` — load
- `GET /property-overview` — when property resolves
- `GET /orders` — load + day/property change; **polls 60s**
- `GET /next-orders` — load; **polls 300s**
- `GET /cutoffs` — load
- `GET /orders/:id` — meal-tab select
- `GET /order-preview` — order-day place panel
- `GET /order-draft` · `PUT /order-draft` (autosave) · `DELETE /order-draft` (after send)
- `POST /order-batches` — **Send order**
- `POST /orders/:id/confirm-delivery` — **Confirm delivery**
- `POST /orders/:id/waste` — **Save waste**
- `POST /orders/:id/cancel` — **Cancel order**

### All Orders — `/food/orders` (`FOOD_ALL_ORDERS`) · L→F→All Orders
- `GET /lookups` — load
- `GET /orders` — load + every filter/search change
- (Export CSV/PDF = client-side only; "Place Order"/row/Track = client navigation)

### Order Detail — `/food/orders/:id` (`FOOD_ALL_ORDERS`) · All Orders → row
- `GET /orders/:id` — load
- `POST /orders/:id/accept` — **Accept**
- `POST /orders/:id/reject` — **Reject order**
- `POST /orders/:id/cancel` — **Cancel order**
- `PUT /orders/:id` — **Save changes** (edit people/notes)

### Track an Order — `/food/track` (`FOOD_ALL_ORDERS`) · All Orders → row "Track" / deep link
- `GET /orders/track` — submit / pill / `?order=`
- `GET /orders` (active-order pills) — load
- `POST /orders/:id/cancel` — arm-twice cancel

### Dispatch — `/food/dispatch` (`FOOD_DISPATCH`) · L→F→Dispatch
- `GET /lookups`, `GET /kitchens`, `GET /dispatches/active-vehicles` — load
- `GET /orders?status=PREPARING` (Queue) + `GET /orders?status=DISPATCHED` (In transit) — load + filter
- `GET /dispatches` — Trips tab
- `POST /dispatches` — **Send it off** / **Create trip**
- `PATCH /dispatches/:id/status` — **Mark departed / Depart / Mark delivered / Mark partial**
- `GET /dispatches/:id` · `GET /dispatches/:id/events` — open trip sheet
- `PATCH /dispatches/:id/orders/:orderId` — per-order **Done**
- `POST /dispatches/:id/cancel` — **Cancel trip**

### Kitchen Summary — `/food/kitchen-summary` (`FOOD_KITCHEN_SUMMARY`) · L→F→Kitchen Summary
- `GET /lookups` — load
- `GET /kitchen-summary` — load + filter; **Refresh**
- `GET /orders?status=PLACED,ACCEPTED` — load + filter
- `POST /orders/:id/accept` — Accept / Start prep / Mark all preparing
- `POST /orders/:id/prepare` — Mark Preparing / Start prep / Mark all preparing

### Reports — `/food/reports` (`FOOD_REPORTS`) · L→F→Reports
- `GET /lookups`, `GET /reports`, `GET /analytics`, `GET /reports/on-time`, `GET /settings/ontime-tolerance` — load
- `GET /reports/variance-by-day` — meal-badge / period / property change
- `PUT /settings/ontime-tolerance` — tolerance **Save** (SUPER_ADMIN)
- `GET /reports/export.{fmt}` — **Download → report → format**

### Waste Analytics — `/food/waste-analytics` (`FOOD_REPORTS`) · L→F→Waste Analytics
- `GET /lookups`, `GET /cities` — load
- `GET /clusters?cityId=` — load + city change
- `GET /waste-analytics` — load + any filter/granularity change
- `GET /waste-analytics/export.{fmt}?widget=` — per-chart **Export**

### Settings — `/food/settings` (`FOOD_SETTINGS`) · L→F→Settings (all tabs mount on load)
- **page:** `GET /lookups`
- **Dishes:** `GET /dishes` (+search), `GET /brands`, `GET /ingredients`, `GET /dishes/:id` (edit), `POST/PUT/DELETE /dishes`
- **Ingredients:** `GET/POST/PUT/DELETE /ingredients`
- **Menu Rotation:** `GET /menu-rotation`, `GET /dishes`, `GET /kitchens`, `GET /brands`, `GET /menu-rotation/validate` (live), `GET /menu-rotation/auto-fill`, `POST /menu-rotation/bulk`, `PUT /menu-rotation/slot`, `DELETE /menu-rotation/:id`, `GET /menu-rotation/export.csv|.pdf`
- **Menu Rules:** `GET /composition-rules`, `GET /kitchens`, `GET /brands`, `POST/PUT/DELETE /composition-rules`
- **Portion Size Rules:** `GET /rules` (+filter), `GET /dishes`, `POST/PUT/DELETE /rules`
- **Agencies (local tab):** `GET /agencies`, agency/vehicle/location `POST/PUT/DELETE` (⚠ requires `FOOD_ORG` — see §3)
- **Kitchens:** `GET/POST/PUT/DELETE /kitchens`
- **Meal Types:** `GET /meal-config`, `PUT /meal-config/:mealType`
- **Cut-offs & Service:** `GET /cutoff-config`, `GET /brands`, `POST/PUT/DELETE /cutoff-config`; `GET /meal-windows` (+brand), `POST/PUT/DELETE /meal-windows`
- **Hierarchy:** `GET /zones`, `GET /cities`, `GET /clusters`; `POST /zones|/cities|/clusters`; `POST /properties/:id/assign-cluster`
- **Users & Scopes:** `GET /food-users`, `GET /scopes?userId=`, `GET /zones|/cities|/clusters`, `POST /scopes`, `DELETE /scopes/:id`
- **Food Defaults (SUPER_ADMIN):** `GET /system-config/food-defaults`, `PUT /system-config/food-defaults`

### Organization — `/food/organization` (`FOOD_ORG`) · L→F→Organization
- **Hierarchy:** `GET /hierarchy`, `GET /cities`, `GET /kitchens`, `GET /brands`; `POST /cities`, `POST /kitchens`, `PUT /kitchens/:id`; `POST /properties/:id/assign-brand` + `POST /properties/:id/assign-kitchen`
- **Brands:** `GET /brands?all=true`, `POST/PUT/DELETE /brands`
- **Agencies:** (imports the detailed `AgenciesTab` — see below)
- **Unit Leads:** `GET /food-users`, `GET /lookups`, `GET /scopes?userId=`, `POST /scopes` (tag), `DELETE /scopes/:id` (untag)

### Agencies console — `AgenciesTab` (rendered inside Organization → Agencies)
- `GET /agencies` (+search)
- `POST/PUT/DELETE /agencies`, active-toggle = `PUT /agencies/:id`
- On expand: `POST /agencies/:id/locations`, `PUT/DELETE /agency-locations/:id`
- On expand: `POST /agencies/:id/vehicles`, `PUT/DELETE /agency-vehicles/:id`
- On expand: `GET /kitchens`, `GET /agencies/:id/kitchens`, `PUT /agencies/:id/kitchens`

### Active Guests — `/food/guests` (`FOOD_DASHBOARD`) · deep link / CTA
- `GET /lookups`, `GET /property-overview` (when single property), `GET /guests` (+search/pagination), `GET /guests/export.{fmt}`

### My Properties — `/food/my-properties` (`FOOD_DASHBOARD`) · deep link
- `GET /my-properties` (all tile clicks are client navigation)

### Unit-Lead Home — `/home` (`FOOD_DASHBOARD`, legacy, no nav) · deep link
- `GET /lookups`, `GET /my-properties`, `GET /home-analytics`, `GET /revenue`

### Shared Menu — `/m/:token` (public, no auth) · public link
- `GET /menu/shared/:token` (raw `fetch`)

### Recipes — `/recipes` (`RECIPES`) · L→F→Recipes  *(not a `/food` API)*
- `GET /api/recipes` (+search/category), `POST/PUT/DELETE /api/recipes`

---

## 3. Detail per resource — params, responses, related calls

Common envelope: success `{ success:true, data:… }` (creates → **201**). Validation failure →
`400 { success:false, error:"Invalid request", details:<zod> }`. Unhandled → `500`. Bodies are
`.passthrough()` (extra keys ignored).

### Orders — place / lifecycle
- **`POST /order-batches`** — body `{ propertyId* , serviceDate* , meals*:[{mealType*, items?:[{dishId*, personsCount?, orderedQty*, unit?}], quantity?}], persons?|residentsCount?, notes? }`.
  Success `201 {batch, orders[]}`. Errors: `400` missing fields / bad date; `403` property not accessible; `422` unconfigured property; `422` cut-off (past date / closed / next-day-only); `409` all meals already ordered.
  Related: needs `GET /order-preview` (grid) & `GET /cutoffs` (deadline) first; on success fires `DELETE /order-draft`, then list refetch.
- **`PUT /orders/:id`** (editOrderPeople) — body `{ residentsCount*, notes? }`. `422` if status ∉ {PLACED,PREPARING,DISPATCHED}; `400` residentsCount ≤ 0. Items recomputed server-side (client qty ignored).
- **`POST /orders/:id/accept`** — empty body. `422 "Only PLACED orders can be accepted"`. Precedes `/prepare`.
- **`POST /orders/:id/reject`** — `{reason?}`. `422 "Only PLACED/ACCEPTED orders can be rejected"`.
- **`POST /orders/:id/prepare`** — empty. `422` unless ACCEPTED. Sets item preparedQty. Precedes dispatch.
- **`POST /orders/:id/cancel`** — `{reason?}`. `403` insufficient perms (inline); `422` if already dispatched+.
- **`POST /orders/:id/confirm-delivery`** — `{ items*:[{itemId*, receivedQty*}], remarks? }`. `422` unless DISPATCHED; `400` unknown item / receivedQty out of 0..orderedQty. Side effect: opens waste window + auto-creates a variance complaint on shortfall.
- **`POST /orders/:id/waste`** — `{ items*:[{itemId*, wastedQty*}] }`. `422` unless DELIVERED and waste window open; `400` wastedQty out of 0..cap. Related: `confirm-delivery` must run first (it opens the window).
- **`GET /orders`** — query (all optional): `status` (single/CSV), `from`, `to`, `serviceDate`(yyyy-MM-dd), `propertyId`, `brand`, `mealType`, `search`, `page`, `limit`. Non-`FOOD_ALL_ORDERS` callers are clamped to PLACED/ACCEPTED/PREPARING/DISPATCHED.
- **`GET /orders/track`** — `?orderNumber=`(=term); `400` blank; `404` not found; `403` not accessible.

### Dispatch (trips)
- **`POST /dispatches`** — body `{ orderIds*, agencyId*(or deliveryPartnerId), vehicleId?, vehicleNumber?, kitchenId?, driverName?, driverPhone?, etaMinutes?, departNow? }`. `400` no orders / no agency; `422` vehicle-not-in-agency / vehicle-in-use / no-PREPARING-orders / **multi-kitchen** / agency-doesn't-serve-kitchen. Success `201 {…trip, dispatchedCount}`; orders → DISPATCHED. Related: reads `GET /orders?status=PREPARING`, `GET /kitchens`, `GET /dispatches/active-vehicles`, `GET /lookups` (agencies).
- **`PATCH /dispatches/:id/status`** — `{status*, note?}`. `400` invalid status; `422` illegal transition (`LOADING→DELIVERED` etc.). Reaching DELIVERED cascades linked orders → DELIVERED (+opens waste windows).
- **`PATCH /dispatches/:id/orders/:orderId`** — `{delivered*, remarks?, markTripDelivered?}`. `404` order-not-on-trip; `422` cancelled/rejected order. `markTripDelivered:true` → trip DELIVERED (all) or PARTIAL (some).
- **`POST /dispatches/:id/cancel`** — `{reason?}`. `422` if trip terminal. Reverts DISPATCHED orders → PREPARING; returns `revertedCount`.

### Masters — CRUD families (shared shapes)
Each family: `GET` (list, auth-only, filters as noted) · `GET/:id` (detail, dishes only) · `POST`
(create, `FOOD_SETTINGS:create`) · `PUT/:id` (edit) · `DELETE/:id`. Success `201`/`200 {data}`.
- **Dishes** — create `{name*, component*, unit*, brands?[], preparations?[], photoUrl?, isActive?, ingredients?[]}`; `400 "name, component, unit required"`; preparations sanitized to VEG/NON_VEG/JAIN; soft delete.
- **Ingredients** — `{name*, unit*, isActive?}`; `400 "name and unit required"`; soft delete.
- **Menu rotation** — `POST /bulk {kitchenId*, brand*, mealType*, dayOfWeek*, rotationWeek?, items*:[{dishId*, slotLabel?, sortOrder?}]}` (`400 "No valid items"` if none); `PUT /slot` replaces a slot preserving seasonal windows; `DELETE/:id` is **hard**.
- **Composition rules** — `{brand*, mealType*, kitchenId?, name?, slots?:[{slotLabel?, component?, preparation?, minCount?, maxCount?, sortOrder?}]}`; `400 "brand and mealType required"`; PUT replaces all slots; hard delete.
- **Portion rules** — `{brand*, mealType*, dishId*, qtyPerResident*, unit*, isActive?}`; `400` missing; **`409` duplicate** (brand+meal+dish); hard delete.
- **Kitchens** — `{name*, code*, brand?, address?, city?, state?, pincode?, contact*?, cityId?, clusterId?}`; `400 "name and code required"`; `code` UNIQUE; soft delete.
- **Brands** — `{code*, name*, isActive?}`; `400 "code and name required"`; code normalized UPPER/`_`; **`409` duplicate code**; soft delete.
- **Meal config** — `PUT/:mealType {displayLabel?, sortOrder?, isEnabled?}`; `404` unknown mealType.
- **Meal windows** — `{brand*, mealType*, propertyId?, serviceTime?, leadTimeMinutes?, cutoffTime?(deprecated), isActive?}`; `400 "brand and mealType required"`; **hard delete, no 404**.
- **Cut-off config** — `{brand*, cutoffTime*, propertyId?, isActive?}`; `400` missing; **`409` duplicate** brand+property; hard delete.
- **Food defaults** — `PUT {defaultCutoff?, wasteWindowMinutes?}` (SUPER_ADMIN); `400` bad HH:MM / non-positive / nothing to update.
- **On-time tolerance** — `PUT {minutes*}` (SUPER_ADMIN); `400` if not int 0–240.

### Organization
- **Agencies / locations / vehicles** — agency `{name*, phone?, contactName?, email?, isActive?}` (`400 "name required"`, soft delete); location `{name*, address?, city?, state?, pincode?, contact*?}` (hard delete); vehicle `{vehicleNumber*, vehicleType?, locationId?, isActive?}` (default VAN, hard delete).
- **`PUT /agencies/:id/kitchens`** — `{kitchenIds*}` replaces the whole set (deduped). `404` if agency missing.
- **Zones/Cities/Clusters** — zone `{name*, code?}`; city `{name*, zoneId?}`; cluster `{name*, cityId*, managerId?}`. All `400 "name…required"`; POST creates; PUT/DELETE are **hard** but have **no UI wrapper**.
- **Scopes** — `POST {userId*, scopeLevel*, zoneId?/cityId?/kitchenId?/clusterId?/propertyId?}`. `400` missing / missing level-field; `403` self-grant; `403` GLOBAL by non-super. `DELETE/:id` hard.
- **Assign** — `assign-brand {brand|null}`, `assign-kitchen {kitchenId|null}` (`FOOD_SETTINGS:edit`); `assign-cluster {clusterId}` (`FOOD_ORG:edit`, `404` if property missing).

### Reports & exports
- **Reads** — `GET /reports`, `/analytics`, `/reports/on-time`, `/reports/variance-by-day` (`?mealType` → `400 "Invalid mealType"`), `/waste-analytics` (filters `from,to,propertyId,clusterId,cityId,brand,granularity`). Scoped: `?propertyId` not accessible → `403`.
- **Exports** — `/reports/export.{csv,pdf,xls}` (`?report=orders|variance|waste|ontime`), `/waste-analytics/export.{csv,xlsx,pdf}` (`?widget=property|dish|mealtype|menu|trend`), `/guests/export.{csv,pdf,xls}`, `/menu-rotation/export.{csv,pdf}`. Bad fmt/widget/report → `400`. Streamed as file attachments via `apiDownload`.

---

## 4. Testing caveats & gotchas

1. **Permission mismatch — Settings → Agencies tab.** The local Agencies tab inside **Settings** calls the `GET/POST/... /agencies` endpoints, which are gated `FOOD_ORG`. `FNB_MANAGER` has `FOOD_SETTINGS` but **not** `FOOD_ORG`, so that tab's calls should **403** for them even though the tab renders. Verify.
2. **⚠️ endpoints have no UI path** — test them only via curl/Postman: `GET /dashboard`, `GET /waste-pending`, single `POST /orders`, `POST /orders/dispatch/bulk`, single `POST /orders/:id/dispatch`, `GET /menu-rotation/resolve`, single `POST /menu-rotation`, `PUT /menu-rotation/:id`, `GET /kitchens/:id/agencies`, `GET /menu/full`, `POST /menu/share`, `GET /reports/variance`, all `/delivery-partners`, and PUT/DELETE for `/zones|/cities|/clusters`.
3. **No client-side write guards on Dispatch** — VIEW-only roles (CLUSTER_MANAGER/CITY_HEAD/ZONAL_HEAD/SVP) see the buttons; the server returns `403`, surfaced as an error toast. Confirm it isn't a silent success.
4. **Dashboard polls** — `GET /orders` every 60 s, `GET /next-orders` every 300 s. Expect background refetches while idle on Food Overview.
5. **Exports are GET file streams** — open dev-tools Network to confirm the `.csv/.pdf/.xls/.xlsx` request and attachment; the response is not JSON.
6. **Two export route families** — `food.ts` owns `/reports/export.csv|.pdf` (orders only, ignores `report`); `food-ops.ts` owns `/reports/export.:fmt` + `.xls` (honors `report`). Since food.ts mounts first, a CSV export with `report=variance` may still return **orders** — worth a targeted test.
7. **All Settings/Organization tabs mount eagerly** — every tab's `GET` fires on page load, not on tab click. When testing "does opening tab X call Y", watch the initial burst.
8. **`serviceDate` is IST-day-anchored** — order dedup, drafts, and Kitchen Summary group by 00:00 IST; test around midnight boundaries.
