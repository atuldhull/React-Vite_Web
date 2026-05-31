/**
 * controllers/bookmarkController.js
 *
 * Universal save-for-later across problems, writeups, and roadmaps.
 * The polymorphic table lets one feed page show everything saved
 * across types in a single time-ordered list — the /saved page on
 * the frontend.
 *
 * Cross-tenant by design (matches the catalogue and engagement
 * controllers — see the tenant-scoping invariant test's allowlist).
 *
 * AUTH: every endpoint is requireAuth and self-scopes on req.userId.
 * A student can only bookmark / unbookmark / list their OWN saves.
 */

import supabase from "../config/supabase.js";
import { sendInternalError } from "../lib/errorResponse.js";

const ALLOWED_TYPES = new Set(["problem", "writeup", "roadmap"]);

// ────────────────────────────────────────────────────────────
// POST /api/bookmarks/:type/:id  — toggle
//
// Returns { saved: boolean } reflecting the post-toggle state.
// Idempotent — re-calling on the same target flips.
// ────────────────────────────────────────────────────────────
export const toggleBookmark = async (req, res) => {
  try {
    const type = String(req.params.type || "").toLowerCase();
    const id   = String(req.params.id   || "").slice(0, 100);
    if (!ALLOWED_TYPES.has(type)) return res.status(400).json({ error: "bad target_type" });
    if (!id) return res.status(400).json({ error: "id required" });

    // Existing row?
    const { data: existing } = await supabase
      .from("bookmarks")
      .select("user_id")
      .eq("user_id", req.userId)
      .eq("target_type", type)
      .eq("target_id", id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("bookmarks")
        .delete()
        .eq("user_id", req.userId)
        .eq("target_type", type)
        .eq("target_id", id);
      if (error) throw error;
      return res.json({ saved: false });
    }

    const { error } = await supabase
      .from("bookmarks")
      .insert({ user_id: req.userId, target_type: type, target_id: id });
    if (error && error.code !== "23505") throw error;
    return res.json({ saved: true });
  } catch (err) {
    return sendInternalError(res, err, "toggle bookmark");
  }
};

// ────────────────────────────────────────────────────────────
// GET /api/bookmarks  — viewer's saved feed (all types)
//
// Returns a single time-ordered feed enriched with each target's
// display metadata. We do three follow-up reads keyed by id rather
// than three joins because PostgREST nested-select syntax doesn't
// reach across non-FK relationships (target_id is polymorphic).
//
// Query params:
//   type — optional filter (problem | writeup | roadmap)
//   limit / page — pagination
// ────────────────────────────────────────────────────────────
export const listMyBookmarks = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 30));
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;
    const filterType = req.query.type && ALLOWED_TYPES.has(req.query.type) ? req.query.type : null;

    let q = supabase
      .from("bookmarks")
      .select("target_type, target_id, note, created_at", { count: "exact" })
      .eq("user_id", req.userId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (filterType) q = q.eq("target_type", filterType);

    const { data, error, count } = await q;
    if (error) throw error;
    const rows = data || [];

    // Group target ids by type for the enrichment fan-out.
    const byType = { problem: [], writeup: [], roadmap: [] };
    for (const r of rows) {
      if (byType[r.target_type]) byType[r.target_type].push(r.target_id);
    }

    const [probsRes, writeupsRes, roadmapsRes] = await Promise.all([
      byType.problem.length
        ? supabase
            .from("problem_statements")
            .select("id, slug, title, domain, difficulty, source, source_event, tags")
            .in("id", byType.problem)
        : Promise.resolve({ data: [] }),
      byType.writeup.length
        ? supabase
            .from("problem_writeups")
            .select("id, title, user_id, problem_id, vote_count, created_at")
            .in("id", byType.writeup)
        : Promise.resolve({ data: [] }),
      byType.roadmap.length
        ? supabase
            .from("roadmaps")
            .select("id, slug, title, summary, difficulty, topic, cover_emoji")
            .in("id", byType.roadmap)
        : Promise.resolve({ data: [] }),
    ]);

    // Map for O(1) lookup during enrichment.
    const probsById    = new Map((probsRes.data    || []).map((p) => [p.id, p]));
    const writeupsById = new Map((writeupsRes.data || []).map((w) => [w.id, w]));
    const roadmapsById = new Map((roadmapsRes.data || []).map((r) => [r.id, r]));

    // Resolve the parent problem for each writeup (so the /saved
    // page can link "writeup ON problem X").
    const writeupProblemIds = [...new Set((writeupsRes.data || []).map((w) => w.problem_id).filter(Boolean))];
    let writeupParents = new Map();
    if (writeupProblemIds.length) {
      const { data: parents } = await supabase
        .from("problem_statements")
        .select("id, slug, title")
        .in("id", writeupProblemIds);
      writeupParents = new Map((parents || []).map((p) => [p.id, p]));
    }

    const enriched = rows.map((r) => {
      if (r.target_type === "problem")  return { ...r, target: probsById.get(r.target_id) || null };
      if (r.target_type === "writeup")  {
        const w = writeupsById.get(r.target_id);
        if (!w) return { ...r, target: null };
        return { ...r, target: { ...w, parent_problem: writeupParents.get(w.problem_id) || null } };
      }
      if (r.target_type === "roadmap")  return { ...r, target: roadmapsById.get(r.target_id) || null };
      return { ...r, target: null };
    });

    return res.json({
      data:  enriched,
      total: count || 0,
      page,
      limit,
    });
  } catch (err) {
    return sendInternalError(res, err, "list bookmarks");
  }
};

// ────────────────────────────────────────────────────────────
// GET /api/bookmarks/state?type=problem&ids=a,b,c
//
// Returns { [id]: true } for ids the viewer has bookmarked.
// Used by list pages to bulk-decorate cards on first render so
// each star button knows its initial state without N+1 fetches.
// ────────────────────────────────────────────────────────────
export const bookmarkState = async (req, res) => {
  try {
    const type = String(req.query.type || "").toLowerCase();
    if (!ALLOWED_TYPES.has(type)) return res.status(400).json({ error: "bad target_type" });
    const ids = String(req.query.ids || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100);    // bound — don't let a curious client ship 10K ids
    if (!ids.length) return res.json({});

    const { data, error } = await supabase
      .from("bookmarks")
      .select("target_id")
      .eq("user_id", req.userId)
      .eq("target_type", type)
      .in("target_id", ids);
    if (error) throw error;

    const out = Object.create(null);
    for (const r of data || []) out[r.target_id] = true;
    return res.json(out);
  } catch (err) {
    return sendInternalError(res, err, "bookmark state");
  }
};
