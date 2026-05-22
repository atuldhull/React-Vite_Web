-- ═══════════════════════════════════════════════════════════
--  MIGRATION 26 — CORE TEAM MEETINGS / EVENT SCHEDULER
--  Run the whole file in the Supabase SQL editor → Run.
--
--  Adds the meeting scheduler to the Core Team portal: the council
--  (or a team head, for their own team) posts a meeting; members
--  RSVP going / maybe / can't. Depends on migration 25.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.core_meetings (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL,
  description  TEXT,
  location     TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  team_id      UUID        REFERENCES public.core_teams(id)   ON DELETE CASCADE,  -- NULL = whole-club meeting
  created_by   UUID        REFERENCES public.core_members(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_core_meetings_when ON public.core_meetings(scheduled_at);

CREATE TABLE IF NOT EXISTS public.core_meeting_rsvps (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID        NOT NULL REFERENCES public.core_meetings(id) ON DELETE CASCADE,
  member_id  UUID        NOT NULL REFERENCES public.core_members(id)  ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT 'going'
               CHECK (status IN ('going','maybe','no')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uniq_meeting_rsvp UNIQUE (meeting_id, member_id)
);

ALTER TABLE public.core_meetings      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_meeting_rsvps DISABLE ROW LEVEL SECURITY;

SELECT
  (SELECT count(*) FROM public.core_meetings)      AS meetings,
  (SELECT count(*) FROM public.core_meeting_rsvps) AS rsvps;
