-- ═══════════════════════════════════════════════════════════════
--  MATH COLLECTIVE — PROFILE VISIBILITY + SOCIAL PRIVACY (Phase 15)
--
--  Run in Supabase SQL editor. Idempotent — safe to run twice.
--
--  WHY THIS EXISTS
--  ───────────────
--  Phase 15 (rich profile pages) turns each user page into a
--  destination — visible achievements, friend list, activity feed.
--  Some students don't want ALL of that public; this migration adds
--  the privacy knobs that gate each section before the endpoints
--  and UI start reading from them.
--
--  NAMING NOTE
--  ───────────
--  These columns live on `chat_settings` rather than a separate
--  `profile_settings` table. When migration 08 created chat_settings
--  the intent was "chat-specific privacy", but in practice every
--  social-privacy knob (online status, last seen, who-can-DM) has
--  landed here. Adding the profile ones continues the pattern and
--  avoids a second fetch+upsert on every profile load. If/when this
--  table grows past ~10 columns, consider renaming it to
--  `user_privacy_settings` in a follow-up migration — the data
--  stays the same, only the name changes.
--
--  NEW COLUMNS
--  ───────────
--    profile_visibility     — who can see my full profile page
--    show_activity_feed     — whether my recent events/challenges/
--                             achievements are exposed on the profile
--    show_friend_list       — whether my friends tab is visible to
--                             anyone other than me
--
--  DEFAULTS favour VISIBILITY — a student who never touches settings
--  gets a fully public profile. Privacy-conscious users opt OUT.
--  Reverse (private-by-default) would mean the club's new members
--  show up as blank pages, which defeats the "make profiles a
--  destination" goal.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE chat_settings
  ADD COLUMN IF NOT EXISTS profile_visibility  TEXT    NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS show_activity_feed  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_friend_list    BOOLEAN NOT NULL DEFAULT TRUE;

-- CHECK constraint on the enum. Done as CHECK rather than a Postgres
-- ENUM TYPE so adding a new tier later (e.g. 'org_only' for BMSIT-
-- members-only visibility) is a drop-and-recreate on the CHECK vs
-- the awkward ALTER TYPE dance with ENUMs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_settings_profile_visibility_chk'
  ) THEN
    ALTER TABLE chat_settings
      ADD CONSTRAINT chat_settings_profile_visibility_chk
      CHECK (profile_visibility IN ('public', 'friends', 'nobody'));
  END IF;
END $$;

COMMENT ON COLUMN chat_settings.profile_visibility IS
  'public = anyone in the org can view | friends = only accepted friends | nobody = only self. Gates the /api/users/:id/profile endpoint.';
COMMENT ON COLUMN chat_settings.show_activity_feed IS
  'When FALSE, hide the Recent Activity timeline (events attended, challenges solved, achievements earned) from non-self viewers even if profile is public.';
COMMENT ON COLUMN chat_settings.show_friend_list IS
  'When FALSE, hide the Friends tab contents from non-self viewers even if profile is public. Friend COUNT can still be shown.';

COMMIT;


-- ════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'chat_settings'
  AND column_name IN ('profile_visibility', 'show_activity_feed', 'show_friend_list')
ORDER BY column_name;

-- Should return 3 rows: all NOT NULL, with the defaults above.
