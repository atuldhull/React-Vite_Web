import supabase from "../../config/supabase.js";

/* Clear all arena attempts for a user — DELETE /api/admin/data/attempts/:userId */
export const clearUserAttempts = async (req, res) => {
  try {
    const { error } = await req.db
      .from("arena_attempts")
      .delete()
      .eq("user_id", req.params.userId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: "Arena attempts cleared" });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* Reset a user's XP to 0 — PATCH /api/admin/data/reset-xp/:userId */
export const resetUserXP = async (req, res) => {
  try {
    const { error } = await req.db
      .from("students")
      .update({ xp: 0, weekly_xp: 0 })
      .eq("user_id", req.params.userId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: "XP reset to 0" });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* Clear ALL arena attempts (nuclear) — DELETE /api/admin/data/all-attempts */
export const clearAllAttempts = async (req, res) => {
  try {
    const { error } = await req.db
      .from("arena_attempts")
      .delete()
      .gte("id", "00000000-0000-0000-0000-000000000000");
    if (error) return res.status(500).json({ error: error.message });
    // Also reset all XP
    await req.db
      .from("students")
      .update({ xp: 0, weekly_xp: 0 })
      .gte("id", "00000000-0000-0000-0000-000000000000");
    return res.json({ success: true, message: "All attempts cleared and XP reset" });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};
