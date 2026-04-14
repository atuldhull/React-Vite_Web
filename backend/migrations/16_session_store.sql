-- ═══════════════════════════════════════════════════════════════
--  MATH COLLECTIVE — SESSION STORE TABLE
--  Run this in Supabase SQL Editor before deploying Phase 6.1.
--
--  WHY THIS EXISTS
--  ───────────────
--  Production was running `express-session` with the default
--  MemoryStore. Two problems:
--    1. Sessions die on every backend restart (deploy = forced
--       logout for every user).
--    2. Cannot be horizontally scaled — sessions stored in one
--       process are invisible to any other.
--
--  This migration creates the table that `connect-pg-simple` uses
--  when `SESSION_DB_URL` is set in the deployment environment. The
--  shape (id/sess/expire) is the library's standard schema —
--  copying it verbatim from the connect-pg-simple README so we
--  don't drift from upstream expectations.
--
--  WHAT IT DOES
--  ────────────
--  - Creates `user_sessions` table.
--  - Adds an index on `expire` so the library's periodic prune-
--    expired-rows query stays fast.
--  - Idempotent: re-running is a no-op.
--
--  ALTERNATIVE
--  ───────────
--  If you set REDIS_URL instead (Phase 6.1 supports both), this
--  table is unused but harmless. Pick one based on your deploy
--  environment.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_sessions (
  sid    VARCHAR      NOT NULL COLLATE "default",
  sess   JSON         NOT NULL,
  expire TIMESTAMP(6) NOT NULL
)
WITH (OIDS = FALSE);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_pkey'
  ) THEN
    ALTER TABLE public.user_sessions
      ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_sessions_expire
  ON public.user_sessions (expire);

-- RLS: session rows are not user-readable. Backend uses the
-- service-role key (which bypasses RLS), but enabling RLS with no
-- policies is the safest default — any future code that ever uses
-- the anon key against this table gets nothing back.
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Verify
SELECT
  table_name,
  (SELECT count(*) FROM public.user_sessions) AS current_session_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'user_sessions';
