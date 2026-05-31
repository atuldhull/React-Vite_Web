-- ════════════════════════════════════════════════════════════════
-- migration 41 — Problem-statement submission queue (AI-assisted)
-- ════════════════════════════════════════════════════════════════
--
-- Students paste a URL (Kaggle / SIH / GSoC / etc.) → the backend
-- fetches the page + asks the LLM to draft the catalogue fields
-- (title, description, how_to_start, tags, links). The student
-- reviews the draft, edits anything wrong, and submits to a queue.
-- An admin approves → the row is INSERTed into problem_statements.
--
-- We keep submissions in their own table (rather than letting
-- unapproved rows sit in problem_statements with a status flag) so
-- the main catalogue stays clean — listProblems doesn't need to
-- filter every read by submission_status, and the admin queue is
-- a single fast scan of problem_submissions.
--
-- IDEMPOTENT.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.problem_submissions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  submitter_id    UUID        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  reject_reason   TEXT,
  approved_problem_id UUID    REFERENCES public.problem_statements(id) ON DELETE SET NULL,

  -- Catalogue fields — mirror problem_statements so a copy on
  -- approval is a simple field-for-field move. Same caps too.
  title           TEXT        NOT NULL,
  description     TEXT        NOT NULL,
  how_to_start    TEXT,
  domain          TEXT        NOT NULL,
  difficulty      TEXT        NOT NULL DEFAULT 'intermediate'
                  CHECK (difficulty IN ('beginner','intermediate','advanced')),
  organisation    TEXT,
  source          TEXT        NOT NULL
                  CHECK (source IN ('SIH','GSoC','Kaggle','MLH','Devfolio','Unstop','OpenSource')),
  source_event    TEXT,
  official_url    TEXT,
  dataset_links   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  resource_links  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  tags            TEXT[]      NOT NULL DEFAULT '{}',

  source_url      TEXT,         -- the URL the student pasted (provenance)
  ai_drafted      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.problem_submissions DISABLE ROW LEVEL SECURITY;

-- Admin queue: pending first, then by submission time.
CREATE INDEX IF NOT EXISTS idx_problem_subs_status
  ON public.problem_submissions (status, created_at);

-- Submitter's own list — for "Your submissions" on /profile or similar.
CREATE INDEX IF NOT EXISTS idx_problem_subs_submitter
  ON public.problem_submissions (submitter_id, created_at DESC);

-- updated_at trigger — reuses the same pattern as problem_statements.
CREATE OR REPLACE FUNCTION public.problem_submissions_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_problem_submissions_updated_at ON public.problem_submissions;
CREATE TRIGGER trg_problem_submissions_updated_at
  BEFORE UPDATE ON public.problem_submissions
  FOR EACH ROW EXECUTE FUNCTION public.problem_submissions_set_updated_at();

-- ─── Verify ────────────────────────────────────────────────────
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables
           WHERE table_schema='public' AND table_name='problem_submissions') AS table_present,
  (SELECT COUNT(*) FROM pg_indexes
    WHERE schemaname='public' AND tablename='problem_submissions') AS index_count;
