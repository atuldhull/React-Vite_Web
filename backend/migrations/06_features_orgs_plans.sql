-- ═══════════════════════════════════════════════════
--  RUN THIS IN SUPABASE SQL EDITOR
-- ═══════════════════════════════════════════════════

-- 1. Scheduled tests table
CREATE TABLE IF NOT EXISTS public.scheduled_tests (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL,
  description   TEXT,
  created_by    UUID        NOT NULL,   -- teacher/admin user_id
  challenge_ids UUID[]      NOT NULL DEFAULT '{}',
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.scheduled_tests DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tests_starts ON public.scheduled_tests(starts_at);

-- 2. Scheduled test attempts
CREATE TABLE IF NOT EXISTS public.test_attempts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id     UUID        NOT NULL REFERENCES public.scheduled_tests(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL,
  answers     JSONB       NOT NULL DEFAULT '{}',  -- {challengeId: selectedIndex}
  score       INTEGER     NOT NULL DEFAULT 0,
  max_score   INTEGER     NOT NULL DEFAULT 0,
  submitted   BOOLEAN     NOT NULL DEFAULT false,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  UNIQUE(test_id, user_id)
);
ALTER TABLE public.test_attempts DISABLE ROW LEVEL SECURITY;

-- 3. Team projects
CREATE TABLE IF NOT EXISTS public.teams (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  members     UUID[]      NOT NULL DEFAULT '{}',  -- user_ids
  leader_id   UUID        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.teams DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.projects (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  description  TEXT        NOT NULL,
  category     TEXT        NOT NULL DEFAULT 'General',
  github_url   TEXT,
  demo_url     TEXT,
  screenshots  TEXT[]      DEFAULT '{}',
  teacher_votes INTEGER    NOT NULL DEFAULT 0,
  student_votes INTEGER    NOT NULL DEFAULT 0,
  total_points  INTEGER    GENERATED ALWAYS AS (teacher_votes * 2 + student_votes) STORED,
  is_approved  BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.projects DISABLE ROW LEVEL SECURITY;

-- Project votes (to prevent double-voting)
CREATE TABLE IF NOT EXISTS public.project_votes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL,
  vote_type  TEXT        NOT NULL CHECK (vote_type IN ('teacher', 'student')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);
ALTER TABLE public.project_votes DISABLE ROW LEVEL SECURITY;

-- Project categories (admin/teacher controlled)
CREATE TABLE IF NOT EXISTS public.project_categories (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT  NOT NULL UNIQUE,
  icon       TEXT  DEFAULT '🏆',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.project_categories DISABLE ROW LEVEL SECURITY;

-- Default categories
INSERT INTO public.project_categories (name, icon) VALUES
  ('Best Math Game',    '🎮'),
  ('Best Visualization','📊'),
  ('Most Creative',     '🎨'),
  ('Best UI/Design',    '✨'),
  ('Most Useful',       '🛠'),
  ('Best Presentation', '🎤')
ON CONFLICT (name) DO NOTHING;

-- Announcements
CREATE TABLE IF NOT EXISTS public.announcements (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  created_by  UUID,
  target_role TEXT        NOT NULL DEFAULT 'all'  CHECK (target_role IN ('all','student','teacher')),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.announcements DISABLE ROW LEVEL SECURITY;

-- Verify
SELECT
  (SELECT count(*) FROM public.scheduled_tests)   AS scheduled_tests,
  (SELECT count(*) FROM public.teams)              AS teams,
  (SELECT count(*) FROM public.projects)           AS projects,
  (SELECT count(*) FROM public.project_categories) AS categories,
  (SELECT count(*) FROM public.announcements)      AS announcements;
