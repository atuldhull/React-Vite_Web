-- ─────────────────────────────────────────────────────────────
-- Web Push subscriptions
--
-- One row per (user, browser/device) push subscription. The
-- { endpoint, keys.auth, keys.p256dh } triple returned by the
-- browser's pushManager.subscribe() is stored verbatim; the
-- backend uses the `web-push` library to sign + deliver.
--
-- Endpoint is unique globally — if the same browser re-subscribes
-- we upsert on endpoint so stale entries never stack up.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  auth        text NOT NULL,
  p256dh      text NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON push_subscriptions (user_id);
