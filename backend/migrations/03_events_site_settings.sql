-- ═══════════════════════════════════════════════════════════════
--  MATH COLLECTIVE — EVENTS + SITE SETTINGS MIGRATION (v1)
--  Run this in Supabase SQL Editor
--
--  NOTE: After running this, also run:
--    docs/events-upgrade-schema.sql     (adds registration, attendance, leaderboard, achievements)
--    docs/notifications-type-update.sql (adds event/achievement/friend notification types)
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Add new columns to events table ──
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS registration_form_url  TEXT,          -- Google Form / Typeform / any URL
  ADD COLUMN IF NOT EXISTS registration_deadline  TIMESTAMPTZ,   -- when registration closes
  ADD COLUMN IF NOT EXISTS registration_open      BOOLEAN NOT NULL DEFAULT true,  -- admin can force-close
  ADD COLUMN IF NOT EXISTS max_registrations      INTEGER,       -- optional cap (null = unlimited)
  ADD COLUMN IF NOT EXISTS event_type             TEXT NOT NULL DEFAULT 'general',  -- general | hackathon | workshop | competition | seminar
  ADD COLUMN IF NOT EXISTS banner_color           TEXT NOT NULL DEFAULT '#7c3aed', -- accent color for the card
  ADD COLUMN IF NOT EXISTS organiser              TEXT,          -- e.g. "Dept of AI&ML"
  ADD COLUMN IF NOT EXISTS tags                   TEXT[] DEFAULT '{}'; -- e.g. {math, hackathon, aiml}

-- ── 2. Site Settings table ──
-- Stores global toggles like "website registrations open"
CREATE TABLE IF NOT EXISTS public.site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID
);

ALTER TABLE public.site_settings DISABLE ROW LEVEL SECURITY;

-- Default settings
INSERT INTO public.site_settings (key, value) VALUES
  ('registrations_open', 'true'),    -- controls /register page
  ('site_notice', ''),               -- optional global banner message
  ('arena_open', 'true')             -- controls arena access
ON CONFLICT (key) DO NOTHING;

-- ── 3. Verify ──
SELECT
  (SELECT count(*) FROM public.events)        AS events,
  (SELECT count(*) FROM public.site_settings) AS settings;