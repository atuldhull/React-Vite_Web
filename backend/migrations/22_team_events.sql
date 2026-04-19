-- ═══════════════════════════════════════════════════════════════
--  MATH COLLECTIVE — TEAM-EVENT SUPPORT
--  Run this in Supabase SQL Editor.
--
--  WHAT THIS DOES
--  ──────────────
--  Adds three columns to `events` so admins can mark an event as a
--  team event and bound the team size, plus one column to
--  `event_registrations` so each registration records how many
--  members the registering team is bringing. Team name already has
--  a column (migration 10).
--
--    events.is_team_event   — false for solo events (default),
--                             true for hackathons / group workshops
--    events.min_team_size   — smallest allowed team (default 2)
--    events.max_team_size   — largest allowed team (default 5)
--
--    event_registrations.team_size — count of members the team is
--                                    bringing. NULL for solo events.
--
--  MODEL CHOICE
--  ────────────
--  A single registration row per TEAM (the leader registers on
--  behalf of everyone). Team_name + team_size are recorded on that
--  row. One QR token covers the whole team — check-in scans once,
--  all members considered attended. If per-member check-in /
--  per-member XP is needed later, that's an additive change: add
--  an event_team_members child table without changing this schema.
--
--  Rationale for the simpler model: collecting N teammate accounts
--  at registration time is a much bigger UX surface (each must
--  already have a Math Collective account + be in the same org +
--  confirm participation). Team_name + size covers the admin's
--  actual need — "how many people do I have at this hackathon" —
--  without blocking a team that has one member without an account.
--
--  SAFETY
--  ──────
--  Idempotent (ADD COLUMN IF NOT EXISTS). No data touched.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_team_event BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_team_size INTEGER  NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_team_size INTEGER  NOT NULL DEFAULT 5;

-- Basic sanity so UI edge cases can't persist a nonsense range.
-- Drop+recreate so re-runs don't error on already-existing check.
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_team_size_range_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_team_size_range_check
  CHECK (min_team_size >= 1 AND max_team_size >= min_team_size AND max_team_size <= 50);

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS team_size INTEGER;

COMMIT;

-- ────────────────────────────────────────────────────────────────
-- Verification
-- ────────────────────────────────────────────────────────────────
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'events'
  AND column_name IN ('is_team_event', 'min_team_size', 'max_team_size')
ORDER BY column_name;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'event_registrations'
  AND column_name IN ('team_name', 'team_size')
ORDER BY column_name;
