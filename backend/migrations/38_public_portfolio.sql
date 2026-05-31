-- ════════════════════════════════════════════════════════════════
-- migration 38 — Public portfolio pages (/u/:handle)
-- ════════════════════════════════════════════════════════════════
--
-- Adds shareable, auth-free portfolio URLs. Every student gets a
-- stable kebab-case `handle` (auto-generated from name + a short
-- random suffix). Opt-in via `public_portfolio` — DEFAULT FALSE
-- because /u/:handle is INTERNET-PUBLIC (no login required), which
-- is a stronger privacy stance than the existing in-org profile.
--
-- The student can also customise a `portfolio_headline` (~140 chars)
-- and a `portfolio_socials` jsonb (github / linkedin / twitter /
-- website). These appear only on the public portfolio.
--
-- IDEMPOTENT — re-running is safe.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS handle               TEXT,
  ADD COLUMN IF NOT EXISTS public_portfolio     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS portfolio_headline   TEXT,
  ADD COLUMN IF NOT EXISTS portfolio_socials    JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ─── handle backfill ──────────────────────────────────────────
-- Generate kebab-case handles from name + 6-char random suffix.
-- Random suffix avoids collisions on common names (5 "Aman" → 5
-- different handles). Only fires on rows where handle IS NULL.
--
-- Random suffix uses substr(md5(random()::text || id::text), 0, 7)
-- — cryptographically weak but fine for collision avoidance on a
-- ~hundred-student table.
UPDATE public.students
   SET handle = lower(
          regexp_replace(
            COALESCE(NULLIF(trim(name), ''), 'user'),
            '[^a-zA-Z0-9]+', '-', 'g'
          )
        ) || '-' || substr(md5(random()::text || COALESCE(id::text, '')), 1, 6)
 WHERE handle IS NULL;

-- Trim any trailing/leading hyphens that the regex would have left
-- (e.g. "  Atul Dhull  " → "-atul-dhull-XXXXXX").
UPDATE public.students
   SET handle = regexp_replace(handle, '^-+|-+$', '', 'g')
 WHERE handle ~ '^-' OR handle ~ '-$';

-- UNIQUE constraint AFTER backfill so the ADD COLUMN doesn't fail
-- with conflicting NULLs. Conditional UNIQUE works around the case
-- where the backfill produced an unlikely collision — only fires
-- once handles are populated.
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_handle
  ON public.students (handle)
  WHERE handle IS NOT NULL;

-- Lookup index for the public portfolio fetch (handle → row).
-- Covered by the unique index above; declared explicitly for clarity.

-- ─── Verify ────────────────────────────────────────────────────
SELECT
  COUNT(*)                                                  AS total_students,
  COUNT(handle)                                             AS with_handle,
  COUNT(*) FILTER (WHERE public_portfolio = TRUE)           AS public_portfolios,
  COUNT(DISTINCT handle)                                    AS distinct_handles
FROM public.students;
