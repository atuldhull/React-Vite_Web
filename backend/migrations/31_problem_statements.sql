-- ════════════════════════════════════════════════════════════════
-- migration 31 — problem_statements (open-source / hackathon repo)
-- ════════════════════════════════════════════════════════════════
--
-- Browseable repo of real-world problem statements from SIH, GSoC,
-- Kaggle, MLH / Devfolio / Unstop, and similar sources. Auth-gated
-- READ (login required for everyone, no role restriction). Admin /
-- teacher-only WRITE — the bulk-import will come from CSV.
--
-- Cross-tenant: this is a PLATFORM-wide reference catalogue, not
-- per-org content (the same SIH problem is the same for every BMSIT
-- student regardless of org_id). org_id stays NULL. The tenant
-- proxy treats NULL org_id rows as visible to all orgs.
--
-- IDEMPOTENT — CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT
-- EXISTS throughout. Safe to re-run.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.problem_statements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE,                  -- stable URL handle, generated from title
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,                -- full problem text (markdown allowed)
  how_to_start    TEXT,                         -- 2-3 paragraph getting-started guide
  domain          TEXT NOT NULL,                -- AI/ML, Web, Web3, Health, FinTech, IoT, Govt, OpenSource
  difficulty      TEXT NOT NULL DEFAULT 'intermediate'
                  CHECK (difficulty IN ('beginner','intermediate','advanced')),
  organisation    TEXT,                         -- "ISRO" / "Microsoft" / "Govt of Karnataka" / "Apache Foundation"
  source          TEXT NOT NULL,                -- "SIH" / "GSoC" / "Kaggle" / "MLH" / "Devfolio" / "Unstop" / "OpenSource"
  source_event    TEXT,                         -- "SIH 2024" / "GSoC 2024" / null for evergreen
  official_url    TEXT,                         -- canonical page where this problem lives
  dataset_links   JSONB NOT NULL DEFAULT '[]'::jsonb,
                  -- [ {"label":"...", "url":"...", "format":"csv|json|api"} ]
  resource_links  JSONB NOT NULL DEFAULT '[]'::jsonb,
                  -- [ {"label":"...", "url":"...", "kind":"docs|tutorial|repo|paper|video"} ]
  tags            TEXT[] NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true, -- false = hidden from list
  created_by      UUID,                          -- admin/teacher who added it
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Disable RLS — same policy as the rest of the data plane (migration
-- 21). Tenant scoping is handled in the controller; this table is
-- intentionally cross-tenant (platform-wide catalogue).
ALTER TABLE public.problem_statements DISABLE ROW LEVEL SECURITY;

-- ─── Indexes for the list-page filter dimensions ───────────────
CREATE INDEX IF NOT EXISTS idx_problems_active
  ON public.problem_statements (is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_problems_domain
  ON public.problem_statements (domain);

CREATE INDEX IF NOT EXISTS idx_problems_source
  ON public.problem_statements (source);

CREATE INDEX IF NOT EXISTS idx_problems_difficulty
  ON public.problem_statements (difficulty);

-- GIN index on tags so the "find problems tagged python+ml" filter is fast.
CREATE INDEX IF NOT EXISTS idx_problems_tags
  ON public.problem_statements USING GIN (tags);

-- Sort key for the "newest first" default order.
CREATE INDEX IF NOT EXISTS idx_problems_created_at
  ON public.problem_statements (created_at DESC);

-- ─── Auto-update updated_at on every UPDATE ────────────────────
CREATE OR REPLACE FUNCTION public.problem_statements_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_problem_statements_updated_at ON public.problem_statements;
CREATE TRIGGER trg_problem_statements_updated_at
  BEFORE UPDATE ON public.problem_statements
  FOR EACH ROW EXECUTE FUNCTION public.problem_statements_set_updated_at();

-- ─── Verify ────────────────────────────────────────────────────
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables
           WHERE table_schema='public' AND table_name='problem_statements') AS table_present,
  (SELECT COUNT(*) FROM pg_indexes
    WHERE schemaname='public' AND tablename='problem_statements') AS index_count;
