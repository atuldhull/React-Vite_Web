-- ═══════════════════════════════════════════════════════════
--  MATH COLLECTIVE — RUN THIS IN SUPABASE SQL EDITOR
--  Paste entire file → Run
-- ═══════════════════════════════════════════════════════════

-- 1. Add missing columns to students
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS xp      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS role    TEXT    NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS title   TEXT    NOT NULL DEFAULT 'Axiom Scout';

-- 2. Add role constraint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_role_check') THEN
    ALTER TABLE public.students ADD CONSTRAINT students_role_check CHECK (role IN ('student','teacher','admin','super_admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_students_userid ON public.students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_xp     ON public.students(xp DESC);

-- 3. Fix challenges table
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS solution TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Make sure all 200 imported challenges are active
UPDATE public.challenges SET is_active = true WHERE is_active IS NULL OR is_active = false;

-- 4. Fix events table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS location  TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 5. Create arena_attempts if missing
CREATE TABLE IF NOT EXISTS public.arena_attempts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL,
  challenge_id   UUID        NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  selected_index INTEGER     NOT NULL,
  correct        BOOLEAN     NOT NULL DEFAULT false,
  xp_earned      INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_challenge UNIQUE (user_id, challenge_id)
);

ALTER TABLE public.arena_attempts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.students       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.events         DISABLE ROW LEVEL SECURITY;

-- 6. Make yourself admin — CHANGE THE EMAIL BELOW
UPDATE public.students SET role = 'admin' WHERE email = 'atuldhull777@gmail.com';

-- 7. Verify
SELECT
  (SELECT count(*) FROM public.students)             AS students,
  (SELECT count(*) FROM public.challenges)           AS challenges,
  (SELECT count(*) FROM public.challenges WHERE is_active = true) AS active_challenges,
  (SELECT count(*) FROM public.arena_attempts)       AS attempts,
  (SELECT count(*) FROM public.events)               AS events;
