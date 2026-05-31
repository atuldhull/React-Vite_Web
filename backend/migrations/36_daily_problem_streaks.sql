-- ════════════════════════════════════════════════════════════════
-- migration 36 — Daily Problem of the Day + per-student streaks
-- ════════════════════════════════════════════════════════════════
--
-- Two changes:
--
--   1. `daily_picks` — one row per calendar date, pointing at the
--      problem chosen for that day. Cross-tenant (everyone sees the
--      same daily challenge globally). The first request on a given
--      date lazily inserts the row (controller picks one randomly
--      from is_active=true problems); subsequent requests read it.
--      No cron needed.
--
--   2. `students.streak_days` + `students.streak_last_date` — track
--      consecutive-day check-ins on the daily problem. Streak bumps
--      when last_date == yesterday; resets to 1 otherwise. Cap is
--      enforced in app code (we don't put a CHECK constraint on it
--      because someone's actual 365-day streak should be representable).
--
-- IDEMPOTENT.
-- ════════════════════════════════════════════════════════════════

-- ─── daily_picks ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_picks (
  pick_date   DATE        PRIMARY KEY,
  problem_id  UUID        NOT NULL REFERENCES public.problem_statements(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.daily_picks DISABLE ROW LEVEL SECURITY;

-- Quick "what was yesterday's / last week's" lookups (used by the
-- archive endpoint).
CREATE INDEX IF NOT EXISTS idx_daily_picks_problem ON public.daily_picks (problem_id);

-- ─── students streak columns ──────────────────────────────────
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS streak_days       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_last_date  DATE;

-- Leaderboard sort key — "longest streaks" surfaces later.
CREATE INDEX IF NOT EXISTS idx_students_streak ON public.students (streak_days DESC)
  WHERE streak_days > 0;

-- ─── Verify ────────────────────────────────────────────────────
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables
           WHERE table_schema='public' AND table_name='daily_picks') AS daily_picks_present,
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='students' AND column_name='streak_days') AS streak_col_present;
