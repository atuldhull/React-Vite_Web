-- ═══════════════════════════════════════════════════════════
--  MIGRATION 27 — LINK CORE MEMBERS TO EXISTING STUDENT ACCOUNTS
--  Run the whole file in the Supabase SQL editor → Run.
--
--  Several of the 25 seeded core members already have a normal
--  student account on the site. This "clubs" them: it backfills
--  core_members.user_id from the matching students row (same email),
--  so those people are recognised as core members the moment they
--  log in — no code redemption needed.
--
--  Members whose seeded email does NOT match their student account
--  simply redeem their ASYM-XXXX code as usual (the code is the
--  credential — see members.js redeemCode).
--
--  Idempotent: only touches rows that aren't linked yet. Safe re-run.
-- ═══════════════════════════════════════════════════════════

UPDATE public.core_members cm
SET user_id     = s.user_id,
    redeemed_at = COALESCE(cm.redeemed_at, NOW())
FROM public.students s
WHERE cm.user_id IS NULL
  AND s.user_id IS NOT NULL
  AND LOWER(TRIM(cm.email)) = LOWER(TRIM(s.email));

-- Show who got auto-linked and who still needs to redeem a code.
SELECT
  name,
  email,
  CASE WHEN user_id IS NULL THEN 'needs code' ELSE 'linked' END AS status,
  access_code
FROM public.core_members
ORDER BY (user_id IS NOT NULL), name;
