/**
 * Core Team — ideas board.
 *
 * Any core member can post a creative idea (marketing, social, design,
 * events, tech, anything). Everyone can up-vote. When an idea crosses
 * IDEA_THRESHOLD votes it is auto-promoted to "approved" and its author
 * earns a one-time creativity bonus.
 */
import supabase from "../../config/supabase.js";
import { catchAsync } from "../../lib/asyncHandler.js";

const IDEA_THRESHOLD = 17;   // votes needed to green-light an idea
const CREATIVITY_BONUS = 25; // points to the author when an idea is approved

/* GET /api/core/ideas — all ideas, newest-strong first, with my vote state */
export const listIdeas = catchAsync(async (req, res) => {
  const userId = req.session?.user?.id;
  const { field } = req.query;

  let query = supabase
    .from("core_ideas")
    .select("*")
    .order("vote_count", { ascending: false })
    .order("created_at", { ascending: false });
  if (field && field !== "All") query = query.eq("field", field);

  const { data: ideas, error } = await query;
  if (error) return res.status(500).json({ error: "Could not load ideas." });

  // Which of these has the caller already voted on?
  const { data: myVotes } = await supabase
    .from("core_idea_votes").select("idea_id").eq("user_id", userId);
  const voted = new Set((myVotes || []).map((v) => v.idea_id));

  return res.json({
    threshold: IDEA_THRESHOLD,
    ideas: (ideas || []).map((i) => ({ ...i, hasVoted: voted.has(i.id) })),
  });
});

/* POST /api/core/ideas — any core member */
export const createIdea = catchAsync(async (req, res) => {
  const me = req.coreMember;
  const { field, title, body } = req.body;

  const { data, error } = await supabase
    .from("core_ideas")
    .insert({
      author_user_id:   me.user_id,
      author_member_id: me.id,
      author_name:      me.name,
      field, title, body,
    })
    .select().single();
  if (error) return res.status(500).json({ error: "Could not post idea." });
  return res.status(201).json({ success: true, idea: { ...data, hasVoted: false } });
});

/* POST /api/core/ideas/:id/vote — toggle the caller's up-vote */
export const voteIdea = catchAsync(async (req, res) => {
  const userId = req.session?.user?.id;
  const ideaId = req.params.id;

  const { data: idea } = await supabase
    .from("core_ideas").select("*").eq("id", ideaId).maybeSingle();
  if (!idea) return res.status(404).json({ error: "Idea not found." });

  const { data: existing } = await supabase
    .from("core_idea_votes").select("id").eq("idea_id", ideaId).eq("user_id", userId).maybeSingle();

  if (existing) {
    await supabase.from("core_idea_votes").delete().eq("id", existing.id);
  } else {
    await supabase.from("core_idea_votes").insert({ idea_id: ideaId, user_id: userId });
  }

  // Re-count from the source of truth so the tally can't drift.
  const { count } = await supabase
    .from("core_idea_votes")
    .select("*", { count: "exact", head: true })
    .eq("idea_id", ideaId);
  const voteCount = count || 0;

  // Crossing the threshold for the first time promotes the idea and
  // pays the author their creativity bonus — exactly once.
  let approved = idea.status === "approved";
  if (!approved && voteCount >= IDEA_THRESHOLD) {
    approved = true;
    if (idea.author_member_id) {
      const { data: author } = await supabase
        .from("core_members").select("points").eq("id", idea.author_member_id).maybeSingle();
      await supabase
        .from("core_members")
        .update({ points: (author?.points || 0) + CREATIVITY_BONUS })
        .eq("id", idea.author_member_id);
      await supabase.from("core_points_log").insert({
        member_id: idea.author_member_id,
        points:    CREATIVITY_BONUS,
        reason:    `Idea approved by the club: ${idea.title}`,
        ref_type:  "idea",
        ref_id:    idea.id,
      });
    }
  }

  await supabase
    .from("core_ideas")
    .update({ vote_count: voteCount, status: approved ? "approved" : idea.status })
    .eq("id", ideaId);

  return res.json({ success: true, voteCount, hasVoted: !existing, approved });
});

/* DELETE /api/core/ideas/:id — the author or the council */
export const deleteIdea = catchAsync(async (req, res) => {
  const me = req.coreMember;
  const { data: idea } = await supabase
    .from("core_ideas").select("id, author_user_id").eq("id", req.params.id).maybeSingle();
  if (!idea) return res.status(404).json({ error: "Idea not found." });

  if (me.tier !== "council" && idea.author_user_id !== me.user_id) {
    return res.status(403).json({ error: "You can only delete your own idea." });
  }
  await supabase.from("core_ideas").delete().eq("id", idea.id);
  return res.json({ success: true });
});
