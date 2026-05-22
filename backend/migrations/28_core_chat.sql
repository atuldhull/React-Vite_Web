-- ═══════════════════════════════════════════════════════════
--  MIGRATION 28 — CORE TEAM ANONYMOUS CHAT
--  Run the whole file in the Supabase SQL editor → Run.
--
--  A live chat for the 25 core members. Everyone reads it
--  anonymously; the author of each message is stored but only ever
--  shown to the one owner account (gated in the controller). Depends
--  on migration 25.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.core_chat (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id UUID,
  author_name    TEXT,
  body           TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_core_chat_created ON public.core_chat(created_at);

ALTER TABLE public.core_chat DISABLE ROW LEVEL SECURITY;

SELECT count(*) AS core_chat_messages FROM public.core_chat;
