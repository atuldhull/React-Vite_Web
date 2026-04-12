/**
 * INSIGHTS CONTROLLER — Event intelligence layer.
 *
 * 3 services:
 *   1. Recommendations — personalized event suggestions for students
 *   2. Health Metrics — per-event engagement stats for admins
 *   3. Admin Insights — platform-wide trends and analytics
 *
 * Algorithm: Score-based ranking, no ML needed.
 *
 * Recommendation scoring factors:
 *   - Tag match (user's attended event tags → upcoming event tags): +30 per match
 *   - Type match (user's most-attended event_type matches): +25
 *   - XP reward (higher reward = more appealing): +1 per XP point
 *   - Recency (events sooner rank higher): +20 for this week, +10 for this month
 *   - Popularity (more registrations = social proof): +0.5 per registration
 *   - Not full (full events get -100 penalty)
 *   - Not already registered (already registered get -1000)
 */

import supabase from "../config/supabase.js";

// ═══════════════════════════════════════════════════════════
// 1. PERSONALIZED EVENT RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════

/* GET /api/insights/recommendations — top 5 events for this user */
export const getRecommendations = async (req, res) => {
  const userId = req.userId;

  try {
    // 1. Get user's event history (what types/tags they've attended)
    const { data: userRegs } = await supabase
      .from("event_registrations")
      .select("event_id, status")
      .eq("user_id", userId)
      .in("status", ["registered", "attended"]);

    const registeredEventIds = new Set((userRegs || []).map(r => r.event_id));

    // 2. Get details of attended events (to extract preferences)
    let userTags = {};   // tag → count
    let userTypes = {};  // event_type → count

    if (registeredEventIds.size > 0) {
      const { data: attendedEvents } = await supabase
        .from("events")
        .select("event_type, tags")
        .in("id", [...registeredEventIds]);

      (attendedEvents || []).forEach(ev => {
        const type = ev.event_type || "general";
        userTypes[type] = (userTypes[type] || 0) + 1;
        (ev.tags || []).forEach(tag => {
          userTags[tag] = (userTags[tag] || 0) + 1;
        });
      });
    }

    const topType = Object.entries(userTypes).sort((a, b) => b[1] - a[1])[0]?.[0];

    // 3. Get all upcoming/registering events
    const { data: upcoming } = await supabase
      .from("events")
      .select("*")
      .eq("is_active", true)
      .eq("registration_open", true);

    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 86400000);
    const monthFromNow = new Date(now.getTime() + 30 * 86400000);

    // 4. Get registration counts
    const eventIds = (upcoming || []).map(e => e.id);
    let regCounts = {};
    if (eventIds.length > 0) {
      const { data: regs } = await supabase
        .from("event_registrations")
        .select("event_id")
        .in("event_id", eventIds)
        .in("status", ["registered", "attended"]);
      (regs || []).forEach(r => {
        regCounts[r.event_id] = (regCounts[r.event_id] || 0) + 1;
      });
    }

    // 5. Score each event
    const scored = (upcoming || [])
      .filter(ev => {
        const eventDate = new Date(ev.starts_at || ev.date);
        return eventDate > now; // only future events
      })
      .map(ev => {
        let score = 0;
        const count = regCounts[ev.id] || 0;

        // Tag match: +30 per matching tag
        (ev.tags || []).forEach(tag => {
          if (userTags[tag]) score += 30 * userTags[tag];
        });

        // Type match: +25 if matches top type
        if (topType && (ev.event_type || "general") === topType) score += 25;

        // XP incentive: +1 per XP
        score += (ev.xp_reward || 0);

        // Recency: sooner = better
        const eventDate = new Date(ev.starts_at || ev.date);
        if (eventDate < weekFromNow) score += 20;
        else if (eventDate < monthFromNow) score += 10;

        // Social proof: popularity
        score += Math.round(count * 0.5);

        // Full penalty
        if (ev.capacity && count >= ev.capacity) score -= 100;

        // Already registered penalty
        if (registeredEventIds.has(ev.id)) score -= 1000;

        return { ...ev, _score: score, registration_count: count };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    // 6. Build preference summary
    const preferences = {
      top_type: topType || null,
      top_tags: Object.entries(userTags).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag]) => tag),
      events_attended: registeredEventIds.size,
    };

    return res.json({ recommendations: scored, preferences });
  } catch (err) {
    console.error("[Recommendations]", err.message);
    return res.status(500).json({ error: "Failed to get recommendations" });
  }
};

// ═══════════════════════════════════════════════════════════
// 2. EVENT HEALTH METRICS (per event)
// ═══════════════════════════════════════════════════════════

/* GET /api/insights/event/:id/health — engagement stats for a specific event */
export const getEventHealth = async (req, res) => {
  const eventId = req.params.id;

  try {
    const { data: event } = await supabase
      .from("events").select("*").eq("id", eventId).maybeSingle();

    if (!event) return res.status(404).json({ error: "Event not found" });

    // Registration stats
    const { data: regs } = await supabase
      .from("event_registrations")
      .select("status, registered_at")
      .eq("event_id", eventId);

    const total = (regs || []).length;
    const registered = (regs || []).filter(r => r.status === "registered").length;
    const attended = (regs || []).filter(r => r.status === "attended").length;
    const cancelled = (regs || []).filter(r => r.status === "cancelled").length;
    const waitlisted = (regs || []).filter(r => r.status === "waitlisted").length;
    const noShow = (regs || []).filter(r => r.status === "no_show").length;

    // Attendance stats
    const { data: att } = await supabase
      .from("event_attendance")
      .select("checkin_method, xp_awarded")
      .eq("event_id", eventId);

    const totalAttendance = (att || []).length;
    const qrCheckins = (att || []).filter(a => a.checkin_method === "qr").length;
    const codeCheckins = (att || []).filter(a => a.checkin_method === "code").length;
    const manualCheckins = (att || []).filter(a => a.checkin_method === "manual").length;
    const totalXpAwarded = (att || []).reduce((s, a) => s + (a.xp_awarded || 0), 0);

    // Rates
    const fillRate = event.capacity ? Math.round((registered + attended) / event.capacity * 100) : null;
    const attendanceRate = (registered + attended) > 0 ? Math.round(attended / (registered + attended) * 100) : 0;
    const cancelRate = total > 0 ? Math.round(cancelled / total * 100) : 0;

    // Registration timeline (group by day)
    const timeline = {};
    (regs || []).forEach(r => {
      if (r.registered_at) {
        const day = new Date(r.registered_at).toISOString().slice(0, 10);
        timeline[day] = (timeline[day] || 0) + 1;
      }
    });

    return res.json({
      event_id: eventId,
      registration: { total, registered, attended, cancelled, waitlisted, no_show: noShow },
      attendance: { total: totalAttendance, qr: qrCheckins, code: codeCheckins, manual: manualCheckins },
      xp: { total_awarded: totalXpAwarded },
      rates: { fill_rate: fillRate, attendance_rate: attendanceRate, cancel_rate: cancelRate },
      timeline: Object.entries(timeline).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
    });
  } catch (err) {
    console.error("[Event Health]", err.message);
    return res.status(500).json({ error: "Failed" });
  }
};

// ═══════════════════════════════════════════════════════════
// 3. ADMIN INSIGHTS — platform-wide trends
// ═══════════════════════════════════════════════════════════

/* GET /api/insights/admin — overall platform engagement stats */
export const getAdminInsights = async (req, res) => {
  try {
    // Event stats
    const { data: events } = await supabase
      .from("events").select("id, title, event_type, date, starts_at, is_active, xp_reward");

    const activeEvents = (events || []).filter(e => e.is_active);
    const now = new Date();
    const upcoming = activeEvents.filter(e => new Date(e.starts_at || e.date) > now);

    // Type distribution
    const typeDist = {};
    activeEvents.forEach(e => {
      const t = e.event_type || "general";
      typeDist[t] = (typeDist[t] || 0) + 1;
    });

    // Registration totals
    const { data: allRegs } = await supabase
      .from("event_registrations")
      .select("event_id, status, registered_at");

    const totalRegs = (allRegs || []).length;
    const totalAttended = (allRegs || []).filter(r => r.status === "attended").length;
    const totalCancelled = (allRegs || []).filter(r => r.status === "cancelled").length;
    const platformAttendanceRate = totalRegs > 0 ? Math.round(totalAttended / totalRegs * 100) : 0;

    // Registration trend (last 30 days, grouped by day)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const recentRegs = (allRegs || []).filter(r => r.registered_at && new Date(r.registered_at) > thirtyDaysAgo);
    const regTrend = {};
    recentRegs.forEach(r => {
      const day = new Date(r.registered_at).toISOString().slice(0, 10);
      regTrend[day] = (regTrend[day] || 0) + 1;
    });

    // Top events by registration
    const eventRegCounts = {};
    (allRegs || []).forEach(r => {
      if (r.status !== "cancelled") eventRegCounts[r.event_id] = (eventRegCounts[r.event_id] || 0) + 1;
    });
    const topEvents = Object.entries(eventRegCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id, count]) => {
        const ev = (events || []).find(e => e.id === id);
        return { id, title: ev?.title || "Unknown", count, type: ev?.event_type || "general" };
      });

    // Achievement stats
    const { count: totalUnlocks } = await supabase
      .from("user_achievements")
      .select("*", { count: "exact", head: true });

    // Active users (registered for at least 1 event)
    const uniqueUsers = new Set((allRegs || []).map(r => r.user_id));

    return res.json({
      events: {
        total: activeEvents.length,
        upcoming: upcoming.length,
        type_distribution: typeDist,
      },
      registrations: {
        total: totalRegs,
        attended: totalAttended,
        cancelled: totalCancelled,
        attendance_rate: platformAttendanceRate,
        active_users: uniqueUsers.size,
      },
      top_events: topEvents,
      trend: Object.entries(regTrend).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
      achievements: { total_unlocks: totalUnlocks || 0 },
    });
  } catch (err) {
    console.error("[Admin Insights]", err.message);
    return res.status(500).json({ error: "Failed" });
  }
};
