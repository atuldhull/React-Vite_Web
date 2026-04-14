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

export const logger = pino({
  level,
  // Always attach requestId (when available) without callers caring.
  mixin() {
    const id = currentRequestId();
    return id ? { requestId: id } : {};
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
