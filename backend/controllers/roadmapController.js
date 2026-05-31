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

// ════════════════════════════════════════════════════════════
// GET /api/roadmaps
//
// List card data + viewer's progress count per roadmap (so the
// catalogue can show "3 / 7 done" badges without per-card N+1 fetches).
// ════════════════════════════════════════════════════════════
export const listRoadmaps = async (req, res) => {
  try {
    const { data: roadmaps, error } = await supabase
      .from("roadmaps")
      .select("id, slug, title, summary, difficulty, topic, est_hours, cover_emoji")
      .eq("is_active", true)
      .order("created_at", { ascending: true });
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

    const list = (roadmaps || []).map((r) => ({
      ...r,
      step_count:     totals.get(r.id) || 0,
      done_count:     done.get(r.id) || 0,
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
      .select("id, slug, title, summary, description, difficulty, topic, est_hours, cover_emoji, created_at, updated_at")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!roadmap) return res.status(404).json({ error: "Roadmap not found" });

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
