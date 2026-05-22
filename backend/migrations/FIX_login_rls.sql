-- ═══════════════════════════════════════════════════════════
--  FIX — "login just reloads back to the login page"
--  Run the WHOLE file in the Supabase SQL editor → Run.
--
--  ROOT CAUSE
--  ──────────
--  The login itself works, but the SESSION can't be saved, so the
--  next request is unauthenticated and the app bounces back to the
--  login page — for every account.
--
--  The session store (connect-pg-simple) reads/writes the
--  `user_sessions` table. Migration 16 created that table with RLS
--  ENABLED and **no policies** — which means "deny everything" the
--  moment the DB connection stops bypassing RLS. That bypass is no
--  longer reliable on this deployment (see migration 21's notes), so
--  every session read/write is now silently blocked.
--
--  THE FIX is the single line below: turn RLS OFF on user_sessions
--  (it is never user-facing — only the backend's session store
--  touches it). The rest of the file re-disables RLS on the other
--  backend tables as defence, and verifies. Data-safe + idempotent.
-- ═══════════════════════════════════════════════════════════

-- ── 1. DIAGNOSIS — user_sessions = true is THE bug ──
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'user_sessions','students','organisations','subscription_plans',
    'challenges','events','core_members'
  )
ORDER BY c.relrowsecurity DESC, c.relname;

-- ── 2. THE FIX — the session table must not have RLS ──
ALTER TABLE IF EXISTS public.user_sessions       DISABLE ROW LEVEL SECURITY;

-- ── …and re-disable RLS on every other table the backend uses ──
ALTER TABLE IF EXISTS public.students            DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.organisations       DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subscription_plans  DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.challenges          DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.events              DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.event_registrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.arena_attempts      DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.announcements       DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications       DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.scheduled_tests     DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.test_attempts       DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.teams               DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.projects            DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_votes       DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.weekly_winners      DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.org_invitations     DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.comments            DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.messages            DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.conversations       DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.friendships         DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_public_keys    DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chat_settings       DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_blocks         DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.certificate_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.certificates        DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.push_subscriptions  DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.core_teams          DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.core_members        DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.core_tasks          DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.core_points_log     DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.core_feedback       DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.core_ideas          DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.core_idea_votes     DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.core_trends         DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.core_meetings       DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.core_meeting_rsvps  DISABLE ROW LEVEL SECURITY;

-- ── 3. CONFIRM — every row below must read rls_enabled = false ──
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('user_sessions','students','organisations','challenges','core_members')
ORDER BY c.relname;
