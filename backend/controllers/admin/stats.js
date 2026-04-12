import supabase from "../../config/supabase.js";

/* ═══════════════════════════════════════════
   STATS OVERVIEW
   GET /api/admin/stats
═══════════════════════════════════════════ */
export const getAdminStats = async (req, res) => {
  try {
    const [
      { count: totalStudents },
      { count: totalChallenges },
      { count: totalAttempts },
      { count: totalEvents },
    ] = await Promise.all([
      supabase.from("students")      .select("*", { count: "exact", head: true }),
      supabase.from("challenges")    .select("*", { count: "exact", head: true }),
      supabase.from("arena_attempts").select("*", { count: "exact", head: true }),
      supabase.from("events")        .select("*", { count: "exact", head: true }),
    ]);

    const { data: topStudents } = await supabase
      .from("students")
      .select("name, email, xp")
      .order("xp", { ascending: false })
      .limit(3);

    const { data: recentActivity } = await supabase
      .from("arena_attempts")
      .select("correct, xp_earned, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    return res.json({
      totalStudents:   totalStudents   || 0,
      totalChallenges: totalChallenges || 0,
      totalAttempts:   totalAttempts   || 0,
      totalEvents:     totalEvents     || 0,
      topStudents:     topStudents     || [],
      recentActivity:  recentActivity  || [],
    });
  } catch {
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
};

/* ═══════════════════════════════════════════
   MANUAL WEEKLY RESET (admin)
   POST /api/admin/reset-week
   Admin can trigger a reset early if needed
═══════════════════════════════════════════ */
export const triggerWeeklyReset = async (req, res) => {
  try {
    const { performWeeklyReset } = await import("../../services/weeklyReset.js");
    const result = await performWeeklyReset();

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    return res.json({
      success: true,
      message: "Weekly leaderboard reset complete.",
      winner: result.winner ? {
        name: result.winner.name || result.winner.email,
        xp:   result.winner.weekly_xp,
      } : null,
    });
  } catch (err) {
    return res.status(500).json({ error: "Reset failed: " + err.message });
  }
};
