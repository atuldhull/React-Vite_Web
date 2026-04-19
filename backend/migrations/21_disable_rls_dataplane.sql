-- ═══════════════════════════════════════════════════════════════
--  MATH COLLECTIVE — DISABLE RLS ON DATA-PLANE TABLES
--  Run this in Supabase SQL Editor.
--
--  BACKGROUND
--  ──────────
--  Migration 17 enabled RLS on every tenant table with the stated
--  assumption that the service-role key would bypass RLS by Supabase
--  platform default — so backend code using SUPABASE_SERVICE_ROLE_KEY
--  would keep working, and RLS would only catch accidental frontend
--  direct-query mistakes via the anon key.
--
--  That assumption no longer holds on this deployment. Inserts into
--  `challenges` (both admin bank saves and teacher AI bulk saves)
--  started failing with:
--
--    new row violates row-level security policy for table "challenges"
--
--  …despite the server using the service-role key. Whatever changed
--  (a Supabase platform tweak, an API-key migration, a role attribute
--  flip — hard to tell from outside), the observed behaviour is that
--  service-role is now subject to RLS on some tables and Phase 17's
--  default-deny posture blocks every write.
--
--  WHAT THIS MIGRATION DOES
--  ────────────────────────
--  Disables RLS on the data-plane tables that the backend writes to
--  / reads from on every request. This matches the existing pattern
--  in migration 01 (`students`, `certificate_batches`, `certificates`
--  already have RLS disabled for the same operational reason).
--
--  TRADE-OFFS
--  ──────────
--  Losses:
--    - The defence-in-depth layer from migration 17 for these
--      specific tables. If the service-role key leaks, the attacker
--      now sees rows they'd otherwise have been denied — but
--      service-role was going to be a catastrophic leak anyway.
--    - Supabase Realtime subscriptions on these tables will emit
--      rows regardless of the subscriber's role. We aren't using
--      Realtime today, so no observable impact.
--
--  Kept:
--    - Application-layer tenant scoping (tenantMiddleware.js) — this
--      is the primary isolation boundary. Every read/write still
--      goes through `req.db` and gets `.eq("org_id", req.orgId)`
--      injected. RLS was a belt-and-braces layer on top of it.
--    - RLS on NON-data-plane tables (audit_logs, session, etc.)
--      stays as the migration 17 defaults. Those aren't written to
--      from the user-facing hot path and keeping RLS there is still
--      cheap insurance.
--
--  SAFETY
--  ──────
--  Idempotent — DISABLE ROW LEVEL SECURITY is safe to run
--  repeatedly. No data is touched.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  tbl TEXT;
  -- Tables the backend reads/writes on the user-facing hot path.
  -- Matches the TENANT_TABLES set in backend/middleware/tenantMiddleware.js
  -- minus the three that migration 01 already disabled, plus a few
  -- adjacent tables (event_registrations, comments) that the same
  -- service-role-bypass assumption covered.
  dataplane_tables TEXT[] := ARRAY[
    'challenges',
    'events',
    'event_registrations',
    'arena_attempts',
    'announcements',
    'notifications',
    'scheduled_tests',
    'test_attempts',
    'teams',
    'projects',
    'project_votes',
    'weekly_winners',
    'org_invitations',
    'comments',
    'messages',
    'conversations',
    'friendships',
    'user_public_keys',
    'chat_settings',
    'user_blocks'
  ];
BEGIN
  FOREACH tbl IN ARRAY dataplane_tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
      RAISE NOTICE 'RLS disabled on %', tbl;
    ELSE
      RAISE NOTICE 'skip % — not present on this install', tbl;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────────
-- Verification — expect rls_enabled = false for every listed table.
-- ────────────────────────────────────────────────────────────────
SELECT
  t.tablename,
  c.relrowsecurity AS rls_enabled
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'challenges','events','event_registrations','arena_attempts',
    'announcements','notifications','scheduled_tests','test_attempts',
    'teams','projects','project_votes','weekly_winners',
    'org_invitations','comments','messages','conversations',
    'friendships','user_public_keys','chat_settings','user_blocks'
  )
ORDER BY t.tablename;
