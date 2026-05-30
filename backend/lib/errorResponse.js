/**
 * Per-controller 500-response helper.
 *
 * Most controllers historically caught their errors with:
 *
 *     res.status(500).json({ error: err.message });
 *
 * That pattern leaks server internals — Supabase column names, PG
 * error codes, stack-trace fragments, sometimes connection strings —
 * straight to a browser tab. The global error handler in app.js
 * already scrubs this for UNCAUGHT errors, but the per-controller
 * catches go around it.
 *
 * sendInternalError():
 *   - In production: returns the same constant payload the global
 *     handler uses — { error: "Internal server error", requestId }.
 *   - In development: passes the real err.message through so a dev
 *     poking at curl can debug.
 *   - ALWAYS logs the real err with the controller-supplied label
 *     and the request id, so an operator can grep for the failing
 *     site even when the wire response is scrubbed.
 *
 * The label is a short human string ("send message", "list ideas")
 * that ends up in the log line — far easier to triage than 60 calls
 * all logging "internal error".
 *
 * Why a helper and not a global wrapper:
 *   - Replacing the catch blocks in-place is reviewable. A try/catch
 *     wrapper would have to know whether the controller already sent
 *     a partial response, which differs per route.
 *   - Some controllers map specific error codes (PostgREST 42P01,
 *     Razorpay billing) to non-500 responses before reaching the
 *     "internal" path; the helper plays nice with that.
 */

import { logger } from "../config/logger.js";

const isProd = () => process.env.NODE_ENV === "production";

/**
 * Send a generic 500 with the err.message stripped in production.
 *
 * @param {import("express").Response} res
 * @param {unknown} err   The error caught upstream.
 * @param {string} [label]  Human-readable label for the failing op
 *                          (e.g. "send message", "fetch billing history").
 *                          Surfaces in logs, never on the wire.
 *                          Defaults to the request method+url so logs
 *                          always have at least the route as context.
 * @param {object} [extra]  Additional context to log (userId, route IDs).
 */
export function sendInternalError(res, err, label, extra = {}) {
  const req = res?.req;
  const resolvedLabel = label || `internal error: ${req?.method || "?"} ${req?.originalUrl || "?"}`;
  const requestId = req?.id ?? null;
  // Sentry / pino pick up the structured fields. Stringify safety:
  // pino handles Error instances natively, so pass `err` through raw.
  logger.error({ err, requestId, ...extra }, resolvedLabel);

  // Headers may already be sent if the caller did res.json() before
  // the catch (mostly happens during streaming). Be defensive — the
  // log is the more important record in that case.
  if (res.headersSent) return;

  const payload = { error: "Internal server error", requestId };
  if (!isProd()) {
    // Dev convenience: include the raw message so curl debugging is
    // not blind. Production strips this so a browser tab never sees
    // "duplicate key value violates unique constraint students_email_key".
    payload.detail = err?.message || String(err);
  }
  res.status(500).json(payload);
}
