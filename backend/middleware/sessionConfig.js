/**
 * Session middleware + store selection.
 *
 * Three store options, picked at module load time from env vars:
 *
 *   REDIS_URL       → connect-redis (preferred for high concurrency)
 *   SESSION_DB_URL  → connect-pg-simple (uses the table created by
 *                     backend/migrations/16_session_store.sql)
 *   neither         → express-session's default MemoryStore
 *                     - In production, validateEnv() refuses to boot
 *                       (see config/env.js tier-2 check).
 *                     - In dev, MemoryStore is fine — sessions die on
 *                       restart but local work isn't gated on Redis.
 *
 * 6.3 also lands here: the previous fallback string for SESSION_SECRET
 * (`process.env.SESSION_SECRET || "math_collective_secret_2026"`) is
 * gone. Env validation already rejects boot without a 16+ char
 * SESSION_SECRET, so the literal-string fallback was dead code that
 * masked misconfiguration.
 */

import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { RedisStore } from "connect-redis";
import { createClient } from "redis";
import { logger } from "../config/logger.js";

const oneWeekMs = 1000 * 60 * 60 * 24 * 7;

/**
 * Pure: pick the store TYPE from env vars without constructing anything.
 * Returns "redis" | "postgres" | "memory", or throws if production has
 * no real store configured. Testable without side effects.
 */
export function selectSessionStoreType(env = process.env) {
  if (env.REDIS_URL)      return "redis";
  if (env.SESSION_DB_URL) return "postgres";
  if (env.NODE_ENV === "production") {
    // env validator should have caught this already; throw is the
    // belt-and-suspenders path so a misconfigured deploy fails loud.
    throw new Error(
      "Session store missing in production: set REDIS_URL or SESSION_DB_URL. " +
      "Refusing to use MemoryStore — sessions would die on every restart."
    );
  }
  return "memory";
}

/**
 * Constructs a store instance. Side-effectful (opens a Redis connection
 * or wires a PG pool). Kept separate from selectSessionStoreType so the
 * selection logic can be unit-tested without spinning up real backends.
 *
 * Returns a Store or `undefined` (the latter tells express-session to
 * use its built-in MemoryStore + emit its own warning).
 */
export function buildSessionStore(env = process.env) {
  const type = selectSessionStoreType(env);

  if (type === "redis") {
    const client = createClient({ url: env.REDIS_URL });
    client.on("error", (err) => logger.error({ err }, "session: redis client error"));
    client.connect().catch((err) =>
      logger.error({ err }, "session: redis initial connect failed")
    );
    logger.info("[session] using Redis store");
    return new RedisStore({ client, prefix: "sess:" });
  }

  if (type === "postgres") {
    const ConnectPgSimple = connectPgSimple(session);
    // Supabase requires SSL; rejectUnauthorized:false matches what
    // verify-multitenant.js uses for the same connection string.
    const store = new ConnectPgSimple({
      conString: env.SESSION_DB_URL,
      tableName: "user_sessions",                // matches migration 16
      createTableIfMissing: false,               // migration owns the schema
      pruneSessionInterval: 60 * 15,             // every 15 min, drop expired rows
      ssl: { rejectUnauthorized: false },
    });
    store.on("error", (err) => logger.error({ err }, "session: pg store error"));
    logger.info("[session] using Postgres store (table: user_sessions)");
    return store;
  }

  // memory
  logger.warn(
    "[session] using MemoryStore (dev only — sessions lost on every restart, " +
    "set SESSION_DB_URL to use the Postgres-backed store)"
  );
  return undefined;
}

const isProd = process.env.NODE_ENV === "production";

export const sessionMiddleware = session({
  store:             buildSessionStore(),
  secret:            process.env.SESSION_SECRET,   // env validation guarantees this is set + min 16 chars
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure:   isProd,                              // HTTPS only in production
    sameSite: isProd ? "strict" : "lax",           // first line of CSRF defence; phase 7 adds tokens
    maxAge:   oneWeekMs,
  },
});

export default sessionMiddleware;
