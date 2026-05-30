/**
 * controllers/problemController.js
 *
 * Problem-statement repository (SIH / GSoC / Kaggle / MLH / etc.).
 * Auth-gated READ — any logged-in student sees the full list.
 * Teacher/admin-only WRITE (enforced upstream by requireTeacher).
 *
 * Cross-tenant: this is a PLATFORM catalogue, not per-org content.
 * Direct `supabase` import is intentional — req.db (tenant proxy)
 * would auto-add an org_id filter we don't want here. The migration
 * leaves problem_statements.org_id off entirely.
 */

import supabase from "../config/supabase.js";
import { sendInternalError } from "../lib/errorResponse.js";
import { logger } from "../config/logger.js";

// Cap pagination so a curious client can't ship `limit=10000` and
// pin the DB. 50 is comfortably above the visible-page count at
// every viewport.
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 24;

// ════════════════════════════════════════════════════════════
// GET /api/problems
//
// Query params:
//   q           — free-text search (matches title + description)
//   domain      — exact match (AI/ML, Govt, Web, Web3, IoT, OpenSource)
//   source      — SIH | GSoC | Kaggle | MLH | Devfolio | Unstop | OpenSource
//   difficulty  — beginner | intermediate | advanced
//   tag         — single tag; can repeat for AND-of-tags
//   page        — 1-based
//   limit       — per page (capped at MAX_PAGE_SIZE)
// ════════════════════════════════════════════════════════════
export const listProblems = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit) || DEFAULT_PAGE_SIZE));
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    let query = supabase
      .from("problem_statements")
      .select(
        "id, slug, title, domain, difficulty, organisation, source, source_event, tags, created_at",
        { count: "exact" },
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(from, to);

    // Free-text search across title + description. PostgREST's
    // .or() with .ilike on two cols gives a usable "search bar"
    // without bringing in a fulltext index — fine for the ~1K row
    // scale this table will reach. Upgrade to tsvector if it gets
    // slow (won't until ~50K rows).
    if (req.query.q) {
      const needle = String(req.query.q).trim().slice(0, 100);
      // Escape the comma + parens that .or() treats specially.
      const safe = needle.replace(/[(),]/g, " ");
      if (safe) query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
    }

    if (req.query.domain)     query = query.eq("domain", String(req.query.domain).slice(0, 40));
    if (req.query.source)     query = query.eq("source", String(req.query.source).slice(0, 40));
    if (req.query.difficulty) query = query.eq("difficulty", String(req.query.difficulty).slice(0, 20));

    // tag filter — supports ?tag=python or ?tag=python&tag=ml.
    // PostgREST's .contains on a text[] column does set-containment.
    if (req.query.tag) {
      const tags = Array.isArray(req.query.tag) ? req.query.tag : [req.query.tag];
      const safeTags = tags.map((t) => String(t).slice(0, 40)).filter(Boolean);
      if (safeTags.length) query = query.contains("tags", safeTags);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return res.json({
      data:  data || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (err) {
    return sendInternalError(res, err, "list problems");
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/problems/facets
//
// Distinct values for the filter dropdowns (domain, source).
// Cached at request-handler level only — the table doesn't churn
// enough to justify Redis. Returns:
//   { domains: [...], sources: [...], tags: [...] }
// ════════════════════════════════════════════════════════════
export const getFacets = async (_req, res) => {
  try {
    // PostgREST doesn't have DISTINCT — fetch the columns and
    // dedupe in JS. The table is small enough that this is fine.
    const { data: rows, error } = await supabase
      .from("problem_statements")
      .select("domain, source, tags")
      .eq("is_active", true);
    if (error) throw error;

    const domains = new Set();
    const sources = new Set();
    const tags    = new Set();
    for (const r of rows || []) {
      if (r.domain) domains.add(r.domain);
      if (r.source) sources.add(r.source);
      for (const t of r.tags || []) tags.add(t);
    }

    return res.json({
      domains: [...domains].sort(),
      sources: [...sources].sort(),
      tags:    [...tags].sort(),
    });
  } catch (err) {
    return sendInternalError(res, err, "problem facets");
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/problems/:slugOrId
//
// Detail view. Accepts either the slug (preferred — used in URLs)
// or the UUID. is_active=false rows hidden from this endpoint too;
// a soft-deleted problem stays 404 for students.
// ════════════════════════════════════════════════════════════
export const getProblem = async (req, res) => {
  try {
    const handle = String(req.params.slugOrId || "").slice(0, 100);
    if (!handle) return res.status(400).json({ error: "slug or id required" });

    // Decide which column to query by — UUID has a fixed shape, slug
    // is kebab-case. Avoids the planner having to OR two scans.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handle);
    const col = isUuid ? "id" : "slug";

    const { data, error } = await supabase
      .from("problem_statements")
      .select("id, slug, title, description, how_to_start, domain, difficulty, organisation, source, source_event, official_url, dataset_links, resource_links, tags, created_at, updated_at")
      .eq(col, handle)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Problem statement not found" });

    return res.json(data);
  } catch (err) {
    return sendInternalError(res, err, "fetch problem");
  }
};

// ════════════════════════════════════════════════════════════
// POST /api/problems  (admin/teacher only — wired upstream)
//
// Body is validated by createProblemSchema. If slug is omitted, it
// gets generated from the title.
// ════════════════════════════════════════════════════════════
export const createProblem = async (req, res) => {
  try {
    const payload = { ...req.body };
    if (!payload.slug) payload.slug = slugify(payload.title);
    payload.created_by = req.session?.user?.id || null;

    const { data, error } = await supabase
      .from("problem_statements")
      .insert(payload)
      .select()
      .single();
    if (error) {
      // Slug collision → 409 (clearer than the generic 500).
      if (error.code === "23505") {
        return res.status(409).json({ error: "A problem with that slug already exists" });
      }
      throw error;
    }
    logger.info({ slug: data.slug, by: req.userId }, "problem created");
    return res.status(201).json(data);
  } catch (err) {
    return sendInternalError(res, err, "create problem");
  }
};

// ════════════════════════════════════════════════════════════
// PATCH /api/problems/:id  (admin/teacher only)
// ════════════════════════════════════════════════════════════
export const updateProblem = async (req, res) => {
  try {
    const id = String(req.params.id || "").slice(0, 100);
    const { data, error } = await supabase
      .from("problem_statements")
      .update(req.body)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      if (error.code === "PGRST116") return res.status(404).json({ error: "not found" });
      throw error;
    }
    return res.json(data);
  } catch (err) {
    return sendInternalError(res, err, "update problem");
  }
};

// ════════════════════════════════════════════════════════════
// DELETE /api/problems/:id  (admin/teacher only — soft delete)
//
// Sets is_active=false rather than deleting the row. Keeps any
// future "report stats by source" join intact.
// ════════════════════════════════════════════════════════════
export const deleteProblem = async (req, res) => {
  try {
    const id = String(req.params.id || "").slice(0, 100);
    const { error } = await supabase
      .from("problem_statements")
      .update({ is_active: false })
      .eq("id", id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    return sendInternalError(res, err, "delete problem");
  }
};

// ════════════════════════════════════════════════════════════
// helpers
// ════════════════════════════════════════════════════════════
function slugify(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFKD")                       // strip accents
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}
