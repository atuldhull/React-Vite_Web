/**
 * ARENA CONTROLLER
 *
 * BUG FIXES:
 *  1. DB has `solution` column (not theorem/method/hint) — fixed
 *  2. Table name: arena_attempts (not attempts)
 *  3. User lookup: .eq("user_id", userId) on students table
 *  4. Response field: xpEarned (not xp)
 */

import supabase from "../config/supabase.js";
import { logger } from "../config/logger.js";

/* ─────────────────────────────────────
   SUBMIT ANSWER
   Route: POST /api/arena/submit
───────────────────────────────────── */
export const submitSolve = async (req, res) => {
  const { challengeId, selectedIndex } = req.body;
  const userId = req.session?.user?.id;

  if (!userId) return res.status(401).json({ error: "Login required" });
  if (challengeId === undefined || selectedIndex === undefined) {
    return res.status(400).json({ error: "challengeId and selectedIndex required" });
  }

  try {
    // 1. Check if already attempted
    const { data: existing } = await req.db
      .from("arena_attempts")
      .select("*")
      .eq("user_id", userId)
      .eq("challenge_id", challengeId)
      .maybeSingle();

    if (existing) {
      const { data: ch } = await req.db
        .from("challenges")
        .select("correct_index, solution")   // ← uses `solution`
        .eq("id", challengeId).maybeSingle();

      return res.json({
        alreadySolved: true,
        correct:      existing.correct,
        xpEarned:     existing.xp_earned,
        correctIndex: ch?.correct_index,
        solution:     ch?.solution || null,
      });
    }

    // 2. Fetch challenge
    const { data: challenge, error: challengeErr } = await req.db
      .from("challenges")
      .select("id, title, correct_index, points, solution")  // ← uses `solution`
      .eq("id", challengeId).maybeSingle();

    if (challengeErr || !challenge) {
      return res.status(404).json({ error: "Challenge not found" });
    }

    // 3. Grade answer with penalty system
    const correct = Number(selectedIndex) === challenge.correct_index;
    const points = challenge.points || 50;

    // Penalty: -5 for 20pt, -10 for 50pt, -20 for 100pt questions
    const penaltyMap = { 20: -5, 50: -10, 100: -20 };
    const penalty = penaltyMap[points] || Math.round(-points * 0.2);
    const xpEarned = correct ? points : penalty;

    // 4. Save attempt
    const { error: attemptErr } = await req.db
      .from("arena_attempts")
      .insert({
        user_id:        userId,
        challenge_id:   challengeId,
        selected_index: Number(selectedIndex),
        correct,
        xp_earned:      xpEarned,
      });

    if (attemptErr) logger.error({ err: attemptErr }, "Arena Save attempt error");

    // 5. Update student XP + weekly_xp (add for correct, subtract for wrong)
    const { data: student } = await req.db
      .from("students")
      .select("xp, weekly_xp")
      .eq("user_id", userId)
      .maybeSingle();

    const newXp = Math.max(0, (student?.xp || 0) + xpEarned);
    const newWeeklyXp = Math.max(0, (student?.weekly_xp || 0) + xpEarned);

    await req.db
      .from("students")
      .update({ xp: newXp, weekly_xp: newWeeklyXp })
      .eq("user_id", userId);

    return res.json({
      correct,
      correctIndex: challenge.correct_index,
      xpEarned,
      penalty: !correct ? penalty : 0,
      solution: challenge.solution || null,
    });

  } catch (err) {
    logger.error({ err: err }, "Arena Error");
    return res.status(500).json({ error: "Submission failed" });
  }
};

/* ─────────────────────────────────────
   GET HISTORY
   Route: GET /api/arena/history
───────────────────────────────────── */
export const getHistory = async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Login required" });

  try {
    const { data, error } = await req.db
      .from("arena_attempts")
      .select(`
        selected_index, correct, xp_earned, created_at,
        challenges ( id, title, question, options, correct_index, difficulty, points, solution )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    return res.json((data || []).map(a => ({
      ...a,
      challenges: a.challenges ? {
        ...a.challenges,
        difficulty: (a.challenges.difficulty || "medium").toUpperCase(),
      } : null,
    })));
  } catch {
    return res.status(500).json({ error: "Failed to fetch history" });
  }
};

/* ─────────────────────────────────────
   GET STATS
   Route: GET /api/arena/stats
───────────────────────────────────── */
export const getStats = async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Login required" });

  try {
    const { data } = await req.db
      .from("arena_attempts")
      .select("correct, xp_earned")
      .eq("user_id", userId);

    const total    = data?.length || 0;
    const correct  = data?.filter(a => a.correct).length || 0;
    const totalXP  = data?.reduce((s, a) => s + (a.xp_earned || 0), 0) || 0;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

    return res.json({ total, correct, incorrect: total - correct, accuracy, totalXP });
  } catch {
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
};
