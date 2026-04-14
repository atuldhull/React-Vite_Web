-- ═══════════════════════════════════════════════════════════════
--  MATH COLLECTIVE — IDEMPOTENCY KEYS
--  Run this in Supabase SQL Editor before deploying Phase 10.2.
--
--  WHY THIS EXISTS
--  ───────────────
--  Some POST endpoints kick off real-world side effects that should
--  NOT happen twice for the same logical action:
--
--    POST /api/payment/create-order
--      Creates a Razorpay order + a payment_history row. A network
--      retry that re-issues the same request creates a SECOND
--      Razorpay order, costing the org an extra checkout slot and
--      cluttering payment_history with duplicate "created" rows.
--
--  This table caches the (status, response_body) for a given
--  (key, scope, org_id) so the second request sees the cached result
--  without re-running the side effect.
--
--  KEY SHAPE
--  ─────────
--  - `key`  is supplied by the client in the `Idempotency-Key` HTTP
--    header. Stripe's convention; we mirror it. UUIDv4-ish strings
--    are fine; the only constraint is uniqueness from the client's
--    perspective for a single logical action.
--  - `scope` is "<METHOD> <path>" (e.g. "POST /api/payment/create-order")
--    so a key reused across two endpoints by accident doesn't collide.
--  - `org_id` scopes to the caller's tenant so two orgs can use the
--    same key value without colliding (common when both run a
--    deterministic key generator).
--
--  TTL
--  ───
--  Rows older than 24h are pruned by a periodic cleanup (run as a
--  Supabase scheduled function or a cron-style call). 24h covers the
--  longest "client retries after a network blip" window without
--  growing the table unboundedly.
--
--  WHAT'S NOT IDEMPOTENT-WRAPPED (and why)
--  ────────────────────────────────────────
--  - POST /api/notifications/subscribe — already idempotent at the
--    schema level (upsert with onConflict on `endpoint`). Wrapping
--    it would add a roundtrip without changing semantics.
--  - POST /api/payment/webhook — server-to-server from Razorpay.
--    They retry on non-2xx and the webhook handler is already
--    idempotent on (razorpay_order_id, status).
-- ═══════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key            TEXT         NOT NULL,
  scope          TEXT         NOT NULL,
  org_id         UUID         NOT NULL,
  status_code    INTEGER      NOT NULL,
  response_body  JSONB        NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (key, scope, org_id)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_created
  ON public.idempotency_keys (created_at);

-- Default-deny RLS (same stance as Phase 8): backend service-role
-- bypasses; anon/authenticated roles get nothing. No code path uses
-- the anon key for this table, but consistency matters.
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verify
SELECT
  table_name,
  (SELECT count(*) FROM public.idempotency_keys) AS rows
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'idempotency_keys';
