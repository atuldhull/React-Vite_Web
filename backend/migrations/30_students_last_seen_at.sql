-- ════════════════════════════════════════════════════════════════
-- migration 30 — students.last_seen_at column + index
-- ════════════════════════════════════════════════════════════════
--
-- Adds the long-missing last_seen_at TIMESTAMPTZ column on the
-- students table. Two write sites and three read sites already
-- reference it; the writes have been silently failing forever
-- (the .then(()=>{}).catch(()=>{}) handlers swallowed the
-- "column does not exist" error every time), and the reads have
-- been returning NULL / 0 the whole time.
--
-- Sites that come alive once this lands:
--   WRITERS
--     backend/controllers/authController.js  — on every login
--     backend/middleware/authMiddleware.js   — on every authenticated request
--   READERS
--     backend/controllers/orgAdminController.js — admin users list
--     backend/controllers/orgAdminController.js — "active this week" stat
--     backend/controllers/superAdmin/analytics.js — platform-wide active stat
--
-- Migration 29 already declared an index on this column, but
-- wrapped it in an information_schema.columns guard that no-op'd
-- because the column didn't exist yet. We build the index inline
-- here so a single 'apply migration 30' is all the operator has
-- to do — no need to re-run 29.
--
-- Safety
--   ADD COLUMN IF NOT EXISTS  — idempotent, safe to re-run.
--   No DEFAULT — existing rows stay NULL (correct: we don't
--   actually KNOW when those users were last seen). The read
--   sites already handle NULL by hiding the cell / counting them
--   as 'never seen'.
--   No NOT NULL constraint — a NULL last_seen for a freshly-
--   created student account is the meaningful semantic.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- The matching index. Was conditionally declared in migration 29
-- but skipped because the column didn't exist at that time. Now
-- that the column is here, build the index. CREATE INDEX IF NOT
-- EXISTS keeps this idempotent.
CREATE INDEX IF NOT EXISTS idx29_students_last_seen
  ON public.students (last_seen_at DESC);


-- ════════════════════════════════════════════════════════════════
-- Verify
-- ════════════════════════════════════════════════════════════════
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'students'
       AND column_name = 'last_seen_at'
  ) AS column_present,
  EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'idx29_students_last_seen'
  ) AS index_present;
