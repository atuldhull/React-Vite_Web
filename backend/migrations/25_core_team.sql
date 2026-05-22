-- ═══════════════════════════════════════════════════════════
--  MIGRATION 25 — CORE TEAM PORTAL  (Club Asymptotes core team)
--  Run the WHOLE file in the Supabase SQL editor → Run.
--
--  Adds the "Core Team" extension: a private workspace for the
--  club's council + team heads + members. Self-contained — none
--  of these tables are org-scoped (single club), so the backend
--  reads them with the raw supabase client, not req.db.
--
--  Idempotent: safe to re-run. The member seed uses ON CONFLICT
--  so re-running won't duplicate the 25 rows.
-- ═══════════════════════════════════════════════════════════

-- ── 1. TEAMS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_teams (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  slug        TEXT        NOT NULL UNIQUE,
  description TEXT,
  accent      TEXT        NOT NULL DEFAULT '#7c3aed',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. MEMBERS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_members (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  email        TEXT        NOT NULL UNIQUE,
  team_id      UUID        REFERENCES public.core_teams(id) ON DELETE SET NULL,
  position     TEXT        NOT NULL DEFAULT 'Member',
  tier         TEXT        NOT NULL DEFAULT 'member'
                 CHECK (tier IN ('council','head','member')),
  access_code  TEXT        NOT NULL UNIQUE,
  user_id      UUID,                       -- filled when the member redeems their code
  redeemed_at  TIMESTAMPTZ,
  points       INTEGER     NOT NULL DEFAULT 0,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_core_members_userid ON public.core_members(user_id);
CREATE INDEX IF NOT EXISTS idx_core_members_team   ON public.core_members(team_id);

-- ── 3. TASKS ──────────────────────────────────────────────
--  team_id NULL  + is_open TRUE  → anonymous task, first-come-first-serve
--  status flow:  open → todo → in_progress → submitted → confirmed
CREATE TABLE IF NOT EXISTS public.core_tasks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL,
  description   TEXT,
  team_id       UUID        REFERENCES public.core_teams(id)   ON DELETE CASCADE,
  is_open       BOOLEAN     NOT NULL DEFAULT FALSE,
  points        INTEGER     NOT NULL DEFAULT 10,
  deadline      TIMESTAMPTZ,
  status        TEXT        NOT NULL DEFAULT 'todo'
                  CHECK (status IN ('open','todo','in_progress','submitted','confirmed')),
  assigned_by   UUID        REFERENCES public.core_members(id) ON DELETE SET NULL,
  claimed_by    UUID        REFERENCES public.core_members(id) ON DELETE SET NULL,
  confirmed_by  UUID        REFERENCES public.core_members(id) ON DELETE SET NULL,
  submission    TEXT,
  claimed_at    TIMESTAMPTZ,
  submitted_at  TIMESTAMPTZ,
  confirmed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_core_tasks_team   ON public.core_tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_core_tasks_status ON public.core_tasks(status);

-- ── 4. POINTS LEDGER ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_points_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  UUID        NOT NULL REFERENCES public.core_members(id) ON DELETE CASCADE,
  points     INTEGER     NOT NULL,
  reason     TEXT        NOT NULL,
  ref_type   TEXT,                          -- 'task' | 'idea' | 'manual'
  ref_id     UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_core_points_member ON public.core_points_log(member_id);

-- ── 5. FEEDBACK (anonymous suggestions / complaints) ──────
--  author_user_id is stored but NEVER returned to normal users —
--  only a site admin / super_admin can de-anonymise a flagged item.
CREATE TABLE IF NOT EXISTS public.core_feedback (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id  UUID,
  author_name     TEXT,
  scope           TEXT        NOT NULL DEFAULT 'club'
                    CHECK (scope IN ('club','team')),
  team_id         UUID        REFERENCES public.core_teams(id) ON DELETE SET NULL,
  kind            TEXT        NOT NULL DEFAULT 'suggestion'
                    CHECK (kind IN ('suggestion','complaint')),
  body            TEXT        NOT NULL,
  is_flagged      BOOLEAN     NOT NULL DEFAULT FALSE,
  flag_reason     TEXT,
  status          TEXT        NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','reviewed','resolved')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_core_feedback_scope ON public.core_feedback(scope, team_id);

-- ── 6. IDEAS BOARD ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_ideas (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id  UUID        NOT NULL,
  author_member_id UUID       REFERENCES public.core_members(id) ON DELETE SET NULL,
  author_name     TEXT,
  field           TEXT        NOT NULL DEFAULT 'General',
  title           TEXT        NOT NULL,
  body            TEXT        NOT NULL,
  vote_count      INTEGER     NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','approved','archived')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_core_ideas_votes ON public.core_ideas(vote_count DESC);

CREATE TABLE IF NOT EXISTS public.core_idea_votes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id    UUID        NOT NULL REFERENCES public.core_ideas(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uniq_idea_vote UNIQUE (idea_id, user_id)
);

-- ── 7. TRENDS FEED ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_trends (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category     TEXT        NOT NULL DEFAULT 'General',
  title        TEXT        NOT NULL,
  summary      TEXT,
  club_angle   TEXT,                        -- AI-written "how the club can use this"
  image_url    TEXT,
  source_url   TEXT        NOT NULL UNIQUE,
  source_name  TEXT,
  published_at TIMESTAMPTZ,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_core_trends_fetched ON public.core_trends(fetched_at DESC);

-- ── 8. RLS — disabled, matching the data-plane convention (migration 21)
ALTER TABLE public.core_teams      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_members    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_tasks      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_points_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_feedback   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_ideas      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_idea_votes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_trends     DISABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
--  SEED — 5 teams + 25 core members (Club Asymptotes)
-- ═══════════════════════════════════════════════════════════

INSERT INTO public.core_teams (name, slug, description, accent) VALUES
  ('Event Management', 'event-management', 'Plans and runs every club event end to end.', '#7c3aed'),
  ('Event Design',     'event-design',     'Visual identity — posters, stage, branding.', '#ec4899'),
  ('Marketing',        'marketing',        'Reach, partnerships and on-ground promotion.', '#f59e0b'),
  ('Social Media',     'social-media',     'Content, reels and the club''s online voice.', '#06b6d4'),
  ('Technical',        'technical',        'Website, tooling and tech for events.',        '#22c55e')
ON CONFLICT (name) DO NOTHING;

-- Members. Council members have team_id NULL (they sit above teams).
-- Codes are the member's private "core member ID" — share privately.
INSERT INTO public.core_members (name, email, team_id, position, tier, access_code) VALUES
  -- ── Club Council ──
  ('D Lalith Chandra',           '24ug1byai190@bmsit.in',  NULL, 'President',        'council', 'ASYM-LC7P'),
  ('Atul Dhull',                 '24ug1byai146@gmail.com', NULL, 'Vice-President',   'council', 'ASYM-AD2K'),
  ('Satvika Prashanth Hiremath', '24ug1byai224@gmail.com', NULL, 'Joint Secretary',  'council', 'ASYM-SH9M'),
  ('Ritika Girish Kulkarni',     '24ug1byai060@bmsit.in',  NULL, 'Secretary',        'council', 'ASYM-RK4Q'),
  -- ── Event Management ──
  ('Vishal Athreya', '24ug1byai149@bmsit.in',  (SELECT id FROM public.core_teams WHERE slug='event-management'), 'Head',   'head',   'ASYM-VA1H'),
  ('Ayush Kumar',    '24ug1byai049@bmsit.in',  (SELECT id FROM public.core_teams WHERE slug='event-management'), 'Member', 'member', 'ASYM-AK3D'),
  ('Anjali Sagar',   '24ug1byai093@bmsit.in',  (SELECT id FROM public.core_teams WHERE slug='event-management'), 'Member', 'member', 'ASYM-AS6T'),
  ('Rohit Rajkumar', '25ug1byai170@bmsit.in',  (SELECT id FROM public.core_teams WHERE slug='event-management'), 'Member', 'member', 'ASYM-RR8W'),
  ('M Yukthi',       '25ug1byai025@bmsit.in',  (SELECT id FROM public.core_teams WHERE slug='event-management'), 'Member', 'member', 'ASYM-MY5J'),
  ('C M Mohan',      '24ug1byai087@bmsit.in',  (SELECT id FROM public.core_teams WHERE slug='event-management'), 'Member', 'member', 'ASYM-CM2X'),
  ('Pranav Aditya',  '25ug1bycs0025@bmsit.in', (SELECT id FROM public.core_teams WHERE slug='event-management'), 'Member', 'member', 'ASYM-PA7B'),
  ('Adithya S Nayak','24ug1bybs051@bmsit.in',  (SELECT id FROM public.core_teams WHERE slug='event-management'), 'Member', 'member', 'ASYM-AN9F'),
  -- ── Event Design ──
  ('Sushma Gouda',   '24ug1bycs713@bmsit.in',  (SELECT id FROM public.core_teams WHERE slug='event-design'),     'Head',   'head',   'ASYM-SG4L'),
  ('Guhan M',        '25ug1byai161@bmsit.in',  (SELECT id FROM public.core_teams WHERE slug='event-design'),     'Member', 'member', 'ASYM-GM6R'),
  ('M Anusha',       '25ug1byai184@bmsit.in',  (SELECT id FROM public.core_teams WHERE slug='event-design'),     'Member', 'member', 'ASYM-MA1V'),
  ('Madhurya B O',   '24ug1bycs1001@bmsit.in', (SELECT id FROM public.core_teams WHERE slug='event-design'),     'Member', 'member', 'ASYM-MB8C'),
  ('Kezia Jose',     '25ug1bycs0541@bmsit.in', (SELECT id FROM public.core_teams WHERE slug='event-design'),     'Member', 'member', 'ASYM-KJ3N'),
  -- ── Marketing ──
  ('Azman Shaikh',   '24ug1bycs809@bmsit.in',  (SELECT id FROM public.core_teams WHERE slug='marketing'),        'Head',   'head',   'ASYM-AZ5G'),
  ('Archisha Gupta', '25ug1bycs0822@bmsit.in', (SELECT id FROM public.core_teams WHERE slug='marketing'),        'Member', 'member', 'ASYM-AG2P'),
  ('Mariam Hussain', '25ug1byec049@bmsit.in',  (SELECT id FROM public.core_teams WHERE slug='marketing'),        'Member', 'member', 'ASYM-MH7D'),
  -- ── Social Media ──
  ('Nayana G N',     '25ug1byai181@bmsit.in',  (SELECT id FROM public.core_teams WHERE slug='social-media'),     'Head',   'head',   'ASYM-NG4K'),
  ('Madhooja Kar',   '25ug1byec001@bmsit.in',  (SELECT id FROM public.core_teams WHERE slug='social-media'),     'Member', 'member', 'ASYM-MK9S'),
  ('S Aniditya',     '25ug1bycs0249@bmsit.in', (SELECT id FROM public.core_teams WHERE slug='social-media'),     'Member', 'member', 'ASYM-SA6T'),
  -- ── Technical ──
  ('G Tharun Tej',   '24ug1byai038@bmsit.in',  (SELECT id FROM public.core_teams WHERE slug='technical'),        'Head',   'head',   'ASYM-TT1M'),
  ('Anjali Kumari',  '25ug1byai421@bmsit.in',  (SELECT id FROM public.core_teams WHERE slug='technical'),        'Member', 'member', 'ASYM-AK8H')
ON CONFLICT (email) DO NOTHING;

-- ── Verify ────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.core_teams)   AS teams,
  (SELECT count(*) FROM public.core_members) AS members,
  (SELECT count(*) FROM public.core_members WHERE tier='council') AS council,
  (SELECT count(*) FROM public.core_members WHERE tier='head')    AS heads;

-- Hand each member their code privately:
SELECT name, position, COALESCE((SELECT name FROM public.core_teams t WHERE t.id = m.team_id), 'Council') AS team, access_code
FROM public.core_members m
ORDER BY tier, team, name;
