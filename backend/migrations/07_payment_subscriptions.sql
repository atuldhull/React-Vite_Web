-- ═══════════════════════════════════════════════════════
--  MATH COLLECTIVE — PAYMENT HISTORY MIGRATION
--  Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

-- 1. Payment history table
CREATE TABLE IF NOT EXISTS public.payment_history (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL,
  user_id               UUID        NOT NULL,
  plan_name             TEXT        NOT NULL,
  plan_id               UUID,
  razorpay_order_id     TEXT        UNIQUE NOT NULL,
  razorpay_payment_id   TEXT,
  razorpay_signature    TEXT,
  amount                NUMERIC     NOT NULL,        -- in INR (e.g. 999.00)
  currency              TEXT        NOT NULL DEFAULT 'INR',
  status                TEXT        NOT NULL DEFAULT 'created'
                        CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  plan_expires_at       TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payment_history DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payment_org     ON public.payment_history(org_id);
CREATE INDEX IF NOT EXISTS idx_payment_status  ON public.payment_history(status);
CREATE INDEX IF NOT EXISTS idx_payment_order   ON public.payment_history(razorpay_order_id);

-- 2. Ensure organisations table has plan_expires_at column
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

-- 3. Verify
SELECT
  (SELECT count(*) FROM public.payment_history) AS payment_records,
  (SELECT column_name FROM information_schema.columns
   WHERE table_name = 'organisations' AND column_name = 'plan_expires_at') AS plan_expires_col;
