/**
 * controllers/searchController.js
 *
 * Global free-text search across the platform's public-ish surfaces:
 *
 *   • problems   — title / description ilike on problem_statements
 *   • roadmaps   — title / summary  ilike on approved roadmaps
 *   • writeups   — title / body     ilike on published problem_writeups
 *   • portfolios — name / handle    ilike on public_portfolio students
 *
 * Single endpoint, one query param. The four sub-queries fan out in
 * parallel via Promise.all so the wall-clock is the slowest single
 * lookup (typically <100ms on Supabase pooler).
 *
 * Auth — requireAuth at the route level. We could relax it for
 * portfolios + roadmaps (they're public share targets), but the
 * command palette is a logged-in convenience and gating the whole
 * endpoint dodges a per-row visibility check.
 *
 * Notes:
 *   - PostgREST `.or()` parses `,` and `()` as syntax, so we
 *     scrub them from the user-supplied needle before interpolating.
 *   - Description / body / summary are LARGE columns; we never ship
 *     them back in the response — just the title + a short snippet.
 *   - Result count caps at 8 per group; the palette can't show
 *     more than that without becoming a list page.
 *   - No tsvector index yet — table sizes (~1K problems, ~10 roadmaps,
 *     ~100 writeups, ~500 students) are well below the row count
 *     where ilike scans start to bite. Switch to fulltext when one
 *     of these groups crosses ~10K rows.
 */

import supabase from "../config/supabase.js";
import { logger } from "../config/logger.js";

const MAX_PER_GROUP   = 8;
const MIN_QUERY_CHARS = 2;
const MAX_QUERY_CHARS = 60;

const VALID_TYPES = new Set(["problem", "roadmap", "writeup", "portfolio"]);

/** Sanitize the user-typed needle so it's safe to drop into PostgREST
 *  `.or("col.ilike.%X%")` strings. Commas and parens collapse to a
 *  space — PostgREST treats them as logical separators. */
function sanitizeNeedle(raw) {
  return String(raw || "")
    .trim()
    .slice(0, MAX_QUERY_CHARS)
    .replace(/[(),]/g, " ");
}

/** Shorten a longer text column to a hit-context snippet. We strip
 *  markdown emphasis so search results read like prose, not source. */
function snippet(text, max = 140) {
  if (!text) return null;
  const cleaned = String(text)
    .replace(/[*_`>#~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1) + "…";
}

// ════════════════════════════════════════════════════════════════
// GET /api/search?q=foo&types=problem,roadmap&limit=8
//
// Response:
//   {
//     q:       "foo",
//     groups:  {
//       problem:   [{ id, slug, title, source, difficulty, snippet }],
//       roadmap:   [{ id, slug, title, snippet }],
//       writeup:   [{ id, problem_slug, problem_title, title, snippet }],
//       portfolio: [{ user_id, handle, name, headline }],
//     },
//     total:   42,
//   }
// ════════════════════════════════════════════════════════════════
export const searchAll = async (req, res) => {
  try {
    const needle = sanitizeNeedle(req.query.q);
    if (needle.length < MIN_QUERY_CHARS) {
      return res.json({ q: needle, groups: emptyGroups(), total: 0 });
    }

    const requestedTypes = parseTypes(req.query.types);
    const perGroup = clampLimit(req.query.limit);

    const wants = (t) => requestedTypes.has(t);

    // Fire the four lookups in parallel. Each is bounded to MAX_PER_GROUP
    // rows so total work is constant regardless of query.
    const [problems, roadmaps, writeups, portfolios] = await Promise.all([
      wants("problem")   ? fetchProblems(needle, perGroup)   : Promise.resolve([]),
      wants("roadmap")   ? fetchRoadmaps(needle, perGroup)   : Promise.resolve([]),
      wants("writeup")   ? fetchWriteups(needle, perGroup)   : Promise.resolve([]),
      wants("portfolio") ? fetchPortfolios(needle, perGroup) : Promise.resolve([]),
    ]);

    return res.json({
      q: needle,
      groups: {
        problem:   problems,
        roadmap:   roadmaps,
        writeup:   writeups,
        portfolio: portfolios,
      },
      total: problems.length + roadmaps.length + writeups.length + portfolios.length,
    });
  } catch (err) {
    logger.error({ err }, "search failed");
    return res.status(500).json({ error: "Search unavailable" });
  }
};

// ── Helpers ─────────────────────────────────────────────────────

function parseTypes(raw) {
  if (!raw) return new Set(VALID_TYPES);
  const tokens = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
  const ok = tokens.filter((t) => VALID_TYPES.has(t));
  return ok.length ? new Set(ok) : new Set(VALID_TYPES);
}

function clampLimit(raw) {
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n > 0 && n <= MAX_PER_GROUP) return n;
  return MAX_PER_GROUP;
}

function emptyGroups() {
  return { problem: [], roadmap: [], writeup: [], portfolio: [] };
}

async function fetchProblems(needle, limit) {
  const { data, error } = await supabase
    .from("problem_statements")
    .select("id, slug, title, source, difficulty, description")
    .eq("is_active", true)
    .or(`title.ilike.%${needle}%,description.ilike.%${needle}%`)
    .limit(limit);

  if (error) {
    logger.warn({ err: error }, "search/problems");
    return [];
  }
  return (data || []).map((p) => ({
    id:         p.id,
    slug:       p.slug,
    title:      p.title,
    source:     p.source,
    difficulty: p.difficulty,
    snippet:    snippet(p.description),
  }));
}

async function fetchRoadmaps(needle, limit) {
  const { data, error } = await supabase
    .from("roadmaps")
    .select("id, slug, title, summary, is_featured")
    .eq("is_active", true)
    .eq("submission_status", "approved")
    .or(`title.ilike.%${needle}%,summary.ilike.%${needle}%`)
    .order("is_featured", { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn({ err: error }, "search/roadmaps");
    return [];
  }
  return (data || []).map((r) => ({
    id:         r.id,
    slug:       r.slug,
    title:      r.title,
    snippet:    snippet(r.summary),
    is_featured: !!r.is_featured,
  }));
}

async function fetchWriteups(needle, limit) {
  // Hits problem_writeups, then joins one round-trip for the parent
  // problem's slug + title so the result row carries enough context
  // for the palette to navigate (slug → /app/problems/:slug).
  const { data, error } = await supabase
    .from("problem_writeups")
    .select("id, problem_id, title, body, vote_count")
    .eq("is_published", true)
    .or(`title.ilike.%${needle}%,body.ilike.%${needle}%`)
    .order("vote_count", { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn({ err: error }, "search/writeups");
    return [];
  }
  if (!data || !data.length) return [];

  // Resolve parent problems in one batch.
  const problemIds = [...new Set(data.map((w) => w.problem_id))];
  const { data: parents } = await supabase
    .from("problem_statements")
    .select("id, slug, title")
    .in("id", problemIds);

  const parentById = new Map((parents || []).map((p) => [p.id, p]));

  return data.map((w) => {
    const parent = parentById.get(w.problem_id) || {};
    return {
      id:            w.id,
      title:         w.title,
      problem_id:    w.problem_id,
      problem_slug:  parent.slug || null,
      problem_title: parent.title || null,
      snippet:       snippet(w.body),
      vote_count:    w.vote_count || 0,
    };
  });
}

async function fetchPortfolios(needle, limit) {
  const { data, error } = await supabase
    .from("students")
    .select("user_id, name, handle, portfolio_headline")
    .eq("public_portfolio", true)
    .eq("is_active", true)
    .not("handle", "is", null)
    .or(`name.ilike.%${needle}%,handle.ilike.%${needle}%`)
    .limit(limit);

  if (error) {
    logger.warn({ err: error }, "search/portfolios");
    return [];
  }
  return (data || []).map((s) => ({
    user_id:  s.user_id,
    handle:   s.handle,
    name:     s.name,
    headline: s.portfolio_headline || null,
  }));
}
