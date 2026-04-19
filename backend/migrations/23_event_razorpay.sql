-- ═══════════════════════════════════════════════════════════════
--  MATH COLLECTIVE — RAZORPAY AUTO-VERIFY FOR EVENT PAYMENTS
--  Run this in Supabase SQL Editor.
--
--  WHAT THIS DOES
--  ──────────────
--  Adds `razorpay_order_id` to event_registrations so the webhook
--  from Razorpay can look up which registration a captured payment
--  belongs to. When the webhook fires with event=payment.captured,
--  the handler joins payload.order_id → event_registrations.razorpay_order_id
--  and flips payment_status to 'paid' automatically.
--
--  Previously every paid-event registration required an admin to
--  verify the UPI reference manually in their bank app. This column
--  is the one missing link that lets Razorpay's webhook replace
--  that step — the rest of the Razorpay SDK is already wired for
--  subscription billing (see backend/controllers/payment/*).
--
--  COLUMN ADDED
--  ────────────
--    event_registrations.razorpay_order_id  TEXT  NULLABLE
--      - NULL for legacy UPI-reconciled rows (manual flow still
--        works as fallback)
--      - Set to the Razorpay order id ("order_xxx...") when the
--        student creates an order through the checkout button
--      - Indexed so the webhook's lookup stays O(log n) as the
--        registration table grows
--
--  SAFETY
--  ──────
--  Idempotent (ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS).
--  No data is modified.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;

-- Webhook lookup runs on every captured payment — keep it indexed.
-- Partial index (WHERE razorpay_order_id IS NOT NULL) so the index
-- only covers rows that actually participate in Razorpay flow,
-- leaving legacy UPI rows out of the index footprint.
CREATE INDEX IF NOT EXISTS idx_event_registrations_razorpay_order_id
  ON public.event_registrations (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

COMMIT;

-- ────────────────────────────────────────────────────────────────
-- Verification
-- ────────────────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'event_registrations'
  AND column_name  = 'razorpay_order_id';
