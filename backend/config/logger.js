/**
 * Centralised structured logger (pino).
 *
 * Two transport profiles:
 *
 *   - production:  raw JSON to stdout. One line per event, easy for
 *                  log aggregators (Datadog, Loki, CloudWatch) to
 *                  parse without preprocessing. Includes a `pid`,
 *                  `hostname`, ISO-8601 timestamp, and the standard
 *                  `level`/`msg` fields by default.
 *
 *   - development: pino-pretty for human-readable colourised output
 *                  with sensible time formatting. Loaded lazily so
 *                  pino-pretty stays a devDependency and isn't
 *                  required in the production install.
 *
 * Request-id propagation:
 *
 *   The `requestIdMiddleware` (mounted FIRST in app.js) stores the
 *   current request's id in AsyncLocalStorage. We hook into pino's
 *   `mixin` callback to read that store on every log event and
 *   automatically attach `requestId` to the JSON line — without each
 *   call site having to do anything. So `logger.info("user signed in")`
 *   inside a controller produces:
 *
 *     { "level":30, "time":..., "requestId":"abc-...", "msg":"user signed in" }
 *
 *   Outside an HTTP request (cron jobs, background workers, server
 *   startup), `requestId` is simply omitted — never an undefined leak.
 *
 * Redaction:
 *
 *   `redact.paths` below scrubs known-sensitive fields from every log
 *   event before it leaves the process. The censor token is
 *   "[REDACTED]" — verbose enough to stand out in greps. Paths are
 *   intentionally case-sensitive: Node normalises HTTP headers to
 *   lowercase, but axios error.config.headers keeps the original
 *   case, so we list both common variants.
 *
 *   Pinned by tests/unit/logger-redaction.test.js — any new field
 *   added to the secret-shape set should be added there too.
 *
 * Migration policy:
 *
 *   This module is the public surface. Existing `console.error` /
 *   `console.warn` call sites can be migrated incrementally; the
 *   biggest wins are the global error handler (already swapped) and
 *   any controller that handles money or auth flows. The boot banner
 *   in server.js stays on console.log on purpose — it's a one-shot
 *   operator-facing message, not structured event data.
 */

import pino from "pino";
import { currentRequestId } from "../middleware/requestId.js";

const isProd = process.env.NODE_ENV === "production";

// In tests we want silent logs by default so vitest output stays
// readable; let LOG_LEVEL override (e.g. when debugging a specific test).
const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
const level = process.env.LOG_LEVEL || (isTest ? "silent" : isProd ? "info" : "debug");

/* Redaction paths — exported so tests can pin the contract, and so a
   future audit can see at a glance what's protected without having to
   read the logger constructor. Each path is one of pino-redact's
   supported shapes (dot-path or bracketed) and is exact-match: pino
   does NOT auto-traverse, so we enumerate the common containers
   ({ body }, { req }, { err }, { session.user }, {}, ...) explicitly. */
export const REDACT_PATHS = [
  // ── HTTP headers ────────────────────────────────────────────
  // Node lowercases req.headers, but axios err.config.headers keeps
  // the original case → list both.
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-auth-token"]',
  'req.headers["x-razorpay-signature"]',
  'res.headers["set-cookie"]',
  // axios error envelopes carry the request that triggered them.
  'err.config.headers.Authorization',
  'err.config.headers.authorization',
  'err.config.headers.Cookie',
  'err.config.headers.cookie',
  'err.config.data',                // axios stuffs request body here
  'err.request.headers.authorization',
  'err.response.data.access_token',
  'err.response.data.refresh_token',
  'err.response.data.session',

  // ── Body fields under { body } container ─────────────────────
  'body.password',
  'body.currentPassword',
  'body.newPassword',
  'body.access_token',
  'body.refresh_token',
  'body.token',
  'body.download_token',
  'body.invite_token',
  'body.publicKey',
  'body.encryptedContent',
  'body.iv',
  'body.razorpay_signature',
  'body.razorpay_payment_id',
  'body.razorpay_order_id',

  // ── Top-level fields (for ad-hoc { token } / { password } logs) ─
  'password',
  'currentPassword',
  'newPassword',
  'access_token',
  'refresh_token',
  'token',
  'download_token',
  'publicKey',
  'encryptedContent',
  'razorpay_signature',
  'razorpay_payment_id',
  'razorpay_order_id',

  // ── Session user surface — log only the user_id, never the email
  // (PII) or the full row.
  'session.user.email',
  'session.user',                   // err logs sometimes include the whole row
];

export const logger = pino({
  level,
  // Always attach requestId (when available) without callers caring.
  mixin() {
    const id = currentRequestId();
    return id ? { requestId: id } : {};
  },
  redact: {
    paths:  REDACT_PATHS,
    censor: '[REDACTED]',
    remove: false,                   // keep the key — easier to grep "[REDACTED]"
  },
  // Pretty-print only in dev so production stays parseable JSON. The
  // import is dynamic-by-name (pino-pretty discovered via require)
  // because this module otherwise loads in test/prod where pretty
  // isn't installed.
  ...(isProd || isTest ? {} : {
    transport: {
      target: "pino-pretty",
      options: {
        colorize:    true,
        translateTime: "HH:MM:ss.l",
        ignore:      "pid,hostname",
      },
    },
  }),
});

/**
 * Convenience: produce a child logger with extra static fields (e.g.
 * { module: "paymentWebhook" }) so module-level log lines are tagged
 * without each call having to pass that field.
 */
export function childLogger(bindings) {
  return logger.child(bindings);
}

export default logger;
