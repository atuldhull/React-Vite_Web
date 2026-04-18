/**
 * controllers/leaderboardController.js  (MULTI-TENANT VERSION)
 *
 * All queries automatically scoped to req.orgId via req.db
 */

/* GET WEEKLY LEADERBOARD — GET /api/leaderboard */
export const getLeaderboard = async (req, res) => {
  try {
    const { data, error } = await req.db
      .from("students")
      .select("user_id, name, email, xp, weekly_xp, title")
      .order("weekly_xp", { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: "Failed to fetch leaderboard" });

    return res.json((data || []).map((s, i) => ({
      rank:     i + 1,
      user_id:  s.user_id,
      name:     s.name || s.email?.split("@")[0] || "Member",
      xp:       s.weekly_xp || 0,
      total_xp: s.xp        || 0,
      title:    s.title      || "Axiom Scout",
    })));
  } catch {
    return res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
};

/* GET ALL-TIME LEADERBOARD — GET /api/leaderboard/alltime */
export const getAllTimeLeaderboard = async (req, res) => {
  try {
    const { data, error } = await req.db
      .from("students")
      .select("user_id, name, email, xp, title")
      .order("xp", { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });
    return res.json((data || []).map((s, i) => ({
      rank:    i + 1,
      user_id: s.user_id,
      name:    s.name || s.email?.split("@")[0] || "Member",
      xp:      s.xp   || 0,
      title:   s.title || "Axiom Scout",
    })));
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* GET HALL OF FAME — GET /api/leaderboard/winners */
export const getWinners = async (req, res) => {
  try {
    const { data, error } = await req.db
      .from("weekly_winners")
      .select("*")
      .order("week_start", { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* GET WEEK COUNTDOWN — GET /api/leaderboard/week-info */
export const getWeekInfo = async (req, res) => {
  try {
    const { data } = await req.db
      .from("students")
      .select("week_start")
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    const weekStart = data?.week_start ? new Date(data.week_start) : new Date();
    const weekEnd   = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const now       = new Date();
    const msLeft    = weekEnd - now;
    const expired   = msLeft <= 0;
    const daysLeft  = expired ? 0 : Math.floor(msLeft / (1000 * 60 * 60 * 24));
    const hoursLeft = expired ? 0 : Math.floor((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const daysOverdue = expired ? Math.floor(-msLeft / (1000 * 60 * 60 * 24)) : 0;

    let timeLeftStr;
    if (expired) {
      timeLeftStr = daysOverdue > 0
        ? `Ended ${daysOverdue}d ago — reset needed`
        : "Week ended — reset needed";
    } else {
      timeLeftStr = daysLeft > 0 ? `${daysLeft}d ${hoursLeft}h left` : `${hoursLeft}h left`;
    }

    return res.json({
      weekStart:   weekStart.toISOString(),
      weekEnd:     weekEnd.toISOString(),
      daysLeft,
      hoursLeft,
      expired,
      daysOverdue,
      timeLeftStr,
    });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};