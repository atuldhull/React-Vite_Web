/**
 * WEEKLY RESET SERVICE
 * 
 * Checks every hour if a week has passed (Monday 00:00 IST).
 * If yes: records the winner → resets weekly_xp → notifies.
 * 
 * Runs automatically when server starts.
 */

import supabase from "../config/supabase.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

/* ─────────────────────────────────────
   PERFORM WEEKLY RESET
   1. Find winner (highest weekly_xp)
   2. Save to weekly_winners table
   3. Reset all students' weekly_xp to 0
   4. Update week_start timestamps
───────────────────────────────────── */
export async function performWeeklyReset() {
  console.log("[WeeklyReset] Starting weekly reset...");

  try {
    // 1. Find this week's winner — student with highest weekly_xp
    const { data: topStudents, error: topErr } = await supabase
      .from("students")
      .select("user_id, name, email, weekly_xp")
      .order("weekly_xp", { ascending: false })
      .limit(1);

    if (topErr) throw new Error("Failed to fetch top student: " + topErr.message);

    const winner = topStudents?.[0];
    const weekEnd   = new Date();
    const weekStart = new Date(weekEnd.getTime() - WEEK_MS);

    // 2. Count how many challenges winner solved this week
    let totalSolved = 0;
    if (winner?.user_id) {
      const { count } = await supabase
        .from("arena_attempts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", winner.user_id)
        .eq("correct", true)
        .gte("created_at", weekStart.toISOString());
      totalSolved = count || 0;
    }

    // 3. Save winner to hall of fame (only if someone actually earned XP)
    if (winner && winner.weekly_xp > 0) {
      const { error: insertErr } = await supabase
        .from("weekly_winners")
        .insert({
          week_start:   weekStart.toISOString(),
          week_end:     weekEnd.toISOString(),
          winner_name:  winner.name  || winner.email?.split("@")[0] || "Anonymous",
          winner_email: winner.email || "",
          winner_xp:    winner.weekly_xp,
          total_solved: totalSolved,
        });

      if (insertErr) console.error("[WeeklyReset] Failed to save winner:", insertErr.message);
      else console.log(`[WeeklyReset] ✓ Winner saved: ${winner.name} with ${winner.weekly_xp} XP`);
    } else {
      console.log("[WeeklyReset] No XP earned this week — skipping winner record.");
    }

    // 4. Reset weekly_xp for ALL students
    const { error: resetErr } = await supabase
      .from("students")
      .update({ weekly_xp: 0, week_start: weekEnd.toISOString() })
      .gte("id", "00000000-0000-0000-0000-000000000000"); // matches all rows

    if (resetErr) throw new Error("Failed to reset weekly XP: " + resetErr.message);

    console.log("[WeeklyReset] ✓ Weekly XP reset complete.");
    return { success: true, winner };

  } catch (err) {
    console.error("[WeeklyReset] Error:", err.message);
    return { success: false, error: err.message };
  }
}

/* ─────────────────────────────────────
   CHECK IF RESET IS DUE
   Resets on Monday 00:00 IST (UTC+5:30)
───────────────────────────────────── */
export async function checkAndResetIfDue() {
  try {
    // Get the most recent week_start from any student
    const { data } = await supabase
      .from("students")
      .select("week_start")
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data?.week_start) {
      console.log("[WeeklyReset] No week_start found — initialising...");
      // First time setup — set week_start for all students to now
      await supabase
        .from("students")
        .update({ week_start: new Date().toISOString() })
        .gte("id", "00000000-0000-0000-0000-000000000000");
      return;
    }

    const lastReset  = new Date(data.week_start);
    const now        = new Date();
    const daysSince  = (now - lastReset) / (1000 * 60 * 60 * 24);

    console.log(`[WeeklyReset] Last reset: ${lastReset.toDateString()} (${daysSince.toFixed(1)} days ago)`);

    if (daysSince >= 7) {
      console.log("[WeeklyReset] 7 days passed — triggering reset...");
      await performWeeklyReset();
    }
  } catch (err) {
    console.error("[WeeklyReset] Check error:", err.message);
  }
}

/* ─────────────────────────────────────
   START SCHEDULER
   Checks every hour automatically.
   Call this once from server.js on startup.
───────────────────────────────────── */
export function startWeeklyResetScheduler() {
  console.log("[WeeklyReset] Scheduler started — checks every hour.");

  // Check immediately on startup
  checkAndResetIfDue();

  // Then check every hour
  setInterval(checkAndResetIfDue, 60 * 60 * 1000);
}
