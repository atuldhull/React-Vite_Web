-- ═══════════════════════════════════════════════════════════════
--  MATH COLLECTIVE — RLS DEFAULT-DENY ON TENANT TABLES
--  Run this in Supabase SQL Editor.
--
--  WHY THIS EXISTS
--  ───────────────
--  Today, the only thing standing between a leaked Supabase
--  service-role key and a full data dump of every org's data is
--  "the attacker doesn't have one yet". Application-layer scoping
--  (Phase 2.2) is excellent but is only one layer.
--
--  This migration adds the database layer:
--    - Enables Row Level Security on every tenant table.
--    - Adds NO permissive policies.
--    - Net effect: any caller using the `anon` or `authenticated`
--      role gets zero rows from these tables. The `service_role`
--      bypasses RLS by Supabase platform default — backend code
--      (which uses SUPABASE_SERVICE_ROLE_KEY) keeps working
--      unchanged.
--
--  WHO IS PROTECTED FROM WHOM
--  ──────────────────────────
--  Today's frontend doesn't talk to Supabase directly — every read
--  goes through the Express backend on /api/*, which uses the
--  service-role key. So RLS doesn't affect any current code path.
--
--  RLS catches:
--    - A future PR that introduces a frontend Supabase client
--      using the anon key — would silently see zero rows on tenant
--      tables, surfacing the "you forgot to use /api" mistake at
--      build time.
--    - A leaked service-role key — the attacker would still get
--      everything (service-role bypasses RLS by design), so RLS
--      isn't a leak-mitigation tool. But:
--    - A leaked ANON key — currently does nothing useful since the
--      anon key has no access to public.* tables.
--    - Misconfigured Supabase Realtime channels: realtime broadcasts
--      use RLS to filter what each subscriber can see. Default-deny
--      means realtime emits nothing for tenant tables unless we
--      explicitly add a per-channel policy later.
--
--  IF / WHEN THE FRONTEND ADOPTS ANON-KEY DIRECT QUERIES
--  ────────────────────────────────────────────────────
--  Add per-table permissive policies that read auth.uid() →
--  students.user_id → students.org_id, then
--    USING (org_id = auth_user_org()).
--  See the commented-out scaffold at the bottom of this file.
--
--  SAFETY
--  ──────
--  Idempotent: ENABLE ROW LEVEL SECURITY is safe to run repeatedly.
--  Wrapped in a transaction. No data is touched; only the table-
--  level RLS flag flips.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────
-- 1. Enable RLS on every tenant table.
--    Each statement is independent; if a table doesn't exist on
--    this install (some out-of-tree tables vary per environment),
--    the IF EXISTS guard skips it cleanly.
-- ────────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbl TEXT;
  tenant_tables TEXT[] := ARRAY[
    'students',
    'challenges',
    'events',
    'arena_attempts',
    'announcements',
    'notifications',
    'certificate_batches',
    'certificates',
    'scheduled_tests',
    'test_attempts',
    'teams',
    'projects',
    'project_votes',
    'weekly_winners',
    'org_invitations'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      RAISE NOTICE 'RLS enabled on %', tbl;
    ELSE
      RAISE NOTICE 'skip % — not present on this install', tbl;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────────
-- 2. Verify
-- ────────────────────────────────────────────────────────────────
SELECT
  t.tablename,
  c.relrowsecurity AS rls_enabled,
  (SELECT count(*) FROM pg_policies p WHERE p.tablename = t.tablename)::int AS policy_count
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'students','challenges','events','arena_attempts','announcements',
    'notifications','certificate_batches','certificates',
    'scheduled_tests','test_attempts','teams','projects',
    'project_votes','weekly_winners','org_invitations'
  )
ORDER BY t.tablename;

-- ────────────────────────────────────────────────────────────────
-- 3. (Future) — scaffold for per-org permissive policies
--
-- IF you later want anon-key direct queries from the frontend to
-- work (e.g. to use Supabase Realtime for a tenant table), add
-- policies like the ones below. Until then, leaving them OUT keeps
-- the default-deny stance airtight.
--
-- Helper: derive the caller's org_id from the auth.uid() the
-- Supabase client provides on every request.
--
--   CREATE OR REPLACE FUNCTION public.auth_user_org_id()
--   RETURNS UUID AS $$
--     SELECT org_id FROM public.students WHERE user_id = auth.uid()
--   $$ LANGUAGE SQL STABLE SECURITY DEFINER;
--
-- Then per-table:
--
--   CREATE POLICY "tenant_select_own_org"
--     ON public.events FOR SELECT TO authenticated
--     USING (org_id = public.auth_user_org_id());
--
-- Repeat for each tenant table you want anon/authenticated reads on.
-- Note: SECURITY DEFINER on the helper means it runs with the
-- function-owner's privileges — necessary so the function can read
-- public.students even from inside a policy that gates public.students.
-- ────────────────────────────────────────────────────────────────
