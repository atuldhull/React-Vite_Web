/**
 * controllers/roadmapController.js
 *
 * Learning roadmaps — sequenced collections of problems + external
 * resources + free-form checkpoints. Auth-gated READ. Admin/teacher
 * WRITE will come in a follow-up; the seed (migration 37) is enough
 * to launch.
 *
 * Cross-tenant — same data-plane policy as the problem catalogue.
 * Direct `supabase` import (not req.db) because we deliberately don't
 * want the tenant proxy to scope this table.
 */

import supabase from "../config/supabase.js";
import { sendInternalError } from "../lib/errorResponse.js";
import { logger } from "../config/logger.js";
import { sendNotification } from "./notificationController.js";

const ALLOWED_DIFF = new Set(["beginner", "intermediate", "advanced"]);

// kebab-case from title; matches the problem-statement slugifier.
function slugify(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

// ════════════════════════════════════════════════════════════
// GET /api/roadmaps
//
// List card data + viewer's progress count per roadmap (so the
// catalogue can show "3 / 7 done" badges without per-card N+1 fetches).
// ════════════════════════════════════════════════════════════
export const listRoadmaps = async (req, res) => {
  try {
    // We return three buckets in one call so the frontend can render
    // "Featured", "Community", and "Your drafts" without three
    // round-trips. Featured + approved community are visible to
    // everyone; drafts/pending only to the author.
    const tier = String(req.query.tier || "all").toLowerCase();

    let query = supabase
      .from("roadmaps")
      .select("id, slug, title, summary, difficulty, topic, est_hours, cover_emoji, is_featured, submission_status, author_id, reject_reason, created_at")
      .eq("is_active", true)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: true });

    if (tier === "featured") {
      query = query.eq("is_featured", true).eq("submission_status", "approved");
    } else if (tier === "community") {
      query = query.eq("is_featured", false).eq("submission_status", "approved");
    } else if (tier === "mine") {
      query = query.eq("author_id", req.userId);
    } else {
      // Default — everything published + the viewer's own non-public rows.
      // PostgREST `or()` lets us combine the two sets.
      query = query.or(`submission_status.eq.approved,author_id.eq.${req.userId}`);
    }

    const { data: roadmaps, error } = await query;
    if (error) throw error;

    // Total step count per roadmap. One round-trip + a JS-side group.
    const ids = (roadmaps || []).map((r) => r.id);
    const totals = new Map();
    if (ids.length) {
      const { data: steps } = await supabase
        .from("roadmap_steps")
        .select("roadmap_id")
        .in("roadmap_id", ids);
      for (const s of steps || []) totals.set(s.roadmap_id, (totals.get(s.roadmap_id) || 0) + 1);
    }

    // Viewer progress count per roadmap.
    const done = new Map();
    if (ids.length) {
      const { data: prog } = await supabase
        .from("roadmap_progress")
        .select("roadmap_id")
        .in("roadmap_id", ids)
        .eq("user_id", req.userId);
      for (const p of prog || []) done.set(p.roadmap_id, (done.get(p.roadmap_id) || 0) + 1);
    }

    // Author display names — one lookup, then map.
    const authorIds = [...new Set((roadmaps || []).map((r) => r.author_id).filter(Boolean))];
    let authorsById = new Map();
    if (authorIds.length) {
      const { data: authors } = await supabase
        .from("students")
        .select("user_id, name, handle")
        .in("user_id", authorIds);
      authorsById = new Map((authors || []).map((a) => [a.user_id, a]));
    }

    const list = (roadmaps || []).map((r) => ({
      ...r,
      step_count:     totals.get(r.id) || 0,
      done_count:     done.get(r.id) || 0,
      author:         r.author_id ? (authorsById.get(r.author_id) || null) : null,
    }));

    return res.json({ data: list });
  } catch (err) {
    return sendInternalError(res, err, "list roadmaps");
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/roadmaps/:slug
//
// Detail with all steps + viewer's per-step completion. Problem
// references on steps are joined to the catalogue so the frontend
// can render the problem title without a follow-up fetch.
// ════════════════════════════════════════════════════════════
export const getRoadmap = async (req, res) => {
  try {
    const slug = String(req.params.slug || "").slice(0, 100);
    if (!slug) return res.status(400).json({ error: "slug required" });

    const { data: roadmap, error } = await supabase
      .from("roadmaps")
      .select("id, slug, title, summary, description, difficulty, topic, est_hours, cover_emoji, author_id, is_featured, submission_status, reject_reason, created_at, updated_at")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!roadmap) return res.status(404).json({ error: "Roadmap not found" });

    // Drafts / pending / rejected roadmaps are only visible to the
    // author (and admins/teachers — they need to moderate). Everyone
    // else sees a 404.
    const isOwner     = roadmap.author_id === req.userId;
    const isModerator = ["admin", "teacher", "super_admin"].includes(req.userRole);
    if (roadmap.submission_status !== "approved" && !isOwner && !isModerator) {
      return res.status(404).json({ error: "Roadmap not found" });
    }

    // Author display info.
    let author = null;
    if (roadmap.author_id) {
      const { data: a } = await supabase
        .from("students")
        .select("user_id, name, handle, avatar_emoji")
        .eq("user_id", roadmap.author_id)
        .maybeSingle();
      author = a || null;
    }

    const { data: steps, error: sErr } = await supabase
      .from("roadmap_steps")
      .select("id, position, title, description, problem_id, resource_url, resource_label, est_minutes")
      .eq("roadmap_id", roadmap.id)
      .order("position", { ascending: true });
    if (sErr) throw sErr;

    // Problem-reference enrichment.
    const problemIds = [...new Set((steps || []).map((s) => s.problem_id).filter(Boolean))];
    let problemsById = new Map();
    if (problemIds.length) {
      const { data: probs } = await supabase
        .from("problem_statements")
        .select("id, slug, title, source, difficulty")
        .in("id", problemIds);
      problemsById = new Map((probs || []).map((p) => [p.id, p]));
    }

    // Viewer's completion flags.
    const stepIds = (steps || []).map((s) => s.id);
    let doneSet = new Set();
    if (stepIds.length) {
      const { data: prog } = await supabase
        .from("roadmap_progress")
        .select("step_id")
        .in("step_id", stepIds)
        .eq("user_id", req.userId);
      doneSet = new Set((prog || []).map((p) => p.step_id));
    }

    const enrichedSteps = (steps || []).map((s) => ({
      ...s,
      problem: s.problem_id ? (problemsById.get(s.problem_id) || null) : null,
      done:    doneSet.has(s.id),
    }));

    return res.json({
      ...roadmap,
      steps:        enrichedSteps,
      done_count:   doneSet.size,
      step_count:   enrichedSteps.length,
      author,
      is_owner:     isOwner,
    });
  } catch (err) {
    return sendInternalError(res, err, "fetch roadmap");
  }
};

// ════════════════════════════════════════════════════════════
// POST /api/roadmaps/steps/:stepId/toggle
//
// Toggle the viewer's completion on a single step. Idempotent —
// re-clicking removes the row.
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// AUTHORING
// ════════════════════════════════════════════════════════════

// Validate the parts of the create/update payload that we'll write.
// Returns either { payload } (good) or { error } (responded already).
function validateRoadmapBody(body) {
  const errs = [];
  const out = {};

  if (typeof body?.title === "string") {
    const t = body.title.trim();
    if (t.length < 3 || t.length > 120) errs.push("title must be 3-120 chars");
    out.title = t;
  }
  if (typeof body?.summary === "string") {
    const s = body.summary.trim();
    if (s.length < 10 || s.length > 240) errs.push("summary must be 10-240 chars");
    out.summary = s;
  }
  if (typeof body?.description === "string") {
    out.description = body.description.trim().slice(0, 4000) || null;
  }
  if (typeof body?.difficulty === "string") {
    const d = body.difficulty.trim();
    if (!ALLOWED_DIFF.has(d)) errs.push("difficulty must be beginner|intermediate|advanced");
    else out.difficulty = d;
  }
  if (typeof body?.topic === "string") {
    const t = body.topic.trim();
    if (t.length < 2 || t.length > 60) errs.push("topic must be 2-60 chars");
    else out.topic = t;
  }
  if (body?.est_hours != null) {
    const n = Number(body.est_hours);
    if (!Number.isFinite(n) || n < 0 || n > 1000) errs.push("est_hours 0-1000");
    else out.est_hours = Math.round(n);
  }
  if (typeof body?.cover_emoji === "string") {
    out.cover_emoji = body.cover_emoji.trim().slice(0, 8) || null;
  }
  return { errs, payload: out };
}

// ─── POST /api/roadmaps ───────────────────────────────────────
// Any authed student can create. The roadmap starts as `draft`;
// the author calls submit() to move it to `pending`.
export const createRoadmap = async (req, res) => {
  try {
    const { errs, payload } = validateRoadmapBody(req.body);
    if (errs.length) return res.status(400).json({ error: errs.join("; ") });
    if (!payload.title || !payload.summary || !payload.topic) {
      return res.status(400).json({ error: "title, summary, topic are required" });
    }

    // Unique slug — try the natural slug first, suffix with a short
    // random tail if it collides. We try 5 times then give up.
    const baseSlug = slugify(payload.title) || "roadmap";
    let slug = baseSlug;
    for (let i = 0; i < 5; i++) {
      const { data: clash } = await supabase
        .from("roadmaps")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!clash) break;
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const insertPayload = {
      ...payload,
      slug,
      difficulty:        payload.difficulty || "intermediate",
      author_id:         req.userId,
      submission_status: "draft",
      is_featured:       false,
    };

    const { data, error } = await supabase
      .from("roadmaps")
      .insert(insertPayload)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") return res.status(409).json({ error: "Slug already exists" });
      throw error;
    }
    logger.info({ id: data.id, by: req.userId }, "roadmap drafted");
    return res.status(201).json(data);
  } catch (err) {
    return sendInternalError(res, err, "create roadmap");
  }
};

// ─── PATCH /api/roadmaps/:id ──────────────────────────────────
// Author can edit while status is `draft` or `rejected`. Pending
// roadmaps are frozen for moderation. Approved roadmaps need an
// admin to flip them back to draft (or use admin endpoint).
export const updateRoadmap = async (req, res) => {
  try {
    const id = String(req.params.id || "").slice(0, 100);
    const { data: existing } = await supabase
      .from("roadmaps")
      .select("author_id, submission_status")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: "Roadmap not found" });

    const isOwner     = existing.author_id === req.userId;
    const isModerator = ["admin", "teacher", "super_admin"].includes(req.userRole);
    if (!isOwner && !isModerator) return res.status(403).json({ error: "Not your roadmap" });

    if (isOwner && !isModerator && !["draft", "rejected"].includes(existing.submission_status)) {
      return res.status(409).json({ error: "Roadmap is locked for moderation. Withdraw first to edit." });
    }

    const { errs, payload } = validateRoadmapBody(req.body);
    if (errs.length) return res.status(400).json({ error: errs.join("; ") });
    if (Object.keys(payload).length === 0) return res.status(400).json({ error: "nothing to update" });

    // If a rejected roadmap is edited, drop the rejection reason —
    // the author has effectively addressed it. They'll need to
    // re-submit explicitly.
    if (existing.submission_status === "rejected") payload.reject_reason = null;

    const { data, error } = await supabase
      .from("roadmaps")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return sendInternalError(res, err, "update roadmap");
  }
};

// ─── DELETE /api/roadmaps/:id ─────────────────────────────────
// Author can hard-delete their own drafts. Approved/featured rows
// require admin (soft-delete via is_active=false).
export const deleteRoadmap = async (req, res) => {
  try {
    const id = String(req.params.id || "").slice(0, 100);
    const { data: existing } = await supabase
      .from("roadmaps")
      .select("author_id, submission_status, is_featured")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: "Roadmap not found" });

    const isOwner     = existing.author_id === req.userId;
    const isModerator = ["admin", "teacher", "super_admin"].includes(req.userRole);
    if (!isOwner && !isModerator) return res.status(403).json({ error: "Not your roadmap" });

    if (existing.submission_status === "approved" && !isModerator) {
      return res.status(409).json({ error: "Approved roadmaps can't be hard-deleted. Ask an admin." });
    }

    if (isModerator && existing.is_featured) {
      // Soft-delete featured rows so they vanish from the public
      // list but aren't physically removed — protects against an
      // admin slip-up.
      const { error } = await supabase
        .from("roadmaps")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
      return res.json({ success: true, hard: false });
    }

    const { error } = await supabase
      .from("roadmaps")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return res.json({ success: true, hard: true });
  } catch (err) {
    return sendInternalError(res, err, "delete roadmap");
  }
};

// ─── POST /api/roadmaps/:id/steps ─────────────────────────────
// Append a step to the end. Body: { title, description?, problem_id?,
// resource_url?, resource_label?, est_minutes? }
export const addStep = async (req, res) => {
  try {
    const roadmapId = String(req.params.id || "").slice(0, 100);
    const { data: existing } = await supabase
      .from("roadmaps")
      .select("author_id, submission_status")
      .eq("id", roadmapId)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: "Roadmap not found" });

    const isOwner     = existing.author_id === req.userId;
    const isModerator = ["admin", "teacher", "super_admin"].includes(req.userRole);
    if (!isOwner && !isModerator) return res.status(403).json({ error: "Not your roadmap" });

    const title = String(req.body?.title || "").trim();
    if (title.length < 3 || title.length > 200) return res.status(400).json({ error: "title 3-200 chars" });

    // Next position = max(existing) + 1, or 0 if empty.
    const { data: posRow } = await supabase
      .from("roadmap_steps")
      .select("position")
      .eq("roadmap_id", roadmapId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (posRow?.position ?? -1) + 1;

    const payload = {
      roadmap_id:     roadmapId,
      position,
      title,
      description:    req.body?.description ? String(req.body.description).trim().slice(0, 2000) : null,
      problem_id:     req.body?.problem_id || null,
      resource_url:   req.body?.resource_url   ? String(req.body.resource_url).trim().slice(0, 500) : null,
      resource_label: req.body?.resource_label ? String(req.body.resource_label).trim().slice(0, 120) : null,
      est_minutes:    req.body?.est_minutes != null ? Number(req.body.est_minutes) : null,
    };

    const { data, error } = await supabase
      .from("roadmap_steps")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json(data);
  } catch (err) {
    return sendInternalError(res, err, "add step");
  }
};

// ─── PATCH /api/roadmaps/steps/:stepId ────────────────────────
export const updateStep = async (req, res) => {
  try {
    const stepId = String(req.params.stepId || "").slice(0, 100);
    const { data: step } = await supabase
      .from("roadmap_steps")
      .select("id, roadmap_id, roadmaps!inner(author_id, submission_status)")
      .eq("id", stepId)
      .maybeSingle();
    if (!step) return res.status(404).json({ error: "Step not found" });

    const isOwner     = step.roadmaps.author_id === req.userId;
    const isModerator = ["admin", "teacher", "super_admin"].includes(req.userRole);
    if (!isOwner && !isModerator) return res.status(403).json({ error: "Not your step" });

    const patch = {};
    if (typeof req.body?.title === "string") {
      const t = req.body.title.trim();
      if (t.length < 3 || t.length > 200) return res.status(400).json({ error: "title 3-200 chars" });
      patch.title = t;
    }
    if ("description" in (req.body || {}))   patch.description    = req.body.description ? String(req.body.description).trim().slice(0, 2000) : null;
    if ("problem_id"  in (req.body || {}))   patch.problem_id     = req.body.problem_id || null;
    if ("resource_url" in (req.body || {}))  patch.resource_url   = req.body.resource_url   ? String(req.body.resource_url).trim().slice(0, 500) : null;
    if ("resource_label" in (req.body || {})) patch.resource_label = req.body.resource_label ? String(req.body.resource_label).trim().slice(0, 120) : null;
    if ("est_minutes" in (req.body || {}))   patch.est_minutes    = req.body.est_minutes != null ? Number(req.body.est_minutes) : null;

    if (Object.keys(patch).length === 0) return res.status(400).json({ error: "nothing to update" });

    const { data, error } = await supabase
      .from("roadmap_steps")
      .update(patch)
      .eq("id", stepId)
      .select()
      .single();
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return sendInternalError(res, err, "update step");
  }
};

// ─── DELETE /api/roadmaps/steps/:stepId ───────────────────────
// Also re-numbers subsequent steps so positions stay contiguous.
export const deleteStep = async (req, res) => {
  try {
    const stepId = String(req.params.stepId || "").slice(0, 100);
    const { data: step } = await supabase
      .from("roadmap_steps")
      .select("id, roadmap_id, position, roadmaps!inner(author_id)")
      .eq("id", stepId)
      .maybeSingle();
    if (!step) return res.status(404).json({ error: "Step not found" });

    const isOwner     = step.roadmaps.author_id === req.userId;
    const isModerator = ["admin", "teacher", "super_admin"].includes(req.userRole);
    if (!isOwner && !isModerator) return res.status(403).json({ error: "Not your step" });

    const { error } = await supabase.from("roadmap_steps").delete().eq("id", stepId);
    if (error) throw error;

    // Pull the remaining steps and re-stamp positions. We do this in
    // app code rather than a recursive CTE because the table is
    // small per roadmap (~20 steps max).
    const { data: rest } = await supabase
      .from("roadmap_steps")
      .select("id, position")
      .eq("roadmap_id", step.roadmap_id)
      .order("position", { ascending: true });
    if (rest?.length) {
      for (let i = 0; i < rest.length; i++) {
        if (rest[i].position !== i) {
          await supabase.from("roadmap_steps").update({ position: i }).eq("id", rest[i].id);
        }
      }
    }
    return res.json({ success: true });
  } catch (err) {
    return sendInternalError(res, err, "delete step");
  }
};

// ─── POST /api/roadmaps/:id/reorder ───────────────────────────
// Body: { step_ids: [<uuid>, <uuid>, ...] } — the desired order.
// We treat the array order as the new position assignment.
export const reorderSteps = async (req, res) => {
  try {
    const roadmapId = String(req.params.id || "").slice(0, 100);
    const stepIds = Array.isArray(req.body?.step_ids) ? req.body.step_ids : null;
    if (!stepIds || !stepIds.length) return res.status(400).json({ error: "step_ids array required" });

    const { data: existing } = await supabase
      .from("roadmaps")
      .select("author_id")
      .eq("id", roadmapId)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: "Roadmap not found" });

    const isOwner     = existing.author_id === req.userId;
    const isModerator = ["admin", "teacher", "super_admin"].includes(req.userRole);
    if (!isOwner && !isModerator) return res.status(403).json({ error: "Not your roadmap" });

    // Confirm every step actually belongs to this roadmap — defends
    // against a malicious client passing in steps from someone
    // else's roadmap.
    const { data: current } = await supabase
      .from("roadmap_steps")
      .select("id")
      .eq("roadmap_id", roadmapId);
    const validIds = new Set((current || []).map((s) => s.id));
    for (const id of stepIds) {
      if (!validIds.has(id)) return res.status(400).json({ error: "step_id not in this roadmap" });
    }

    // Two-phase update to avoid hitting the UNIQUE(roadmap_id,
    // position) constraint mid-renumber: stamp negative positions
    // first, then positive ones.
    for (let i = 0; i < stepIds.length; i++) {
      await supabase.from("roadmap_steps").update({ position: -(i + 1) }).eq("id", stepIds[i]);
    }
    for (let i = 0; i < stepIds.length; i++) {
      await supabase.from("roadmap_steps").update({ position: i }).eq("id", stepIds[i]);
    }
    return res.json({ success: true });
  } catch (err) {
    return sendInternalError(res, err, "reorder steps");
  }
};

// ─── POST /api/roadmaps/:id/submit ────────────────────────────
// Author moves their draft into the moderation queue. Requires at
// least 3 steps so we don't get one-step "roadmaps" cluttering the
// queue.
export const submitForReview = async (req, res) => {
  try {
    const id = String(req.params.id || "").slice(0, 100);
    const { data: existing } = await supabase
      .from("roadmaps")
      .select("author_id, submission_status")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: "Roadmap not found" });
    if (existing.author_id !== req.userId) return res.status(403).json({ error: "Not your roadmap" });
    if (!["draft", "rejected"].includes(existing.submission_status)) {
      return res.status(409).json({ error: "Roadmap is not in a submittable state" });
    }

    const { count } = await supabase
      .from("roadmap_steps")
      .select("id", { count: "exact", head: true })
      .eq("roadmap_id", id);
    if ((count || 0) < 3) return res.status(400).json({ error: "Roadmap needs at least 3 steps before submission" });

    const { error } = await supabase
      .from("roadmaps")
      .update({ submission_status: "pending", reject_reason: null })
      .eq("id", id);
    if (error) throw error;
    return res.json({ success: true, status: "pending" });
  } catch (err) {
    return sendInternalError(res, err, "submit roadmap");
  }
};

// ─── POST /api/roadmaps/:id/withdraw ──────────────────────────
// Author pulls a pending submission back to draft.
export const withdrawSubmission = async (req, res) => {
  try {
    const id = String(req.params.id || "").slice(0, 100);
    const { data: existing } = await supabase
      .from("roadmaps")
      .select("author_id, submission_status")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: "Roadmap not found" });
    if (existing.author_id !== req.userId) return res.status(403).json({ error: "Not your roadmap" });
    if (existing.submission_status !== "pending") {
      return res.status(409).json({ error: "Only pending roadmaps can be withdrawn" });
    }
    const { error } = await supabase
      .from("roadmaps")
      .update({ submission_status: "draft" })
      .eq("id", id);
    if (error) throw error;
    return res.json({ success: true, status: "draft" });
  } catch (err) {
    return sendInternalError(res, err, "withdraw roadmap");
  }
};

// ════════════════════════════════════════════════════════════
// MODERATION (admin / teacher)
// ════════════════════════════════════════════════════════════

// ─── GET /api/roadmaps/admin/queue ────────────────────────────
export const listPendingQueue = async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("roadmaps")
      .select("id, slug, title, summary, difficulty, topic, est_hours, cover_emoji, author_id, created_at")
      .eq("submission_status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const authorIds = [...new Set((data || []).map((r) => r.author_id).filter(Boolean))];
    let authorsById = new Map();
    if (authorIds.length) {
      const { data: authors } = await supabase
        .from("students")
        .select("user_id, name, handle")
        .in("user_id", authorIds);
      authorsById = new Map((authors || []).map((a) => [a.user_id, a]));
    }

    return res.json({
      data: (data || []).map((r) => ({ ...r, author: authorsById.get(r.author_id) || null })),
    });
  } catch (err) {
    return sendInternalError(res, err, "list moderation queue");
  }
};

// ─── POST /api/roadmaps/:id/approve  (moderator) ──────────────
// Body: { is_featured?: boolean }  — admins can promote on approval.
export const approveRoadmap = async (req, res) => {
  try {
    const id = String(req.params.id || "").slice(0, 100);
    const isFeatured = Boolean(req.body?.is_featured);

    const { data, error } = await supabase
      .from("roadmaps")
      .update({
        submission_status: "approved",
        is_featured:       isFeatured,
        reject_reason:     null,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      if (error.code === "PGRST116") return res.status(404).json({ error: "Roadmap not found" });
      throw error;
    }

    if (data.author_id) {
      sendNotification({
        userIds: [data.author_id],
        title:   isFeatured ? "Your roadmap was featured 🌟" : "Your roadmap is live",
        body:    isFeatured
          ? `"${data.title.slice(0, 60)}" was approved AND promoted to Featured.`
          : `"${data.title.slice(0, 60)}" is now visible to the community.`,
        type:    "achievement",
        link:    `/roadmaps/${data.slug}`,
      }).catch((err) => logger.warn({ err }, "roadmap-approved notify failed"));
    }

    return res.json(data);
  } catch (err) {
    return sendInternalError(res, err, "approve roadmap");
  }
};

// ─── POST /api/roadmaps/:id/reject  (moderator) ───────────────
// Body: { reason: string }
export const rejectRoadmap = async (req, res) => {
  try {
    const id = String(req.params.id || "").slice(0, 100);
    const reason = String(req.body?.reason || "").trim().slice(0, 500);
    if (!reason) return res.status(400).json({ error: "reason required" });

    const { data, error } = await supabase
      .from("roadmaps")
      .update({
        submission_status: "rejected",
        reject_reason:     reason,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      if (error.code === "PGRST116") return res.status(404).json({ error: "Roadmap not found" });
      throw error;
    }

    if (data.author_id) {
      sendNotification({
        userIds: [data.author_id],
        title:   "Your roadmap needs another pass",
        body:    `"${data.title.slice(0, 60)}" — ${reason.slice(0, 120)}`,
        type:    "warning",
        link:    `/roadmaps/${data.slug}/edit`,
      }).catch((err) => logger.warn({ err }, "roadmap-rejected notify failed"));
    }

    return res.json(data);
  } catch (err) {
    return sendInternalError(res, err, "reject roadmap");
  }
};

export const toggleStepDone = async (req, res) => {
  try {
    const stepId = String(req.params.stepId || "").slice(0, 100);
    if (!stepId) return res.status(400).json({ error: "stepId required" });

    // Look up the step's parent roadmap so we can store roadmap_id
    // (denormalised for fast per-roadmap progress counts).
    const { data: step } = await supabase
      .from("roadmap_steps")
      .select("id, roadmap_id")
      .eq("id", stepId)
      .maybeSingle();
    if (!step) return res.status(404).json({ error: "Step not found" });

    const { data: existing } = await supabase
      .from("roadmap_progress")
      .select("step_id")
      .eq("step_id", stepId)
      .eq("user_id", req.userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("roadmap_progress")
        .delete()
        .eq("step_id", stepId)
        .eq("user_id", req.userId);
      if (error) throw error;
      return res.json({ done: false });
    }

    const { error } = await supabase
      .from("roadmap_progress")
      .insert({ user_id: req.userId, step_id: stepId, roadmap_id: step.roadmap_id });
    if (error && error.code !== "23505") throw error;
    return res.json({ done: true });
  } catch (err) {
    return sendInternalError(res, err, "toggle roadmap step");
  }
};
