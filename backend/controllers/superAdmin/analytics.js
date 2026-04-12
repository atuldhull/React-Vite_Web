/**
 * controllers/superAdmin/analytics.js
 *
 * Platform-wide analytics, global leaderboard, per-org usage stats.
 */

import supabase from "../../config/supabase.js";

/* ═══════════════════════════════════════════════════════
   PLATFORM ANALYTICS
   GET /api/super-admin/analytics
═══════════════════════════════════════════════════════ */
export const getPlatformAnalytics = async (req, res) => {
  try {
    const [
      { count: totalOrgs },
      { count: activeOrgs },
      { count: totalUsers },
      { count: totalChallenges },
      { count: totalAttempts },
      { data: planBreakdown },
    ] = await Promise.all([
      supabase.from("organisations").select("*", { count: "exact", head: true }),
      supabase.from("organisations").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("students").select("*", { count: "exact", head: true }).neq("role", "super_admin"),
      supabase.from("challenges").select("*", { count: "exact", head: true }),
      supabase.from("arena_attempts").select("*", { count: "exact", head: true }),
      supabase.from("organisations").select("plan_name").neq("status", "cancelled"),
    ]);

    // Plan breakdown
    const planCounts = (planBreakdown || []).reduce((acc, org) => {
      acc[org.plan_name] = (acc[org.plan_name] || 0) + 1;
      return acc;
    }, {});

    // Active users in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: activeUsers } = await supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .gte("last_seen_at", sevenDaysAgo);

    // Rough MRR
    const { data: plans } = await supabase
      .from("subscription_plans")
      .select("name, price_monthly");
    const planPrices = Object.fromEntries((plans || []).map(p => [p.name, p.price_monthly]));
    const mrr = Object.entries(planCounts).reduce((sum, [plan, count]) => {
      return sum + (planPrices[plan] || 0) * count;
    }, 0);

    // Per-org usage summary
    const { data: orgsWithStats } = await supabase
      .from("organisations")
      .select(`
        id, name, slug, plan_name, status, created_at,
        students!students_org_id_fkey(count),
        challenges!challenges_org_id_fkey(count)
      `)
      .order("created_at", { ascending: false })
      .limit(20);

    return res.json({
      summary: {
        totalOrgs,
        activeOrgs,
        totalUsers,
        activeUsers: activeUsers || 0,
        totalChallenges,
        totalAttempts,
        mrr: mrr.toFixed(2),
      },
      planBreakdown: planCounts,
      recentOrgs: orgsWithStats || [],
    });
  } catch (err) {
    console.error("[SuperAdmin Analytics]", err.message);
    return res.status(500).json({ error: "Failed to fetch analytics" });
  }
};

/* ═══════════════════════════════════════════════════════
   GLOBAL LEADERBOARD (cross-org)
   GET /api/super-admin/leaderboard
═══════════════════════════════════════════════════════ */
export const getGlobalLeaderboard = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("students")
      .select("name, email, xp, weekly_xp, title, org_id, organisations(name, slug)")
      .not("role", "eq", "super_admin")
      .eq("is_active", true)
      .order("xp", { ascending: false })
      .limit(50);

    if (error) throw error;

    return res.json((data || []).map((s, i) => ({
      rank:     i + 1,
      name:     s.name || s.email?.split("@")[0],
      xp:       s.xp,
      weekly_xp: s.weekly_xp,
      title:    s.title,
      org:      s.organisations?.name || "Unknown",
      org_slug: s.organisations?.slug,
    })));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   ORG USAGE STATS
   GET /api/super-admin/organisations/:orgId/stats
═══════════════════════════════════════════════════════ */
export const getOrgStats = async (req, res) => {
  const { orgId } = req.params;

  try {
    const [
      { count: users },
      { count: challenges },
      { count: events },
      { count: attempts },
    ] = await Promise.all([
      supabase.from("students").select("*", { count: "exact", head: true }).eq("org_id", orgId),
      supabase.from("challenges").select("*", { count: "exact", head: true }).eq("org_id", orgId),
      supabase.from("events").select("*", { count: "exact", head: true }).eq("org_id", orgId),
      supabase.from("arena_attempts").select("*", { count: "exact", head: true }).eq("org_id", orgId),
    ]);

    const { data: org } = await supabase
      .from("organisations")
      .select("*, subscription_plans(*)")
      .eq("id", orgId)
      .single();

    const plan = org?.subscription_plans;

    return res.json({
      usage: { users, challenges, events, attempts },
      limits: {
        max_users:      plan?.max_users      || 50,
        max_challenges: plan?.max_challenges || 100,
        max_events:     plan?.max_events     || 5,
      },
      org,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
