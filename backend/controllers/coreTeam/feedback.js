/**
 * Core Team — anonymous suggestions & complaints.
 *
 * Anyone in the core team can post a suggestion/complaint, club-wide
 * or aimed at a specific team. It is ANONYMOUS to readers: the author
 * is stored but never returned by listFeedback.
 *
 * Routing of who can read it:
 *   - club-scope  → the council
 *   - team-scope  → that team's head + the council
 *
 * If the content filter flags the body as abusive, is_flagged is set.
 * Only a site admin / super_admin can de-anonymise an item (the
 * /author endpoint) — that's the "we can find out who, if it's
 * vulgar" escape hatch.
 */
import supabase from "../../config/supabase.js";
import { catchAsync } from "../../lib/asyncHandler.js";
import { isClean, findBannedWord } from "../../lib/contentFilter.js";

/** Strip the author identity — feedback is anonymous to all readers. */
function anonymise(f) {
  if (!f) return f;
  const { author_user_id, author_name, ...rest } = f; // eslint-disable-line no-unused-vars
  return rest;
}

/* GET /api/core/feedback — scoped to what the caller may read */
export const listFeedback = catchAsync(async (req, res) => {
  const me = req.coreMember;

  let query = supabase
    .from("core_feedback")
    .select("*, core_teams(id, name, slug, accent)")
    .order("created_at", { ascending: false });

  if (me.tier === "council") {
    // sees everything
  } else if (me.tier === "head" && me.team_id) {
    // a head sees only their own team's feedback
    query = query.eq("scope", "team").eq("team_id", me.team_id);
  } else {
    // plain members don't read feedback — they only submit it
    return res.json([]);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: "Could not load feedback." });
  return res.json((data || []).map(anonymise));
});

/* POST /api/core/feedback — any core member */
export const createFeedback = catchAsync(async (req, res) => {
  const me = req.coreMember;
  const { scope, kind, body } = req.body;
  let teamId = req.body.teamId || null;

  if (scope === "team" && !teamId) {
    return res.status(400).json({ error: "Pick which team this is about." });
  }
  if (scope === "club") teamId = null;

  const clean = isClean(body);
  const flaggedWord = clean ? null : findBannedWord(body);

  const { data, error } = await supabase
    .from("core_feedback")
    .insert({
      author_user_id: me.user_id,
      author_name:    me.name,
      scope,
      team_id:        teamId,
      kind,
      body,
      is_flagged:     !clean,
      flag_reason:    flaggedWord ? `Possible abusive language: "${flaggedWord}"` : null,
    })
    .select("id, scope, kind, status, is_flagged, created_at")
    .single();
  if (error) return res.status(500).json({ error: "Could not submit — try again." });

  // The caller gets back only the non-identifying fields.
  return res.status(201).json({ success: true, feedback: data });
});

/* PATCH /api/core/feedback/:id/status — council, or head for their team */
export const updateFeedbackStatus = catchAsync(async (req, res) => {
  const me = req.coreMember;
  const { data: fb } = await supabase
    .from("core_feedback").select("id, scope, team_id").eq("id", req.params.id).maybeSingle();
  if (!fb) return res.status(404).json({ error: "Feedback not found." });

  const canManage =
    me.tier === "council" ||
    (me.tier === "head" && fb.scope === "team" && me.team_id === fb.team_id);
  if (!canManage) return res.status(403).json({ error: "You can't manage this item." });

  const { data, error } = await supabase
    .from("core_feedback")
    .update({ status: req.body.status })
    .eq("id", fb.id)
    .select("*, core_teams(id, name, slug, accent)")
    .single();
  if (error) return res.status(500).json({ error: "Could not update." });
  return res.json({ success: true, feedback: anonymise(data) });
});

/* GET /api/core/feedback/:id/author — de-anonymise (site admin only) */
export const revealAuthor = catchAsync(async (req, res) => {
  if (!["admin", "super_admin"].includes(req.userRole)) {
    return res.status(403).json({ error: "Only a site administrator can reveal an author." });
  }
  const { data, error } = await supabase
    .from("core_feedback")
    .select("id, author_user_id, author_name, is_flagged, flag_reason")
    .eq("id", req.params.id)
    .maybeSingle();
  if (error || !data) return res.status(404).json({ error: "Feedback not found." });
  return res.json(data);
});
