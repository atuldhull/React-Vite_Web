-- ════════════════════════════════════════════════════════════════
-- migration 35 — problem engagement (interest beacons + writeups)
-- ════════════════════════════════════════════════════════════════
--
-- Turns the read-only `/problems` catalogue into a participatory
-- notice-board. Three new tables, all cross-tenant (no org_id) to
-- match the catalogue's own data-plane policy:
--
--   problem_interests  — "I'm tackling this" beacon. Composite PK
--                        (problem_id, user_id) so each student can
--                        toggle one interest per problem.
--   problem_writeups   — markdown post-mortem after a student finishes
--                        a problem. One writeup per (problem, user)
--                        for now — re-submit overwrites.
--   writeup_votes      — upvotes on writeups. Composite PK
--                        (writeup_id, user_id); toggling re-deletes.
--
-- RLS DISABLED — matches the data-plane policy from migration 21.
-- Access control happens in the controllers (requireAuth on reads,
-- ownership check on writes).
--
-- IDEMPOTENT.
-- ════════════════════════════════════════════════════════════════

-- ─── problem_interests ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.problem_interests (
  problem_id   UUID        NOT NULL REFERENCES public.problem_statements(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (problem_id, user_id)
);

ALTER TABLE public.problem_interests DISABLE ROW LEVEL SECURITY;

-- Fast "who's working on this problem" lookups (detail page).
CREATE INDEX IF NOT EXISTS idx_problem_interests_problem
  ON public.problem_interests (problem_id);

-- Fast "what am I working on" lookups (dashboard widget, portfolio).
CREATE INDEX IF NOT EXISTS idx_problem_interests_user
  ON public.problem_interests (user_id, created_at DESC);

-- ─── problem_writeups ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.problem_writeups (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id    UUID        NOT NULL REFERENCES public.problem_statements(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL,
  title         TEXT        NOT NULL,
  body          TEXT        NOT NULL,                  -- markdown, capped at 16KB by validator
  repo_url      TEXT,                                  -- "where the code lives"
  is_published  BOOLEAN     NOT NULL DEFAULT true,     -- author can soft-delete
  vote_count    INTEGER     NOT NULL DEFAULT 0,        -- denormalised; trigger keeps in sync
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (problem_id, user_id)                         -- one writeup per (problem, user)
);

ALTER TABLE public.problem_writeups DISABLE ROW LEVEL SECURITY;

-- Detail-page list ordered by votes desc, then recency.
CREATE INDEX IF NOT EXISTS idx_writeups_problem
  ON public.problem_writeups (problem_id, vote_count DESC, created_at DESC)
  WHERE is_published = true;

-- Per-user listing (used by portfolio page later).
CREATE INDEX IF NOT EXISTS idx_writeups_user
  ON public.problem_writeups (user_id, created_at DESC)
  WHERE is_published = true;

-- ─── writeup_votes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.writeup_votes (
  writeup_id  UUID        NOT NULL REFERENCES public.problem_writeups(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (writeup_id, user_id)
);

ALTER TABLE public.writeup_votes DISABLE ROW LEVEL SECURITY;

-- ─── vote_count denormalisation trigger ────────────────────────
-- We store the count on problem_writeups so the detail page list
-- can order by it without a per-row count(*) subquery. Keep it
-- in sync via AFTER INSERT/DELETE on writeup_votes.
CREATE OR REPLACE FUNCTION public.writeup_votes_sync_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.problem_writeups
       SET vote_count = vote_count + 1
     WHERE id = NEW.writeup_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.problem_writeups
       SET vote_count = GREATEST(0, vote_count - 1)
     WHERE id = OLD.writeup_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_writeup_votes_sync ON public.writeup_votes;
CREATE TRIGGER trg_writeup_votes_sync
  AFTER INSERT OR DELETE ON public.writeup_votes
  FOR EACH ROW EXECUTE FUNCTION public.writeup_votes_sync_count();

-- ─── updated_at trigger for writeups ───────────────────────────
CREATE OR REPLACE FUNCTION public.problem_writeups_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_problem_writeups_updated_at ON public.problem_writeups;
CREATE TRIGGER trg_problem_writeups_updated_at
  BEFORE UPDATE ON public.problem_writeups
  FOR EACH ROW EXECUTE FUNCTION public.problem_writeups_set_updated_at();

-- ─── Verify ────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN ('problem_interests','problem_writeups','writeup_votes')) AS tables_present,
  (SELECT COUNT(*) FROM pg_indexes
    WHERE schemaname='public'
      AND tablename IN ('problem_interests','problem_writeups','writeup_votes')) AS index_count;
