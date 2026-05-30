-- ════════════════════════════════════════════════════════════════
-- migration 29 — performance indexes (Phase-16 hardening)
-- ════════════════════════════════════════════════════════════════
--
-- CREATE INDEX IF NOT EXISTS ONLY. No schema change, no data
-- migration, no constraints. Each index targets a query shape this
-- codebase actually issues — verified by reading the matching
-- controller before adding the row.
--
-- WHY THIS IS SAFE TO RUN ANY TIME
--   IF NOT EXISTS — re-running this migration is a no-op.
--   No ALTER TABLE — no schema-cache busts in Supabase.
--   No DROP        — no risk of removing a different index that's
--                    already serving query plans we don't yet know
--                    about.
--   Each line is independent — a failed index build (e.g. ran out
--   of temp space) doesn't roll back the prior CREATEs because
--   they're separate statements.
--
-- WHY CONCURRENTLY IS *NOT* USED
--   Postgres requires CREATE INDEX CONCURRENTLY to run outside any
--   transaction. Supabase's SQL editor wraps the submitted script
--   in a transaction. Running concurrently would fail with
--   "CREATE INDEX CONCURRENTLY cannot run inside a transaction
--   block". The tables here are small (Math Collective single-org;
--   row counts << 1 M on every table indexed) so the lock-and-build
--   path is fast and acceptable. If the deploy grows, re-run these
--   one at a time via psql with --single-transaction off.
--
-- VERIFICATION
--   After applying, you can confirm the indexes landed with:
--     SELECT schemaname, indexname FROM pg_indexes
--      WHERE indexname LIKE 'idx29_%'
--      ORDER BY indexname;
-- ════════════════════════════════════════════════════════════════


-- ── students: weekly leaderboard + presence ─────────────────────
-- leaderboardController orders by weekly_xp DESC; the existing
-- idx_students_xp covers all-time but not the weekly query.
CREATE INDEX IF NOT EXISTS idx29_students_weekly_xp
  ON public.students (weekly_xp DESC);

-- userController.getUserStats: WHERE xp > $1 (rank computation).
-- Composite with org_id mirrors the tenant proxy's auto-eq filter.
CREATE INDEX IF NOT EXISTS idx29_students_org_xp
  ON public.students (org_id, xp DESC);

-- Presence: "users seen in the last X minutes". The students table
-- on this deployment does NOT have a last_seen_at column (the code
-- in authController.login writes to it but the .then(()=>{}) fire-
-- and-forget swallows the column-doesn't-exist error). The index is
-- wrapped in a DO block that checks for the column first so this
-- migration stays portable: it builds the index where the column
-- exists, no-ops where it doesn't, and never aborts the whole
-- script on a single missing column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'students'
       AND column_name = 'last_seen_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx29_students_last_seen
             ON public.students (last_seen_at DESC)';
  END IF;
END $$;

-- email lookup (Supabase auth → student row). Already a unique
-- constraint, but explicit index helps the planner pick it
-- consistently across query shapes.
CREATE INDEX IF NOT EXISTS idx29_students_email
  ON public.students (email);


-- ── arena_attempts: per-user history + stats ────────────────────
-- userController.getUserStats counts WHERE user_id=$1 AND correct=true.
-- The two-col index serves both that count + the per-user history
-- list (which orders by created_at).
CREATE INDEX IF NOT EXISTS idx29_arena_attempts_user_correct
  ON public.arena_attempts (user_id, correct);

CREATE INDEX IF NOT EXISTS idx29_arena_attempts_user_created
  ON public.arena_attempts (user_id, created_at DESC);


-- ── audit_logs: post-hardening lookup paths ─────────────────────
-- superAdmin/auditLogs.getAuditLogs filters by action ILIKE + org_id.
-- The action col is text so an index on (action) helps the leading
-- ILIKE only with anchored prefixes — still worth it for direct
-- equality filters from the eventual filter dropdown.
CREATE INDEX IF NOT EXISTS idx29_audit_logs_action_time
  ON public.audit_logs (action, created_at DESC);

-- The most common operator query: "what did user X do recently?"
CREATE INDEX IF NOT EXISTS idx29_audit_logs_actor_time
  ON public.audit_logs (actor_id, created_at DESC);

-- Per-org timeline (the default view).
CREATE INDEX IF NOT EXISTS idx29_audit_logs_org_time
  ON public.audit_logs (org_id, created_at DESC);


-- ── friendships: pending / accepted lookups ─────────────────────
-- messagingController.sendFriendRequest checks for an existing row
-- via OR(requester.eq, recipient.eq); both columns already have
-- single-col indexes (migration 08). Adding a composite on
-- (status, recipient_id) speeds up the pending-list query that
-- powers the friend-requests inbox.
CREATE INDEX IF NOT EXISTS idx29_friendships_status_recipient
  ON public.friendships (status, recipient_id);

CREATE INDEX IF NOT EXISTS idx29_friendships_status_requester
  ON public.friendships (status, requester_id);


-- ── user_blocks: block check on every friend / message attempt ─
-- messagingController.sendFriendRequest + getOrCreateConversation
-- both call OR(blocker_id.eq, blocker_id.eq).OR(blocked_id.eq, ...).
-- Single-col indexes on both halves cover this pattern.
CREATE INDEX IF NOT EXISTS idx29_user_blocks_blocker
  ON public.user_blocks (blocker_id);

CREATE INDEX IF NOT EXISTS idx29_user_blocks_blocked
  ON public.user_blocks (blocked_id);


-- ── messages: unread count ──────────────────────────────────────
-- messagingController.getConversations runs a count of unread
-- messages per conversation. Without an index targeted at
-- "is_read=false rows" this is a seq scan that grows linearly with
-- total chat volume. Partial index keeps the index TINY since the
-- vast majority of rows are read.
CREATE INDEX IF NOT EXISTS idx29_messages_unread
  ON public.messages (conversation_id, sender_id)
  WHERE is_read = false;


-- ── payment_history: billing UI ─────────────────────────────────
-- payment/billing.getBillingHistory orders by created_at DESC and
-- filters by org_id. idx_payment_org exists but doesn't cover the
-- ORDER BY — composite serves both at once.
CREATE INDEX IF NOT EXISTS idx29_payment_org_created
  ON public.payment_history (org_id, created_at DESC);


-- ── notifications: feed query ───────────────────────────────────
-- The notifications inbox orders by created_at DESC for a single
-- user. idx_notif_user covers user_id alone; the composite makes
-- the order step a no-op.
CREATE INDEX IF NOT EXISTS idx29_notifications_user_created
  ON public.notifications (user_id, created_at DESC);


-- ── core_chat: anonymous chat list ──────────────────────────────
-- coreTeam/chat.js orders by created_at on every poll. The
-- existing idx_core_chat_created (migration 28) IS the right
-- shape; no addition needed. Listed here for the operator who's
-- diffing migrations.


-- ── core_tasks: filterable board ────────────────────────────────
-- Existing single-col indexes idx_core_tasks_status,
-- idx_core_tasks_team cover the two filter dimensions. Composite
-- helps the "tasks for team X with status Y" cross-filter that
-- the dashboard uses.
CREATE INDEX IF NOT EXISTS idx29_core_tasks_team_status
  ON public.core_tasks (team_id, status);


-- ── referrals: leaderboard count ────────────────────────────────
-- referralController.getReferralLeaderboard counts COUNT(*) GROUP
-- BY referrer_id. Existing idx_referrals_referrer is correct;
-- noted here so the auditor sees it was considered.


-- ════════════════════════════════════════════════════════════════
-- Verify
-- ════════════════════════════════════════════════════════════════
SELECT
  COUNT(*) FILTER (WHERE indexname LIKE 'idx29_%') AS new_indexes
  FROM pg_indexes
 WHERE schemaname = 'public';
