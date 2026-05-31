-- ════════════════════════════════════════════════════════════════
-- migration 40 — Community roadmap authoring
-- ════════════════════════════════════════════════════════════════
--
-- Lets any student create and share a custom roadmap. The seed
-- roadmaps from migration 37 stay as the "Featured" tier; community
-- submissions live under a "From the community" surface once they
-- pass moderation.
--
-- Three new fields on `roadmaps`:
--   author_id          — the student who created it (null = seeded)
--   is_featured        — admin-promoted to the "Featured" tier
--   submission_status  — draft | pending | approved | rejected
--
-- Seeded roadmaps from migration 37 get `submission_status='approved'
-- + is_featured=TRUE` so the list endpoint can keep showing them.
--
-- The list endpoint surfaces:
--   tier 1 — featured (admin-curated)
--   tier 2 — community-approved
--   tier 3 — your own drafts/pending (only visible to author)
--
-- IDEMPOTENT.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.roadmaps
  ADD COLUMN IF NOT EXISTS author_id          UUID,
  ADD COLUMN IF NOT EXISTS is_featured        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS submission_status  TEXT    NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS reject_reason      TEXT;

-- CHECK on the enum — kept as a CHECK (not enum type) for ALTER-ability.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roadmaps_submission_status_chk') THEN
    ALTER TABLE public.roadmaps
      ADD CONSTRAINT roadmaps_submission_status_chk
      CHECK (submission_status IN ('draft','pending','approved','rejected'));
  END IF;
END $$;

-- Backfill: every existing roadmap is admin-curated → featured +
-- approved. The seed (migration 37) didn't set these because the
-- columns didn't exist yet.
UPDATE public.roadmaps
   SET is_featured = TRUE, submission_status = 'approved'
 WHERE author_id IS NULL
   AND (is_featured IS DISTINCT FROM TRUE OR submission_status IS DISTINCT FROM 'approved');

-- Indexes for the three list-tier surfaces.
CREATE INDEX IF NOT EXISTS idx_roadmaps_status ON public.roadmaps (submission_status);
CREATE INDEX IF NOT EXISTS idx_roadmaps_featured ON public.roadmaps (is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_roadmaps_author ON public.roadmaps (author_id) WHERE author_id IS NOT NULL;

-- ─── Verify ────────────────────────────────────────────────────
SELECT
  COUNT(*)                                                  AS roadmaps,
  COUNT(*) FILTER (WHERE is_featured = TRUE)                AS featured,
  COUNT(*) FILTER (WHERE submission_status = 'approved')    AS approved,
  COUNT(*) FILTER (WHERE submission_status = 'pending')     AS pending,
  COUNT(*) FILTER (WHERE author_id IS NOT NULL)             AS community
FROM public.roadmaps;
