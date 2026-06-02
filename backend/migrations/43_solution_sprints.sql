-- ════════════════════════════════════════════════════════════════
-- migration 43 — solution sprints (weekly featured problem)
-- ════════════════════════════════════════════════════════════════
--
-- A sprint is a 7-day window with ONE featured problem. Students
-- who post a writeup on that problem during the window get on the
-- sprint leaderboard, scored by the upvotes their writeup received
-- WHILE the sprint was running.
--
-- DESIGN CALLS
--   • Time-bounded by (starts_at, ends_at) — not by a sprint_number,
--     so calendar arithmetic stays explicit and a sprint can be
--     extended or shortened by an admin without renumbering siblings.
--   • One active sprint at a time — UNIQUE partial index on
--     (is_active = true) keeps the invariant in the DB rather than
--     trusting controllers.
--   • Sprints created lazily by the controller — when /sprints/active
--     is hit and no row covers NOW(), the controller picks a problem
--     (admin pin if set, otherwise the catalogue's least-recently-
--     featured high-interest entry) and inserts a new row. This
--     keeps us off a separate cron worker — Render's free tier
--     would charge for that.
--   • problem_id is a hard FK with ON DELETE RESTRICT — a sprint
--     can outlive its problem's deletion only by admin intervention.
--     We don't want a featured problem to silently disappear mid-week.
--
-- LEADERBOARD COMPUTATION
--   Done at query time, not denormalised. The query joins
--   problem_writeups + writeup_votes where votes.created_at falls
--   inside (starts_at, ends_at). Cheap up to ~10K votes/sprint.
--   We add a covering index on writeup_votes(created_at) so the
--   window scan is index-only.
--
-- RLS DISABLED — matches data-plane policy (migration 21).
-- IDEMPOTENT.
-- ════════════════════════════════════════════════════════════════

-- ─── solution_sprints ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.solution_sprints (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id   UUID        NOT NULL REFERENCES public.problem_statements(id) ON DELETE RESTRICT,
  slug         TEXT        NOT NULL UNIQUE,                    -- yyyy-ww style; URL-stable
  title        TEXT        NOT NULL,                           -- display label distinct from problem.title
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,
  is_active    BOOLEAN     NOT NULL DEFAULT true,              -- false when window ends + archived
  is_pinned    BOOLEAN     NOT NULL DEFAULT false,             -- admin manually set this featured pick
  created_by   UUID,                                           -- admin user_id if pinned; NULL if auto
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sprint_window_valid CHECK (ends_at > starts_at)
);

ALTER TABLE public.solution_sprints DISABLE ROW LEVEL SECURITY;

-- Only ONE active sprint at a time. Partial unique index instead of
-- a check constraint because Postgres can't write "at most one row
-- where active=true" without one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_sprint
  ON public.solution_sprints ((TRUE))
  WHERE is_active = true;

-- Fast lookup of the active sprint (single row scan).
CREATE INDEX IF NOT EXISTS idx_sprints_active
  ON public.solution_sprints (ends_at DESC)
  WHERE is_active = true;

-- Archive listing — most recent first.
CREATE INDEX IF NOT EXISTS idx_sprints_archive
  ON public.solution_sprints (starts_at DESC);

-- ─── upcoming sprint pin queue ──────────────────────────────────
-- Admin marks a problem to be the NEXT auto-sprint when the active
-- one ends. Optional — auto-selector falls back to least-recently-
-- featured if no pin is set. Single-row table by convention; we
-- DELETE on consumption rather than tracking is_consumed flags.
CREATE TABLE IF NOT EXISTS public.sprint_pin_queue (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id  UUID        NOT NULL REFERENCES public.problem_statements(id) ON DELETE CASCADE,
  pinned_by   UUID        NOT NULL,
  reason      TEXT,                                          -- optional admin note
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sprint_pin_queue DISABLE ROW LEVEL SECURITY;

-- ─── writeup_votes.created_at index ─────────────────────────────
-- Leaderboard query filters votes by created_at. The default index
-- on (writeup_id, user_id) doesn't help that filter. Cheap to add.
CREATE INDEX IF NOT EXISTS idx_writeup_votes_created
  ON public.writeup_votes (created_at);

-- ─── Verify ─────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN ('solution_sprints','sprint_pin_queue')) AS tables_present,
  (SELECT COUNT(*) FROM pg_indexes
    WHERE schemaname='public'
      AND tablename IN ('solution_sprints','sprint_pin_queue','writeup_votes')) AS index_count;
