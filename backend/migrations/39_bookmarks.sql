-- ════════════════════════════════════════════════════════════════
-- migration 39 — Bookmarks (universal "save for later")
-- ════════════════════════════════════════════════════════════════
--
-- One polymorphic table for saving any first-class entity: problems,
-- writeups, roadmaps. We use `(target_type, target_id)` rather than
-- per-entity tables because:
--
--   • The /saved page wants a single, time-ordered feed across all
--     types — a UNION over three tables would need indexes on three
--     created_at columns and an ORDER BY in app code.
--   • Adding a new bookmarkable type (e.g. event, certificate) later
--     is a CHECK-constraint edit, not a new table.
--
-- target_id is stored as text rather than uuid because some entities
-- might end up with non-uuid handles later (resource URLs in roadmap
-- steps, for instance). For the three current types it's always a
-- uuid in practice — we just don't enforce the shape at the DB level.
--
-- Cross-tenant by design (matches the catalogue). RLS disabled per
-- the data-plane policy from migration 21.
--
-- IDEMPOTENT.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.bookmarks (
  user_id       UUID        NOT NULL,
  target_type   TEXT        NOT NULL CHECK (target_type IN ('problem','writeup','roadmap')),
  target_id     TEXT        NOT NULL,
  note          TEXT,                                  -- optional 200-char personal note ("come back when I learn DP")
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, target_type, target_id)
);

ALTER TABLE public.bookmarks DISABLE ROW LEVEL SECURITY;

-- "Show me everything I bookmarked, newest first" — the /saved page.
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_created
  ON public.bookmarks (user_id, created_at DESC);

-- "How many people bookmarked this thing?" — used by the writeup +
-- roadmap detail pages to show a small social-proof count.
CREATE INDEX IF NOT EXISTS idx_bookmarks_target
  ON public.bookmarks (target_type, target_id);

-- ─── Verify ────────────────────────────────────────────────────
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables
           WHERE table_schema='public' AND table_name='bookmarks') AS table_present,
  (SELECT COUNT(*) FROM pg_indexes
    WHERE schemaname='public' AND tablename='bookmarks') AS index_count;
