-- ════════════════════════════════════════════════════════════════
-- migration 42 — comments on writeups
-- ════════════════════════════════════════════════════════════════
--
-- Closes the engagement loop on /problems/:slug. Writeups already
-- support upvotes (migration 35); this adds plain prose comments so
-- a viewer can ask the author "what about edge case X?" without
-- having to write their own writeup.
--
-- DESIGN CALLS
--   • FLAT list, not threaded. Two reasons: (1) writeup discussion
--     is short-form Q&A, not a forum — depth invites long parallel
--     threads no one reads, and (2) shipping flat first keeps the
--     migration + UI under 200 LOC. If threading turns out to be
--     necessary, parent_id can be added in a follow-up — the existing
--     `id` column is already a stable target.
--   • Soft-delete via `deleted_at` rather than a hard DELETE. Lets
--     us render "[comment removed]" in-place so the conversation
--     doesn't lose its shape, and gives mods a recovery window.
--   • Body capped at 2000 chars in-DB via CHECK (not just the
--     validator) — a defence in depth against a misbehaving client.
--
-- RLS DISABLED — matches the data-plane policy from migration 21.
-- Access control happens in the controller (requireAuth on writes,
-- author/admin check on edit / delete).
--
-- IDEMPOTENT.
-- ════════════════════════════════════════════════════════════════

-- ─── writeup_comments ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.writeup_comments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  writeup_id  UUID        NOT NULL REFERENCES public.problem_writeups(id) ON DELETE CASCADE,
  author_id   UUID        NOT NULL,
  body        TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited      BOOLEAN     NOT NULL DEFAULT false,    -- true once a non-trivial edit lands
  deleted_at  TIMESTAMPTZ                            -- soft-delete marker; NULL = visible
);

ALTER TABLE public.writeup_comments DISABLE ROW LEVEL SECURITY;

-- Per-writeup chronological listing — primary read path.
CREATE INDEX IF NOT EXISTS idx_writeup_comments_writeup
  ON public.writeup_comments (writeup_id, created_at DESC);

-- "My comments" — used by future activity feed / moderation surface.
CREATE INDEX IF NOT EXISTS idx_writeup_comments_author
  ON public.writeup_comments (author_id, created_at DESC);

-- ─── Comment-count denormalisation on problem_writeups ──────────
-- Avoids a per-card count(*) when rendering the writeup list. Like
-- vote_count from migration 35, it's a denormalised int kept in sync
-- by AFTER triggers. Idempotent: only adds if not present.
ALTER TABLE public.problem_writeups
  ADD COLUMN IF NOT EXISTS comment_count INTEGER NOT NULL DEFAULT 0;

-- Trigger function — increments on insert (visible), decrements on
-- soft-delete (deleted_at -> NOT NULL) and on hard-delete.
CREATE OR REPLACE FUNCTION public.writeup_comments_sync_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.deleted_at IS NULL THEN
      UPDATE public.problem_writeups
         SET comment_count = comment_count + 1
       WHERE id = NEW.writeup_id;
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- transition NULL → NOT NULL (a soft-delete) decrements.
    -- transition NOT NULL → NULL (an undelete, future) increments.
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE public.problem_writeups
         SET comment_count = GREATEST(0, comment_count - 1)
       WHERE id = NEW.writeup_id;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE public.problem_writeups
         SET comment_count = comment_count + 1
       WHERE id = NEW.writeup_id;
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.deleted_at IS NULL THEN
      UPDATE public.problem_writeups
         SET comment_count = GREATEST(0, comment_count - 1)
       WHERE id = OLD.writeup_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_writeup_comments_sync ON public.writeup_comments;
CREATE TRIGGER trg_writeup_comments_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.writeup_comments
  FOR EACH ROW EXECUTE FUNCTION public.writeup_comments_sync_count();

-- ─── updated_at trigger ─────────────────────────────────────────
-- Distinct from the `edited` flag — updated_at moves on every UPDATE
-- (including a soft-delete), `edited` flips once when the BODY itself
-- is changed by the author.
CREATE OR REPLACE FUNCTION public.writeup_comments_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_writeup_comments_updated_at ON public.writeup_comments;
CREATE TRIGGER trg_writeup_comments_updated_at
  BEFORE UPDATE ON public.writeup_comments
  FOR EACH ROW EXECUTE FUNCTION public.writeup_comments_set_updated_at();

-- ─── Verify ─────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema='public' AND table_name='writeup_comments') AS table_present,
  (SELECT COUNT(*) FROM pg_indexes
    WHERE schemaname='public' AND tablename='writeup_comments') AS index_count,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='problem_writeups'
      AND column_name='comment_count') AS denorm_col_present;
