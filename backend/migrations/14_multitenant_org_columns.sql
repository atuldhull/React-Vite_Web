-- ═══════════════════════════════════════════════════════════════
--  MATH COLLECTIVE — MULTI-TENANT ORG_ID LOCKDOWN
--  Run this in Supabase SQL Editor.
--
--  WHY THIS EXISTS
--  ───────────────
--  An audit during the production-hardening pass found that the
--  multi-tenant story was only partly installed:
--    - 14 of 15 "tenant tables" already had an `org_id` column with
--      a FK to organisations(id), but the column was NULLABLE and a
--      handful of legacy rows had org_id = NULL.
--    - One table (project_votes) didn't have org_id at all.
--    - Several tables were missing an index on org_id, which would
--      become a noticeable slowdown once tenantMiddleware's
--      `eq("org_id", X)` filter started being used by every read.
--    - Because the column was nullable + no scoping was actually
--      enforced in controllers, the app effectively ran as
--      single-tenant (cross-org reads were possible everywhere).
--
--  This migration is the SCHEMA half of the fix. The CONTROLLER half
--  (converting `supabase.from(...)` calls to `req.db.from(...)`)
--  lands in the commits that follow. After both halves ship, the
--  Proxy auto-injection in tenantMiddleware does real work.
--
--  WHAT IT DOES
--  ────────────
--  1. Pick the default org for backfilling NULL rows. The DB
--     currently has exactly one org ("Math Collective"); use that.
--     If for some reason there are zero orgs, abort — the operator
--     should set one up before running this.
--  2. project_votes: add the missing org_id column, backfill from
--     the parent project's org, FK + NOT NULL + index.
--  3. Backfill any NULL org_id on the other tenant tables to the
--     default org. (Spot-checked; all currently-NULL rows are legacy
--     data from before org_id was introduced.)
--  4. Lock down every tenant table: ALTER COLUMN org_id SET NOT NULL.
--  5. Add a (org_id) btree index on the tables that don't have one.
--
--  SAFETY
--  ──────
--  - Idempotent: every step uses IF EXISTS / IF NOT EXISTS guards.
--  - Wrapped in a single transaction; aborts cleanly if any step
--    fails (no half-applied state).
--  - Pure additive — no DROP, no destructive UPDATE on non-NULL data.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────
-- 1. Resolve the default org to use for legacy backfill
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  default_org UUID;
BEGIN
  SELECT id INTO default_org
  FROM public.organisations
  ORDER BY created_at ASC
  LIMIT 1;

  IF default_org IS NULL THEN
    RAISE EXCEPTION 'No organisations exist; create one before running this migration.';
  END IF;

  RAISE NOTICE 'Using default org % for legacy backfill', default_org;
  PERFORM set_config('migration.default_org', default_org::text, true);
END $$;

-- ────────────────────────────────────────────────────────────────
-- 2. project_votes — only tenant table missing org_id entirely
-- ────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.project_votes
  ADD COLUMN IF NOT EXISTS org_id UUID;

-- Backfill from the parent project (which already has org_id).
UPDATE public.project_votes v
   SET org_id = p.org_id
  FROM public.projects p
 WHERE p.id = v.project_id AND v.org_id IS NULL;

-- Anything still null (orphan votes — shouldn't happen because of the
-- FK to projects, but defence in depth) gets the default org.
UPDATE public.project_votes
   SET org_id = current_setting('migration.default_org')::uuid
 WHERE org_id IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_votes_org_id_fkey') THEN
    ALTER TABLE public.project_votes
      ADD CONSTRAINT project_votes_org_id_fkey FOREIGN KEY (org_id)
      REFERENCES public.organisations(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 3. Backfill NULL org_id on the other tenant tables
--
--    Counts at audit time (2026-04-13):
--      students=1, challenges=1, arena_attempts=10,
--      certificate_batches=1, certificates=1, weekly_winners=1.
--    All are legacy rows from before org_id was added.
-- ────────────────────────────────────────────────────────────────
UPDATE public.students            SET org_id = current_setting('migration.default_org')::uuid WHERE org_id IS NULL;
UPDATE public.challenges          SET org_id = current_setting('migration.default_org')::uuid WHERE org_id IS NULL;
UPDATE public.events              SET org_id = current_setting('migration.default_org')::uuid WHERE org_id IS NULL;

-- arena_attempts — try to backfill from the user's org first, fall
-- back to default for orphan attempts whose user record is gone.
UPDATE public.arena_attempts a
   SET org_id = s.org_id
  FROM public.students s
 WHERE s.user_id = a.user_id AND a.org_id IS NULL;
UPDATE public.arena_attempts      SET org_id = current_setting('migration.default_org')::uuid WHERE org_id IS NULL;

UPDATE public.announcements       SET org_id = current_setting('migration.default_org')::uuid WHERE org_id IS NULL;
UPDATE public.notifications       SET org_id = current_setting('migration.default_org')::uuid WHERE org_id IS NULL;
UPDATE public.certificate_batches SET org_id = current_setting('migration.default_org')::uuid WHERE org_id IS NULL;

-- certificates — backfill from parent batch first.
UPDATE public.certificates c
   SET org_id = b.org_id
  FROM public.certificate_batches b
 WHERE b.id = c.batch_id AND c.org_id IS NULL;
UPDATE public.certificates        SET org_id = current_setting('migration.default_org')::uuid WHERE org_id IS NULL;

UPDATE public.scheduled_tests     SET org_id = current_setting('migration.default_org')::uuid WHERE org_id IS NULL;

UPDATE public.test_attempts t
   SET org_id = st.org_id
  FROM public.scheduled_tests st
 WHERE st.id = t.test_id AND t.org_id IS NULL;
UPDATE public.test_attempts       SET org_id = current_setting('migration.default_org')::uuid WHERE org_id IS NULL;

UPDATE public.teams               SET org_id = current_setting('migration.default_org')::uuid WHERE org_id IS NULL;
UPDATE public.projects            SET org_id = current_setting('migration.default_org')::uuid WHERE org_id IS NULL;
UPDATE public.weekly_winners      SET org_id = current_setting('migration.default_org')::uuid WHERE org_id IS NULL;
-- org_invitations.org_id is already NOT NULL — nothing to do.

-- ────────────────────────────────────────────────────────────────
-- 4. SET NOT NULL on every tenant table now that backfill is done
-- ────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.students            ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE IF EXISTS public.challenges          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE IF EXISTS public.events              ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE IF EXISTS public.arena_attempts      ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE IF EXISTS public.announcements       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE IF EXISTS public.notifications       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE IF EXISTS public.certificate_batches ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE IF EXISTS public.certificates        ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE IF EXISTS public.scheduled_tests     ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE IF EXISTS public.test_attempts       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE IF EXISTS public.teams               ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE IF EXISTS public.projects            ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE IF EXISTS public.project_votes       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE IF EXISTS public.weekly_winners      ALTER COLUMN org_id SET NOT NULL;

-- ────────────────────────────────────────────────────────────────
-- 5. Indexes — add where missing. Existing ones (challenges,
--    students, audit_logs, payment_history) are left alone.
-- ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_events_org              ON public.events(org_id);
CREATE INDEX IF NOT EXISTS idx_arena_attempts_org      ON public.arena_attempts(org_id);
CREATE INDEX IF NOT EXISTS idx_announcements_org       ON public.announcements(org_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org       ON public.notifications(org_id);
CREATE INDEX IF NOT EXISTS idx_certificate_batches_org ON public.certificate_batches(org_id);
CREATE INDEX IF NOT EXISTS idx_certificates_org        ON public.certificates(org_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_tests_org     ON public.scheduled_tests(org_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_org       ON public.test_attempts(org_id);
CREATE INDEX IF NOT EXISTS idx_teams_org               ON public.teams(org_id);
CREATE INDEX IF NOT EXISTS idx_projects_org            ON public.projects(org_id);
CREATE INDEX IF NOT EXISTS idx_project_votes_org       ON public.project_votes(org_id);
CREATE INDEX IF NOT EXISTS idx_weekly_winners_org      ON public.weekly_winners(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_org     ON public.org_invitations(org_id);

COMMIT;

-- ────────────────────────────────────────────────────────────────
-- Verify (run this AFTER the COMMIT to confirm)
-- ────────────────────────────────────────────────────────────────
SELECT
  table_name,
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'org_id'
ORDER BY table_name;
