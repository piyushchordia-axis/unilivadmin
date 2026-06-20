/**
 * Centralised, fail-closed environment/config.
 *
 * Security-sensitive behaviour must NOT silently fall back to insecure defaults.
 * Historically a missing NODE_ENV (see git history) flipped several security
 * switches at once — secure-cookie flag, dev-OTP leakage, master OTP. This module
 * makes the rules explicit and validates required secrets at boot so the process
 * fails loudly rather than booting in an insecure state.
 *
 * Rules:
 *  - NODE_ENV === "development"  → relaxed (local dev): a dev session secret is
 *    allowed, cookies are not forced Secure.
 *  - anything else (incl. unset) → treated as NOT-development for SECRET strength
 *    (fail closed): a strong SESSION_SECRET is REQUIRED or the process throws.
 *  - Secure cookies / HSTS are keyed off explicit production (NODE_ENV=production)
 *    OR an explicit COOKIE_SECURE override, so http staging still works.
 */
const NODE_ENV = process.env["NODE_ENV"] ?? "";

export const IS_DEVELOPMENT = NODE_ENV === "development";
export const IS_PRODUCTION = NODE_ENV === "production";
/** True in production OR when NODE_ENV is unset/unknown — used to fail closed. */
export const ENFORCE_PROD_SECURITY = !IS_DEVELOPMENT;

/** Known placeholder/weak values that must never be accepted as a real secret. */
const WEAK_SECRETS = new Set([
  "",
  "uniliv-secret",
  "secret",
  "changeme",
  "change_me",
  "CHANGE_ME_TO_A_LONG_RANDOM_STRING",
  "dev-insecure-session-secret-change-me",
]);

const DEV_FALLBACK_SECRET = "dev-insecure-session-secret-change-me";

function resolveSessionSecret(): string {
  const raw = (process.env["SESSION_SECRET"] ?? "").trim();
  const weak = WEAK_SECRETS.has(raw) || raw.length < 32;
  if (ENFORCE_PROD_SECURITY) {
    if (weak) {
      throw new Error(
        "FATAL: SESSION_SECRET is missing or weak. Set a strong (>= 32 char) random " +
          "value before starting in production. Generate one with: openssl rand -hex 48",
      );
    }
    return raw;
  }
  // development only
  if (weak) {
    // eslint-disable-next-line no-console
    console.warn(
      "[config] SESSION_SECRET is unset/weak — using an INSECURE development default. " +
        "This is only allowed when NODE_ENV=development.",
    );
    return DEV_FALLBACK_SECRET;
  }
  return raw;
}

export const SESSION_SECRET = resolveSessionSecret();

/** Send the Secure flag on cookies (HTTPS only). Defaults to explicit production. */
export const COOKIE_SECURE =
  process.env["COOKIE_SECURE"] != null
    ? process.env["COOKIE_SECURE"] === "true"
    : IS_PRODUCTION;

/** JWT issuer/audience — pins tokens to this app so foreign JWTs can't be replayed. */
export const JWT_ISSUER = process.env["JWT_ISSUER"] || "uniliv-api";
export const JWT_AUDIENCE = process.env["JWT_AUDIENCE"] || "uniliv-admin";

/**
 * Allowed browser origins for CORS. Comma-separated CORS_ORIGINS wins; otherwise
 * APP_BASE_URL is used. Empty list + production = same-origin only (no CORS).
 * In development we fall back to reflecting the request origin for convenience.
 */
export const CORS_ORIGINS: string[] = (() => {
  const explicit = (process.env["CORS_ORIGINS"] || "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (explicit.length) return explicit;
  const appBase = (process.env["APP_BASE_URL"] || "").trim().replace(/\/+$/, "");
  return appBase ? [appBase] : [];
})();

/** Max request body size (mitigates memory-exhaustion DoS). */
export const BODY_LIMIT = process.env["BODY_LIMIT"] || "1mb";

/**
 * Whether THIS process runs the in-process cron-like schedulers (SLA checks,
 * billing cycles, reminders). Set to "false" on all-but-one instance when scaling
 * horizontally so jobs don't double-fire. Defaults on.
 */
export const RUN_SCHEDULERS = (process.env["RUN_SCHEDULERS"] ?? "true") !== "false";
