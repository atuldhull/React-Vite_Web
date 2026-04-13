/**
 * Public platform stats — tiny endpoint used by the homepage hero and
 * the auth-page sidebar. Returns *real* counts straight from the DB
 * via `head: true, count: 'exact'` so we don't transfer rows just to
 * count them.
 *
 * Public on purpose: same data is essentially visible to any logged-in
 * user. No PII — only aggregate counts.
 */

import supabase from "../config/supabase.js";

/**
 * GET /api/stats/public
 *
 * Response: { members: number, challenges: number, events: number }
 * On error: returns 200 with all-null values so the frontend can fall back
 *           to "—" without distinguishing "no data" from "DB down".
 */
export const getPublicStats = async (_req, res) => {
  try {
    const [students, challenges, events, attempts] = await Promise.all([
      supabase.from("students")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true),
      supabase.from("challenges")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true),
      supabase.from("events")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true),
      // Total challenge attempts ever submitted across the platform.
      // arena_attempts always exists once the platform has any activity;
      // if the table is empty or the query fails, we just return null.
      supabase.from("arena_attempts")
        .select("*", { count: "exact", head: true }),
    ]);

    return res.json({
      members:     students.count    ?? null,
      challenges:  challenges.count  ?? null,
      events:      events.count      ?? null,
      submissions: attempts.count    ?? null,
    });
  } catch {
    // Soft-fail: return nulls. Frontend shows "—".
    return res.json({ members: null, challenges: null, events: null, submissions: null });
  }
};
