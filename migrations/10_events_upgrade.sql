-- ============================================================
-- MATH COLLECTIVE — Event Management Schema Upgrade
-- ============================================================
-- Date: April 4, 2026
-- Purpose: Add in-app event registration, attendance tracking,
--          event leaderboards, and achievements to the existing
--          events system.
--
-- Prerequisites:
--   - `events` table already exists (from events_migration.sql)
--   - `students` table already exists (from migration.sql)
--   - Run this AFTER the base migrations
--
-- IMPORTANT: This does NOT recreate the `events` or `students`
--   tables. It only adds new columns to `events` and creates
--   4 new tables.
-- ============================================================


-- ============================================================
-- 1. ALTER EXISTING `events` TABLE — add new columns
-- ============================================================
-- These columns support the new features without breaking
-- existing data or API endpoints.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS capacity           INTEGER       DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS venue_type         TEXT          DEFAULT 'in-person'
    CHECK (venue_type IN ('in-person', 'online', 'hybrid')),
  ADD COLUMN IF NOT EXISTS venue_link         TEXT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS xp_reward          INTEGER       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xp_bonus_first     INTEGER       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xp_bonus_winner    INTEGER       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requires_checkin   BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS checkin_code       TEXT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS starts_at          TIMESTAMPTZ   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ends_at            TIMESTAMPTZ   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS created_by         UUID          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cover_image_url    TEXT          DEFAULT NULL;

-- Note: `date` column is kept for backward compatibility.
-- New code should prefer `starts_at` / `ends_at` for precise scheduling.
-- If `starts_at` is NULL, fallback to `date`.

COMMENT ON COLUMN events.capacity IS 'Max registrations. NULL = unlimited.';
COMMENT ON COLUMN events.venue_type IS 'in-person | online | hybrid';
COMMENT ON COLUMN events.venue_link IS 'Meet/Zoom/Teams link for online/hybrid events';
COMMENT ON COLUMN events.xp_reward IS 'XP awarded for attending the event';
COMMENT ON COLUMN events.xp_bonus_first IS 'Extra XP for first N registrants (early bird)';
COMMENT ON COLUMN events.xp_bonus_winner IS 'XP awarded to competition winners';
COMMENT ON COLUMN events.requires_checkin IS 'If true, students must enter checkin_code at venue';
COMMENT ON COLUMN events.checkin_code IS '6-digit code displayed at venue for attendance verification';
COMMENT ON COLUMN events.starts_at IS 'Precise event start time (preferred over date)';
COMMENT ON COLUMN events.ends_at IS 'Precise event end time';
COMMENT ON COLUMN events.created_by IS 'user_id of the teacher/admin who created this event';
COMMENT ON COLUMN events.cover_image_url IS 'Banner image URL (Cloudinary or similar)';


-- ============================================================
-- 2. EVENT REGISTRATIONS — in-app registration tracking
-- ============================================================
-- Replaces the external Google Form approach.
-- Tracks who registered, when, and their status.

CREATE TABLE IF NOT EXISTS event_registrations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'waitlisted', 'cancelled', 'attended', 'no_show')),
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at    TIMESTAMPTZ DEFAULT NULL,
  checked_in_at   TIMESTAMPTZ DEFAULT NULL,
  team_name       TEXT        DEFAULT NULL,
  notes           TEXT        DEFAULT NULL,

  -- Prevent duplicate registrations (one registration per user per event)
  CONSTRAINT uq_event_registration UNIQUE (event_id, user_id)
);

COMMENT ON TABLE event_registrations IS 'Tracks student registrations for events. One row per user per event.';
COMMENT ON COLUMN event_registrations.status IS 'registered → attended (via checkin) or no_show (post-event). waitlisted if capacity full. cancelled by user.';
COMMENT ON COLUMN event_registrations.team_name IS 'For team-based events (hackathons, competitions)';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_reg_event      ON event_registrations (event_id);
CREATE INDEX IF NOT EXISTS idx_event_reg_user       ON event_registrations (user_id);
CREATE INDEX IF NOT EXISTS idx_event_reg_status     ON event_registrations (status);
CREATE INDEX IF NOT EXISTS idx_event_reg_event_status ON event_registrations (event_id, status);

-- Composite index for "how many registered for this event?" queries
CREATE INDEX IF NOT EXISTS idx_event_reg_count
  ON event_registrations (event_id)
  WHERE status IN ('registered', 'attended');


-- ============================================================
-- 3. EVENT ATTENDANCE — check-in verification + XP tracking
-- ============================================================
-- Separated from registrations because attendance can have
-- multiple check-in points (arrival, sessions, departure).
-- Also stores the XP awarded for attending.

CREATE TABLE IF NOT EXISTS event_attendance (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL,
  checkin_method   TEXT        NOT NULL DEFAULT 'manual'
    CHECK (checkin_method IN ('manual', 'code', 'qr', 'auto')),
  checkin_time    TIMESTAMPTZ NOT NULL DEFAULT now(),
  checkout_time   TIMESTAMPTZ DEFAULT NULL,
  xp_awarded      INTEGER     NOT NULL DEFAULT 0,
  session_label   TEXT        DEFAULT NULL,

  -- One check-in per user per event per session
  CONSTRAINT uq_event_attendance UNIQUE (event_id, user_id, session_label)
);

COMMENT ON TABLE event_attendance IS 'Records actual attendance at events. Separate from registration.';
COMMENT ON COLUMN event_attendance.checkin_method IS 'How the student checked in: manual (admin marked), code (entered 6-digit), qr (scanned), auto (system)';
COMMENT ON COLUMN event_attendance.session_label IS 'For multi-session events (e.g., "Day 1 Morning", "Workshop A"). NULL = single-session event.';
COMMENT ON COLUMN event_attendance.xp_awarded IS 'XP awarded for this specific check-in. 0 if XP already given.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_att_event     ON event_attendance (event_id);
CREATE INDEX IF NOT EXISTS idx_event_att_user      ON event_attendance (user_id);
CREATE INDEX IF NOT EXISTS idx_event_att_time      ON event_attendance (checkin_time);


-- ============================================================
-- 4. EVENT LEADERBOARD — per-event scoring and rankings
-- ============================================================
-- For competitions, hackathons, quizzes — tracks scores
-- within a specific event. Separate from the global XP
-- leaderboard (which is arena-based).

CREATE TABLE IF NOT EXISTS event_leaderboard (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL,
  score           INTEGER     NOT NULL DEFAULT 0,
  rank            INTEGER     DEFAULT NULL,
  team_name       TEXT        DEFAULT NULL,
  submission_url  TEXT        DEFAULT NULL,
  judged_by       UUID        DEFAULT NULL,
  judged_at       TIMESTAMPTZ DEFAULT NULL,
  notes           TEXT        DEFAULT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One leaderboard entry per user per event
  CONSTRAINT uq_event_leaderboard UNIQUE (event_id, user_id)
);

COMMENT ON TABLE event_leaderboard IS 'Per-event scoring for competitions, hackathons, etc. Not used for regular events.';
COMMENT ON COLUMN event_leaderboard.score IS 'Event-specific score (points, marks, rating — depends on event type)';
COMMENT ON COLUMN event_leaderboard.rank IS 'Final rank in the event. NULL until results are published.';
COMMENT ON COLUMN event_leaderboard.submission_url IS 'Link to project submission (for hackathons)';
COMMENT ON COLUMN event_leaderboard.judged_by IS 'user_id of the teacher/admin who scored this entry';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_lb_event      ON event_leaderboard (event_id);
CREATE INDEX IF NOT EXISTS idx_event_lb_user       ON event_leaderboard (user_id);
CREATE INDEX IF NOT EXISTS idx_event_lb_rank       ON event_leaderboard (event_id, rank);
CREATE INDEX IF NOT EXISTS idx_event_lb_score      ON event_leaderboard (event_id, score DESC);


-- ============================================================
-- 5. ACHIEVEMENTS — unlockable badges / milestones
-- ============================================================
-- Two tables: achievement definitions and user unlocks.
-- Achievements are earned from events, arena, or platform milestones.

-- 5a. Achievement definitions (admin-managed catalog)
CREATE TABLE IF NOT EXISTS achievements (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT        NOT NULL UNIQUE,
  title           TEXT        NOT NULL,
  description     TEXT        NOT NULL,
  icon            TEXT        DEFAULT '🏅',
  category        TEXT        NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'arena', 'event', 'social', 'streak', 'milestone')),
  criteria_type   TEXT        NOT NULL DEFAULT 'manual'
    CHECK (criteria_type IN ('manual', 'event_attend', 'event_win', 'arena_streak', 'arena_xp', 'friend_count', 'custom')),
  criteria_value  INTEGER     DEFAULT NULL,
  xp_reward       INTEGER     NOT NULL DEFAULT 0,
  rarity          TEXT        NOT NULL DEFAULT 'common'
    CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE achievements IS 'Master catalog of all achievable badges/milestones.';
COMMENT ON COLUMN achievements.slug IS 'URL-safe unique identifier (e.g., "first_event", "arena_streak_10")';
COMMENT ON COLUMN achievements.criteria_type IS 'How this achievement is earned. "manual" = admin grants. Others are auto-evaluated.';
COMMENT ON COLUMN achievements.criteria_value IS 'Threshold for auto-achievements (e.g., 10 for arena_streak_10, 5 for friend_count)';
COMMENT ON COLUMN achievements.rarity IS 'Visual rarity tier — affects badge color/glow in the UI';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_achievements_category ON achievements (category);
CREATE INDEX IF NOT EXISTS idx_achievements_active   ON achievements (is_active) WHERE is_active = true;


-- 5b. User achievement unlocks
CREATE TABLE IF NOT EXISTS user_achievements (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,
  achievement_id  UUID        NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  event_id        UUID        DEFAULT NULL REFERENCES events(id) ON DELETE SET NULL,
  unlocked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by      UUID        DEFAULT NULL,
  xp_awarded      INTEGER     NOT NULL DEFAULT 0,

  -- One unlock per user per achievement
  CONSTRAINT uq_user_achievement UNIQUE (user_id, achievement_id)
);

COMMENT ON TABLE user_achievements IS 'Records which achievements each user has unlocked.';
COMMENT ON COLUMN user_achievements.event_id IS 'The event that triggered this achievement (NULL for non-event achievements)';
COMMENT ON COLUMN user_achievements.granted_by IS 'user_id of admin who manually granted (NULL if auto-earned)';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_ach_user         ON user_achievements (user_id);
CREATE INDEX IF NOT EXISTS idx_user_ach_achievement   ON user_achievements (achievement_id);
CREATE INDEX IF NOT EXISTS idx_user_ach_event         ON user_achievements (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_ach_unlocked      ON user_achievements (unlocked_at DESC);


-- ============================================================
-- 6. SEED DEFAULT ACHIEVEMENTS
-- ============================================================
-- Pre-populate the achievements catalog with common milestones.

INSERT INTO achievements (slug, title, description, icon, category, criteria_type, criteria_value, xp_reward, rarity)
VALUES
  -- Event achievements
  ('first_event',       'First Steps',           'Attend your first event',                    '🎯', 'event',     'event_attend',  1,    50,  'common'),
  ('event_regular',     'Regular',               'Attend 5 events',                            '📅', 'event',     'event_attend',  5,    150, 'uncommon'),
  ('event_veteran',     'Veteran',               'Attend 15 events',                           '🎖️', 'event',     'event_attend',  15,   500, 'rare'),
  ('event_legend',      'Event Legend',           'Attend 50 events',                           '👑', 'event',     'event_attend',  50,   2000,'legendary'),
  ('first_win',         'Champion',              'Win 1st place in a competition',             '🏆', 'event',     'event_win',     1,    300, 'rare'),
  ('triple_crown',      'Triple Crown',          'Win 3 competitions',                         '💎', 'event',     'event_win',     3,    1000,'epic'),

  -- Arena achievements
  ('arena_first',       'Arena Debut',           'Solve your first challenge',                 '⚡', 'arena',     'arena_xp',      1,    25,  'common'),
  ('arena_streak_5',    'On Fire',               'Solve 5 challenges correctly in a row',      '🔥', 'arena',     'arena_streak',  5,    100, 'uncommon'),
  ('arena_streak_10',   'Unstoppable',           'Solve 10 challenges correctly in a row',     '💥', 'arena',     'arena_streak',  10,   300, 'rare'),
  ('arena_xp_500',      'Scholar',               'Earn 500 total XP from the arena',           '📚', 'arena',     'arena_xp',      500,  200, 'uncommon'),
  ('arena_xp_2000',     'Grandmaster',           'Earn 2000 total XP from the arena',          '🧠', 'arena',     'arena_xp',      2000, 750, 'epic'),
  ('arena_xp_10000',    'Axiom Lord',            'Earn 10000 total XP from the arena',         '∞',  'arena',     'arena_xp',      10000,3000,'legendary'),

  -- Social achievements
  ('first_friend',      'Connected',             'Make your first friend',                     '🤝', 'social',    'friend_count',  1,    30,  'common'),
  ('social_butterfly',  'Social Butterfly',      'Make 10 friends',                            '🦋', 'social',    'friend_count',  10,   200, 'uncommon'),

  -- Streak achievements
  ('week_streak_3',     'Consistent',            'Active for 3 consecutive weeks',             '📊', 'streak',    'custom',        3,    150, 'uncommon'),
  ('week_streak_10',    'Dedicated',             'Active for 10 consecutive weeks',            '🏔️', 'streak',    'custom',        10,   500, 'rare'),

  -- Milestone achievements
  ('early_bird',        'Early Bird',            'Register for an event within first hour',    '🐦', 'milestone', 'custom',        NULL, 50,  'common'),
  ('night_owl',         'Night Owl',             'Solve a challenge after midnight',           '🦉', 'milestone', 'custom',        NULL, 50,  'common')

ON CONFLICT (slug) DO NOTHING;


-- ============================================================
-- 7. HELPER FUNCTIONS
-- ============================================================

-- Function: Count registrations for an event (used in capacity checks)
CREATE OR REPLACE FUNCTION event_registration_count(p_event_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE
AS $$
  SELECT count(*)::integer
  FROM event_registrations
  WHERE event_id = p_event_id
    AND status IN ('registered', 'attended');
$$;

-- Function: Check if event is full
CREATE OR REPLACE FUNCTION event_is_full(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN e.capacity IS NULL THEN false
    ELSE event_registration_count(p_event_id) >= e.capacity
  END
  FROM events e WHERE e.id = p_event_id;
$$;

-- Function: Auto-update updated_at on event_leaderboard
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_event_leaderboard_updated
  BEFORE UPDATE ON event_leaderboard
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 8. ROW LEVEL SECURITY (optional — enable per table)
-- ============================================================
-- Uncomment these if you enable RLS on Supabase.

-- ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can view own registrations" ON event_registrations
--   FOR SELECT USING (auth.uid() = user_id);
-- CREATE POLICY "Users can register themselves" ON event_registrations
--   FOR INSERT WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "Users can cancel own registration" ON event_registrations
--   FOR UPDATE USING (auth.uid() = user_id)
--   WITH CHECK (status = 'cancelled');

-- ALTER TABLE event_attendance ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can view own attendance" ON event_attendance
--   FOR SELECT USING (auth.uid() = user_id);

-- ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can view own achievements" ON user_achievements
--   FOR SELECT USING (auth.uid() = user_id);
