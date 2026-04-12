-- ═══════════════════════════════════════════════════════════════
-- QR Check-in System Migration
-- Run this in Supabase SQL Editor
-- Date: April 4, 2026
-- ═══════════════════════════════════════════════════════════════

-- Add unique QR token to each registration
ALTER TABLE event_registrations
  ADD COLUMN IF NOT EXISTS qr_token TEXT UNIQUE DEFAULT NULL;

-- Index for fast QR lookups (the scanner hits this on every scan)
CREATE INDEX IF NOT EXISTS idx_event_reg_qr_token
  ON event_registrations (qr_token)
  WHERE qr_token IS NOT NULL;

-- Backfill existing registrations with tokens
UPDATE event_registrations
SET qr_token = encode(gen_random_bytes(16), 'hex')
WHERE qr_token IS NULL;

-- Verify
SELECT count(*) AS registrations_with_qr FROM event_registrations WHERE qr_token IS NOT NULL;
