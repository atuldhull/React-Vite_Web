/**
 * Leaderboard Controller — Event scoring, ranking, and result publishing
 */

import supabase from "../../config/supabase.js";
import { sendNotification } from "../notificationController.js";
import { checkWinAchievements } from "./achievementController.js";

const WINNER_XP_MULTIPLIERS = { 1: 1, 2: 0.6, 3: 0.3 };
const TOP_PLACES = 3;

/* GET /api/events/:id/leaderboard — get event rankings */
export const getEventLeaderboard = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("event_leaderboard")
      .select("*, students:user_id(name, email, avatar_emoji, title)")
      .eq("event_id", req.params.id)
      .order("score", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Auto-assign ranks by score order
    const ranked = (data || []).map((entry, i) => ({
      ...entry,
      rank: i + 1,
    }));

    return res.json(ranked);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* POST /api/events/:id/leaderboard — submit/update score (teacher/admin) */
export const updateEventScore = async (req, res) => {
  const { user_id, score, team_name, submission_url, notes } = req.body;
  if (!user_id || score === undefined) return res.status(400).json({ error: "user_id and score required" });

  try {
    const { data, error } = await supabase.from("event_leaderboard").upsert({
      event_id: req.params.id,
      user_id,
      score: Number(score),
      team_name: team_name || null,
      submission_url: submission_url || null,
      judged_by: req.userId,
      judged_at: new Date().toISOString(),
      notes: notes || null,
    }, { onConflict: "event_id,user_id" }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, entry: data });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* POST /api/events/:id/leaderboard/publish — finalize ranks + award XP (admin) */
export const publishEventResults = async (req, res) => {
  try {
    // Get sorted leaderboard
    const { data: entries } = await supabase
      .from("event_leaderboard")
      .select("*")
      .eq("event_id", req.params.id)
      .order("score", { ascending: false });

    if (!entries || entries.length === 0)
      return res.status(400).json({ error: "No entries to publish" });

    // Get event for winner XP bonus
    const { data: event } = await supabase
      .from("events").select("xp_bonus_winner, title").eq("id", req.params.id).maybeSingle();
    const winnerXP = event?.xp_bonus_winner || 0;

    const RANK_LABELS = { 1: "\uD83E\uDD47 1st", 2: "\uD83E\uDD48 2nd", 3: "\uD83E\uDD49 3rd" };

    // Update ranks and award XP to top 3
    for (let i = 0; i < entries.length; i++) {
      const rank = i + 1;
      await supabase.from("event_leaderboard")
        .update({ rank }).eq("id", entries[i].id);

      // Award winner XP to top places
      if (rank <= TOP_PLACES && winnerXP > 0) {
        const xp = Math.round(winnerXP * (WINNER_XP_MULTIPLIERS[rank] || 0));
        const { data: student } = await supabase
          .from("students").select("xp, weekly_xp").eq("user_id", entries[i].user_id).maybeSingle();
        if (student) {
          await supabase.from("students").update({
            xp: (student.xp || 0) + xp,
            weekly_xp: (student.weekly_xp || 0) + xp,
          }).eq("user_id", entries[i].user_id);
        }

        // Notify winners
        await sendNotification({
          userIds: [entries[i].user_id],
          title: `${RANK_LABELS[rank]} Place!`,
          body: `You placed #${rank} in "${event?.title || "event"}" — +${xp} XP`,
          type: "success",
          link: `/events`,
        });

        // Check win achievements
        await checkWinAchievements(entries[i].user_id);
      }
    }

    return res.json({ success: true, count: entries.length });
  } catch (err) {
    console.error("[Publish Results]", err.message);
    return res.status(500).json({ error: "Failed to publish" });
  }
};
