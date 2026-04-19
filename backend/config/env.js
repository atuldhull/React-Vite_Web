/**
 * Centralised env-var validation. Called once at server boot.
 *
 * Three tiers:
 *
 *   REQUIRED — without these the app cannot serve any traffic
 *              (Supabase keys, session secret). Missing these in
 *              production makes the process exit immediately with a
 *              clear list. Missing in dev still exits because the
 *              app would crash on first DB hit anyway.
 *
 *   PRODUCTION_REQUIRED — must be set when NODE_ENV=production but
 *              are optional in dev (FRONTEND_URL for CORS lockdown).
 *              Missing these in dev is fine; missing in prod exits.
 *
 *   FEATURE_GATED — optional everywhere. Their absence disables a
 *              feature gracefully (Razorpay payments, VAPID push
 *              notifications, OpenRouter AI bot, contact email).
 *              Logged at boot so an operator knows which features
 *              are off, but never fatal.
 *
 * The point is to fail FAST and LOUD when configuration is wrong —
 * the previous behaviour was to surface misconfig as cryptic Supabase
 * errors on the first DB hit, sometimes minutes after boot, when a
 * user finally tried to do something. That's hours of debugging
 * traded for one boot-time error message.
 */

import { z } from "zod";

const REQUIRED_SCHEMA = z.object({
  SUPABASE_URL:              z.string().url("must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, "looks too short — copy from Supabase dashboard"),
  SESSION_SECRET:            z.string().min(16, "must be at least 16 chars; generate with `openssl rand -hex 32`"),
});

const PRODUCTION_REQUIRED_SCHEMA = z.object({
  FRONTEND_URL: z.string().url("must be the deployed frontend origin, e.g. https://mathcollective.bmsit.in"),
  // At least ONE of these must be set in production so we have a real
  // session store (express-session's MemoryStore loses sessions on
  // restart and can't scale horizontally). Validated below in
  // validateEnv() rather than via Zod because the constraint is
  // "at least one of A or B", which Zod expresses awkwardly.
  // SESSION_DB_URL — a Postgres connection string (e.g. Supabase Direct URL)
  // REDIS_URL      — a Redis connection string
});

const FEATURE_GATES = [
  {
    feature:    "Razorpay payments",
    vars:       ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"],
    optionalAlongsideRequired: ["RAZORPAY_WEBHOOK_SECRET"],
    docs:       "docs/PAYMENT_SETUP.md",
  },
  {
    feature:    "Web push notifications",
    vars:       ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"],
    optionalAlongsideRequired: ["VAPID_CONTACT"],
    docs:       "docs/PWA_AND_PUSH.md",
  },
  {
    feature:    "PANDA AI bot (Gemini primary)",
    vars:       ["GEMINI_API_KEY"],
    optionalAlongsideRequired: [],
    docs:       "Get a free key from https://aistudio.google.com/apikey",
  },
  {
    feature:    "PANDA AI bot (OpenRouter fallback)",
    vars:       ["OPENROUTER_API_KEY"],
    optionalAlongsideRequired: [],
    docs:       "Fallback when Gemini is rate-limited/down; optional if GEMINI_API_KEY is set",
  },
  {
    feature:    "Contact form email + invoices",
    vars:       ["CONTACT_EMAIL", "CONTACT_APP_PASSWORD"],
    optionalAlongsideRequired: [],
    docs:       "Gmail app password — see Google account settings",
  },
  {
    feature:    "Sentry error reporting",
    vars:       ["SENTRY_DSN"],
    optionalAlongsideRequired: [],
    docs:       "docs/RUNBOOK_MONITORING.md",
  },
];

/**
 * Validates env, prints warnings for optional features, exits if
 * anything required is missing.
 *
 * @returns {{
 *   isProd:           boolean,
 *   port:             number,
 *   enabledFeatures:  string[],   // human-readable list of features that are on
 *   disabledFeatures: string[],   // and the ones that are off (with reason)
 * }}
 */
export function validateEnv() {
  const isProd = process.env.NODE_ENV === "production";
  const errors = [];

  // ── Tier 1: required everywhere ──
  const required = REQUIRED_SCHEMA.safeParse(process.env);
  if (!required.success) {
    for (const issue of required.error.issues) {
      errors.push(`  ${issue.path.join(".")}: ${issue.message}`);
    }
  }

  // ── Tier 2: required in production only ──
  if (isProd) {
    const prodOnly = PRODUCTION_REQUIRED_SCHEMA.safeParse(process.env);
    if (!prodOnly.success) {
      for (const issue of prodOnly.error.issues) {
        errors.push(`  ${issue.path.join(".")}: ${issue.message} (required in production)`);
      }
    }
    // "At least one of" — kept out of the Zod schema because the
    // built-in expressions for it are awkward and the operator-facing
    // message is much clearer when we hand-write it.
    if (!process.env.SESSION_DB_URL && !process.env.REDIS_URL) {
      errors.push(
        "  SESSION_DB_URL or REDIS_URL: must set at least one in production " +
        "(MemoryStore loses sessions on restart and can't scale — see " +
        "backend/migrations/16_session_store.sql for Postgres setup)"
      );
    }
  }

  // Fail fast if any tier-1/2 errors. Print the full list — partial
  // info is more frustrating than no info.
  if (errors.length > 0) {
    const banner = isProd
      ? "[env] PRODUCTION refuses to start with missing/invalid configuration:"
      : "[env] Cannot start — missing/invalid env vars:";
    console.error("\n" + banner + "\n");
    for (const e of errors) console.error(e);
    console.error("\nFix .env.local (or your deploy platform's env settings) and retry.\n");
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  }

  // ── Tier 3: feature gates — warn but never fatal ──
  const enabled = [];
  const disabled = [];
  for (const gate of FEATURE_GATES) {
    const missing = gate.vars.filter((v) => !process.env[v]);
    if (missing.length === 0) {
      enabled.push(gate.feature);
    } else {
      disabled.push({ feature: gate.feature, missing, docs: gate.docs });
    }
  }

  if (disabled.length > 0) {
    console.warn("\n[env] Some features are disabled because their env vars aren't set:\n");
    for (const d of disabled) {
      console.warn(`  - ${d.feature}: missing ${d.missing.join(", ")}  (${d.docs})`);
    }
    console.warn("");
  }

  return {
    isProd,
    port:             Number(process.env.PORT) || 3000,
    enabledFeatures:  enabled,
    disabledFeatures: disabled.map((d) => d.feature),
  };
}
