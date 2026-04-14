-- ═══════════════════════════════════════════════════════════════
--  MATH COLLECTIVE — PAID EVENTS (manual UPI/QR reconciliation)
--
--  Run in Supabase SQL editor. Idempotent — safe to run twice.
--
--  WHY THIS EXISTS
--  ───────────────
--  Clubs want to host paid events (hackathon fees, workshop fees,
--  pizza money for social meetups) but don't have a Razorpay live
--  account set up yet — Razorpay live mode needs business KYC and
--  charges a ~2% fee per transaction which isn't viable for a
--  ₹20 pizza contribution.
--
--  The pragmatic answer: the teacher uploads a UPI QR code (or
--  just types their UPI ID), students pay from their phone UPI
--  app, type the UPI reference number back into the registration
--  page, and the admin marks them paid after verifying in their
--  own bank app. No gateway, no fees, no KYC, works today.
--
--  This migration adds:
--    1. Payment columns on `events` (is_paid, price_paise,
--       payment_upi_id, payment_qr_base64, payment_instructions).
--    2. Reconciliation columns on `event_registrations`
--       (payment_status, payment_ref, paid_at, marked_by,
--       marked_at, rejection_reason).
--    3. org_id column on event_registrations — so the tenant
--       scoping middleware can filter by it directly (today we
--       scope via the event_id → events.org_id chain, which works
--       but adds a JOIN on every read). Back-filled from the
--       referenced event.
--    4. An index on (event_id, payment_status) for the admin
--       reconciliation page which filters by "pending" per event.
--
--  SAFETY NOTES
--  ────────────
--  - QR image is stored inline as base64 (payment_qr_base64 TEXT).
--    QR PNGs are tiny (~2-8 KB); this avoids needing a Supabase
--    Storage bucket and keeps the feature working on the free tier
--    without any out-of-band setup.
--  - price_paise uses integer paise, not DECIMAL rupees. Matches
--    the Razorpay / Stripe convention so the existing payment
--    helpers don't need a new unit-conversion branch, and it
--    dodges every floating-point rupee bug.
--  - No CHECK constraint coupling is_paid to price_paise > 0 —
--    the validator handles that, and a CHECK makes later "make
--    this event free again" updates annoying.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────
-- 1. events — payment config set by the teacher/admin
-- ────────────────────────────────────────────────────────────────

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_paid               BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_paise           INTEGER  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_upi_id        TEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_qr_base64     TEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_instructions  TEXT     DEFAULT NULL;

COMMENT ON COLUMN events.is_paid IS 'When true, registration requires payment reconciliation before the student is considered confirmed.';
COMMENT ON COLUMN events.price_paise IS 'Event fee in paise (integer — same convention as Razorpay). ₹50 = 5000.';
COMMENT ON COLUMN events.payment_upi_id IS 'UPI VPA for manual payment, e.g. teacher@okhdfcbank. Shown to students on the event page.';
COMMENT ON COLUMN events.payment_qr_base64 IS 'Data-URL-style base64 QR image (data:image/png;base64,...). Rendered inline on the event page.';
COMMENT ON COLUMN events.payment_instructions IS 'Free-text instructions shown below the QR/UPI ID (e.g. "Include your USN in the transaction note").';


-- ────────────────────────────────────────────────────────────────
-- 2. event_registrations — reconciliation state per registration
-- ────────────────────────────────────────────────────────────────
--
-- payment_status lifecycle for a paid event:
--   pending   → student registered, hasn't submitted a UPI ref yet
--   submitted → student typed a UPI ref (still awaiting admin check)
--   paid      → admin verified the payment in their bank app and
--               marked it paid (final state; unlocks attendance + XP)
--   rejected  → admin couldn't find the payment; optional reason
--               shown to the student so they can retry
--
-- For a FREE event, payment_status stays 'not_required' so the
-- column still has a useful, non-NULL default.

ALTER TABLE event_registrations
  ADD COLUMN IF NOT EXISTS payment_status     TEXT        NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS payment_ref        TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS paid_at            TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS marked_by          UUID        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS marked_at          TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason   TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS org_id             UUID        DEFAULT NULL;

-- Validate the status enum. Done as CHECK rather than a Postgres
-- ENUM TYPE because adding a new status later (e.g. "refunded")
-- is a plain CHECK drop-and-recreate vs an ALTER TYPE dance.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_registrations_payment_status_chk'
  ) THEN
    ALTER TABLE event_registrations
      ADD CONSTRAINT event_registrations_payment_status_chk
      CHECK (payment_status IN ('not_required', 'pending', 'submitted', 'paid', 'rejected'));
  END IF;
END $$;

COMMENT ON COLUMN event_registrations.payment_status IS 'not_required (free event) | pending (paid event, no proof yet) | submitted (UPI ref provided) | paid (admin verified) | rejected (admin couldn''t match)';
COMMENT ON COLUMN event_registrations.payment_ref IS 'UPI transaction reference number the student pasted in after paying. 12-digit numeric on most Indian UPI apps.';
COMMENT ON COLUMN event_registrations.marked_by IS 'user_id of the admin/teacher who flipped status to paid or rejected.';
COMMENT ON COLUMN event_registrations.rejection_reason IS 'Free-text reason shown to the student when the admin rejects a payment — so they know why and can retry.';


-- ────────────────────────────────────────────────────────────────
-- 3. org_id backfill on event_registrations
-- ────────────────────────────────────────────────────────────────
-- Existing rows: pull from the parent event.
-- New rows: backend inserts with an explicit org_id via the tenant
-- middleware proxy (see TENANT_TABLES in backend/middleware/tenantMiddleware.js).

UPDATE event_registrations er
SET org_id = e.org_id
FROM events e
WHERE er.event_id = e.id
  AND er.org_id IS NULL;

-- ────────────────────────────────────────────────────────────────
-- 4. Indexes
-- ────────────────────────────────────────────────────────────────
-- Admin reconciliation page query:
--   SELECT * FROM event_registrations
--   WHERE event_id = $1 AND payment_status IN ('pending','submitted')
-- This index keeps it O(log n) per event regardless of total row
-- count. "submitted" is the most interesting state for the admin,
-- so we don't bother with a more elaborate partial index.

CREATE INDEX IF NOT EXISTS idx_event_reg_event_payment
  ON event_registrations (event_id, payment_status);

-- Tenant-scoped list query (future-proofing — if we ever add an
-- admin view that spans events).
CREATE INDEX IF NOT EXISTS idx_event_reg_org
  ON event_registrations (org_id)
  WHERE org_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────────
-- 5. Row-Level Security on event_registrations
-- ────────────────────────────────────────────────────────────────
-- event_registrations wasn't in the Phase-8 RLS migration because
-- it didn't carry org_id directly. Now it does, so enable RLS for
-- consistency with the other tenant tables. service_role (backend)
-- bypasses RLS; no permissive policies are added, same default-
-- deny stance as migration 17.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'event_registrations'
  ) THEN
    EXECUTE 'ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY';
    RAISE NOTICE 'RLS enabled on event_registrations';
  END IF;
END $$;

COMMIT;


-- ════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'events'
  AND column_name IN ('is_paid','price_paise','payment_upi_id','payment_qr_base64','payment_instructions')
ORDER BY column_name;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'event_registrations'
  AND column_name IN ('payment_status','payment_ref','paid_at','marked_by','marked_at','rejection_reason','org_id')
ORDER BY column_name;
