/**
 * Idempotency-Key middleware.
 *
 * Wrap a state-changing route to make safe-to-retry. The convention
 * is the same as Stripe's:
 *
 *   POST /api/payment/create-order
 *   Idempotency-Key: <client-supplied unique id>
 *
 *   First request   → handler runs; response is cached against the
 *                      key for 24h.
 *   Second request  → handler is SKIPPED; the cached response (same
 *   (same key)        status + body) is returned immediately.
 *
 * Cache: backend/migrations/18_idempotency_keys.sql (Postgres table
 * keyed on (key, scope, org_id)). Survives restarts and works
 * across replicas.
 *
 * USAGE
 *   import { idempotencyMiddleware } from "../middleware/idempotency.js";
 *   router.post("/create-order", requireAdmin, idempotencyMiddleware(), createOrder);
 *
 * BEHAVIOUR DETAILS
 *   - No `Idempotency-Key` header → middleware passes through
 *     untouched. The endpoint stays "best effort" for clients who
 *     don't opt in. (We don't FORCE callers to send keys because
 *     legacy clients exist.)
 *   - Key without an org context (e.g. unauthenticated route) → the
 *     middleware passes through. Org scoping is required for the
 *     cache row, and pre-session routes don't have it. Any
 *     idempotency-needing endpoint should be admin-gated anyway.
 *   - Cached response is replayed with the SAME status code as the
 *     original — including 4xx errors. A 404 on the first call
 *     stays a 404 on the retry; the client retried unsuccessfully
 *     once and gets the same answer instantly.
 *   - The cache write happens on res.on("finish") — it's
 *     fire-and-forget; if the DB insert fails the response has
 *     already gone out, so the only consequence is the next retry
 *     re-runs the handler. No correctness loss.
 */

import supabase from "../config/supabase.js";
import { logger } from "../config/logger.js";

const TABLE = "idempotency_keys";

export function idempotencyMiddleware() {
  return async (req, res, next) => {
    const key = req.headers["idempotency-key"];
    const orgId = req.orgId;

    // Opt-in only. No header → no idempotency. Pre-session routes
    // (no orgId) can't use the per-tenant cache.
    if (!key || !orgId) return next();

    // Sanity-bound the key length so a malicious client can't bloat
    // the table with multi-MB headers.
    if (typeof key !== "string" || key.length < 8 || key.length > 200) {
      return res.status(400).json({
        error: "Idempotency-Key must be 8-200 chars",
        code:  "BAD_REQUEST",
      });
    }

    const scope = `${req.method} ${req.baseUrl + req.path}`;

    // Look up cached response.
    try {
      const { data: cached } = await supabase
        .from(TABLE)
        .select("status_code, response_body")
        .eq("key",   key)
        .eq("scope", scope)
        .eq("org_id", orgId)
        .maybeSingle();

      if (cached) {
        // Replay. Don't pass through to the handler — the side
        // effect already happened on the original call.
        logger.info({ key, scope, orgId }, "idempotency: replaying cached response");
        return res.status(cached.status_code).json(cached.response_body);
      }
    } catch (err) {
      // Table missing or DB blip — fall through and let the handler
      // run normally. Idempotency is best-effort defence; not having
      // it isn't a correctness failure.
      logger.warn({ err }, "idempotency: cache lookup failed, proceeding without");
    }

    // Wrap res.json so we can capture the response shape.
    const originalJson = res.json.bind(res);
    let captured = null;
    res.json = (body) => {
      captured = body;
      return originalJson(body);
    };

    // After the response is sent, persist the cache row.
    res.on("finish", () => {
      if (captured == null) return;  // handler used res.send / res.end / etc.
      // Don't cache server errors — those are typically transient
      // and the caller MAY want to retry and get a different result.
      // 4xx and 2xx are stable enough to cache.
      if (res.statusCode >= 500) return;
      supabase.from(TABLE).insert({
        key,
        scope,
        org_id:        orgId,
        status_code:   res.statusCode,
        response_body: captured,
      }).then(({ error }) => {
        if (error) logger.warn({ err: error, key, scope }, "idempotency: cache write failed");
      });
    });

    next();
  };
}
