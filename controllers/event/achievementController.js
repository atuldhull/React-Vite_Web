/**
 * Achievement Controller — Achievement catalog, user unlocks, and criteria checks
 */

import supabase from "../../config/supabase.js";
import { sendNotification } from "../notificationController.js";

/* GET /api/achievements — list all achievements */
export const getAchievements = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("achievements")
      .select("*")
      .eq("is_active", true)
      .order("category");

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* GET /api/achievements/me — current user's unlocked achievements */
export const getMyAchievements = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_achievements")
      .select("*, achievements(*)")
      .eq("user_id", req.userId)
      .order("unlocked_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* GET /api/achievements/user/:userId — specific user's achievements */
export const getUserAchievements = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_achievements")
      .select("*, achievements(*)")
      .eq("user_id", req.params.userId)
      .order("unlocked_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* POST /api/achievements/grant — manually grant achievement (admin) */
export const grantAchievement = async (req, res) => {
  const { user_id, achievement_id, event_id } = req.body;
  if (!user_id || !achievement_id)
    return res.status(400).json({ error: "user_id and achievement_id required" });

  try {
    // Get achievement for XP
    const { data: ach } = await supabase
      .from("achievements").select("*").eq("id", achievement_id).maybeSingle();
    if (!ach) return res.status(404).json({ error: "Achievement not found" });

    const { data, error } = await supabase.from("user_achievements").insert({
      user_id,
      achievement_id,
      event_id: event_id || null,
      granted_by: req.userId,
      xp_awarded: ach.xp_reward || 0,
    }).select().single();

    if (error) {
      if (error.code === "23505") return res.status(409).json({ error: "Already unlocked" });
      return res.status(500).json({ error: error.message });
    }

    // Award XP
    if (ach.xp_reward > 0) {
      const { data: student } = await supabase
        .from("students").select("xp, weekly_xp").eq("user_id", user_id).maybeSingle();
      if (student) {
        await supabase.from("students").update({
          xp: (student.xp || 0) + ach.xp_reward,
          weekly_xp: (student.weekly_xp || 0) + ach.xp_reward,
        }).eq("user_id", user_id);
      }
    }

    // Notify user
    await sendNotification({
      userIds: [user_id],
      title: `${ach.icon} Achievement Unlocked!`,
      body: `${ach.title} — ${ach.description}${ach.xp_reward ? ` (+${ach.xp_reward} XP)` : ""}`,
      type: "success",
      link: `/profile`,
    });

    return res.json({ success: true, unlock: data });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

// ── Internal: check event attendance achievements ──
export async function checkEventAchievements(userId) {
  try {
    const { count } = await supabase
      .from("event_attendance")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    const total = count || 0;

    // Get event_attend achievements that match
    const { data: achievements } = await supabase
      .from("achievements")
      .select("*")
      .eq("criteria_type", "event_attend")
      .eq("is_active", true)
      .lte("criteria_value", total);

    if (!achievements) return;

    for (const ach of achievements) {
      // Try to insert (ignore if already exists)
      const { error } = await supabase.from("user_achievements").insert({
        user_id: userId,
        achievement_id: ach.id,
        xp_awarded: ach.xp_reward || 0,
      });

      if (!error && ach.xp_reward > 0) {
        // New achievement — award XP and notify
        const { data: student } = await supabase
          .from("students").select("xp, weekly_xp").eq("user_id", userId).maybeSingle();
        if (student) {
          await supabase.from("students").update({
            xp: (student.xp || 0) + ach.xp_reward,
            weekly_xp: (student.weekly_xp || 0) + ach.xp_reward,
          }).eq("user_id", userId);
        }
        await sendNotification({
          userIds: [userId],
          title: `${ach.icon} Achievement Unlocked!`,
          body: `${ach.title} — ${ach.description}`,
          type: "success",
          link: `/profile`,
        });
      }
    }
  } catch { /* non-blocking */ }
}

// ── Internal: check event win achievements ──
export async function checkWinAchievements(userId) {
  try {
    const { count } = await supabase
      .from("event_leaderboard")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("rank", 1);

    const wins = count || 0;

    const { data: achievements } = await supabase
      .from("achievements")
      .select("*")
      .eq("criteria_type", "event_win")
      .eq("is_active", true)
      .lte("criteria_value", wins);

    if (!achievements) return;

    for (const ach of achievements) {
      const { error } = await supabase.from("user_achievements").insert({
        user_id: userId,
        achievement_id: ach.id,
        xp_awarded: ach.xp_reward || 0,
      });
      if (!error && ach.xp_reward > 0) {
        const { data: student } = await supabase
          .from("students").select("xp, weekly_xp").eq("user_id", userId).maybeSingle();
        if (student) {
          await supabase.from("students").update({
            xp: (student.xp || 0) + ach.xp_reward,
            weekly_xp: (student.weekly_xp || 0) + ach.xp_reward,
          }).eq("user_id", userId);
        }
        await sendNotification({
          userIds: [userId],
          title: `${ach.icon} Achievement Unlocked!`,
          body: `${ach.title} — ${ach.description}`,
          type: "success",
          link: `/profile`,
        });
      }
    }
  } catch { /* non-blocking */ }
}
