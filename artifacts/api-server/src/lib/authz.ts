/**
 * Shared authorization helpers used by route handlers on top of the RBAC
 * `authorize(module, perm)` middleware:
 *
 *  - pick()                 — allow-list a request body (anti mass-assignment)
 *  - isPropertyScoped()     — is THIS user limited to a single property?
 *  - scopedPropertyId()     — that property id, or null (= unrestricted)
 *  - assertPropertyAccess() — 403 if a scoped user reaches outside their property
 *  - forbidden()/badRequest() — typed errors the central error handler renders
 *
 * Object-level scoping policy (deliberately conservative): only roles that are
 * genuinely bound to one property/site (e.g. WARDEN, UNIT_LEAD) are filtered to
 * their own propertyId. Org-wide roles (SUPER_ADMIN, OPERATIONS_MANAGER, FINANCE,
 * AUDIT_READONLY, regional/cluster heads, …) are unrestricted, so adding scoping
 * never changes what those roles already see.
 */
import type { Request } from "express";

/** Roles that operate across ALL properties — never row-filtered by propertyId. */
const ORG_WIDE_ROLES = new Set<string>([
  "SUPER_ADMIN",
  "AUDIT_READONLY",
  "OPERATIONS_MANAGER",
  "FINANCE",
  "HR_MANAGER",
  "PROCUREMENT_MANAGER",
  "KITCHEN_MANAGER",
  "PROJECTS_MANAGER",
  "PROPERTY_ACQUISITION",
  "SALES_EXECUTIVE",
  // Food org/regional roles manage many properties; the food module does its own
  // hierarchy-based scoping, so treat them as org-wide for the generic helper.
  "OPS_EXCELLENCE",
  "SENIOR_VICE_PRESIDENT",
  "CLUSTER_MANAGER",
  "CITY_HEAD",
  "ZONAL_HEAD",
  "FNB_SUPERVISOR",
  "FNB_MANAGER",
  "FNB_ZONAL_HEAD",
]);

export interface HttpError extends Error {
  statusCode: number;
  details?: unknown;
}

export function httpError(statusCode: number, message: string, details?: unknown): HttpError {
  const e = new Error(message) as HttpError;
  e.statusCode = statusCode;
  if (details !== undefined) e.details = details;
  return e;
}

export const forbidden = (msg = "Forbidden") => httpError(403, msg);
export const badRequest = (msg = "Bad request", details?: unknown) => httpError(400, msg, details);

/** True when the caller is bound to a single property (e.g. WARDEN / UNIT_LEAD). */
export function isPropertyScoped(req: Request): boolean {
  const role = req.user?.role;
  return !!role && !ORG_WIDE_ROLES.has(role) && !!req.user?.propertyId;
}

/** The property a scoped caller is limited to, or null when unrestricted. */
export function scopedPropertyId(req: Request): string | null {
  return isPropertyScoped(req) ? req.user?.propertyId ?? null : null;
}

/**
 * Throw 403 if a property-scoped caller targets a property that isn't theirs.
 * A no-op for org-wide roles. Pass the propertyId the request is acting on.
 */
export function assertPropertyAccess(req: Request, propertyId: string | null | undefined): void {
  const scope = scopedPropertyId(req);
  if (scope && propertyId && propertyId !== scope) {
    throw forbidden("Outside your property scope");
  }
}

/**
 * Allow-list a body object to a fixed set of keys. Undefined values are dropped
 * so callers can't blank out columns by omission semantics. Use everywhere a
 * handler previously spread `...req.body` or iterated arbitrary keys into a DB
 * insert/update, to block privilege/field escalation (role, balance, id, …).
 */
// Returns/accepts `any` on purpose: callers pass the untyped Express req.body and
// spread the result straight into drizzle .values()/.set(), which needs
// column-compatible types. A generic Partial<T> resolves to an all-optional shape
// that fails drizzle's required-field overload — so we mirror the original
// `...req.body` (any) behavior while still restricting to the allow-listed keys.
export function pick(body: any, keys: readonly string[]): any {
  const out: Record<string, any> = {};
  if (!body || typeof body !== "object") return out;
  for (const k of keys) {
    const v = body[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}
