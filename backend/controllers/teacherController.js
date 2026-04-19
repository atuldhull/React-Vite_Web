/**
 * TEACHER CONTROLLER
 * Handles all teacher dashboard operations
 */

// Tenant scoping: every DB call uses req.db.from(...). Teacher
// dashboards (stats, students list, leaderboard, performance,
// recent activity, challenge save/toggle) now reflect ONLY the
// caller's org. Previously a teacher in org A saw aggregate stats
// and student rosters across every org. Super_admin still sees
// platform-wide via the Proxy's role-based escape hatch.
import supabase from "../config/supabase.js";
import { logger } from "../config/logger.js";
import { callLLM } from "../lib/llm.js";

/* ─────────────────────────────────────
   GET TEACHER PROFILE
   GET /api/teacher/profile
───────────────────────────────────── */
export const getTeacherProfile = async (req, res) => {
  const userId = req.session?.user?.id;
  try {
    const { data, error } = await req.db
      .from("students")
      .select("name, email, role, department, subject, xp")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || req.session.user);
  } catch {
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
};

/* ─────────────────────────────────────
   GET OVERVIEW STATS
   GET /api/teacher/stats
───────────────────────────────────── */
export const getTeacherStats = async (req, res) => {
  try {
    const [
      { count: totalStudents },
      { count: totalChallenges },
      { count: totalAttempts },
      { count: correctAttempts },
    ] = await Promise.all([
      req.db.from("students").select("*", { count: "exact", head: true }).eq("role", "student"),
      req.db.from("challenges").select("*", { count: "exact", head: true }).eq("is_active", true),
      req.db.from("arena_attempts").select("*", { count: "exact", head: true }),
      req.db.from("arena_attempts").select("*", { count: "exact", head: true }).eq("correct", true),
    ]);

    const accuracy = totalAttempts > 0
      ? Math.round((correctAttempts / totalAttempts) * 100) : 0;

    return res.json({ totalStudents, totalChallenges, totalAttempts, accuracy });
  } catch {
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
};

/* ─────────────────────────────────────
   GET ALL STUDENTS (for teacher view)
   GET /api/teacher/students
───────────────────────────────────── */
export const getStudents = async (req, res) => {
  try {
    const { data, error } = await req.db
      .from("students")
      .select("id, user_id, name, email, xp, weekly_xp, title, created_at")
      .eq("role", "student")
      .order("xp", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch {
    return res.status(500).json({ error: "Failed to fetch students" });
  }
};

/* ─────────────────────────────────────
   GET CHALLENGE PERFORMANCE
   GET /api/teacher/performance
   Shows per-challenge accuracy across all students
───────────────────────────────────── */
export const getChallengePerformance = async (req, res) => {
  try {
    // Get all challenges with their attempt stats
    const { data: challenges } = await req.db
      .from("challenges")
      .select("id, title, difficulty, points")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!challenges?.length) return res.json([]);

    // For each challenge, count total and correct attempts
    const results = await Promise.all(challenges.map(async (ch) => {
      const { count: total } = await req.db
        .from("arena_attempts")
        .select("*", { count: "exact", head: true })
        .eq("challenge_id", ch.id);

      const { count: correct } = await req.db
        .from("arena_attempts")
        .select("*", { count: "exact", head: true })
        .eq("challenge_id", ch.id)
        .eq("correct", true);

      const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

      return {
        id:         ch.id,
        title:      ch.title,
        difficulty: (ch.difficulty || "medium").toUpperCase(),
        points:     ch.points,
        total,
        correct,
        accuracy,
      };
    }));

    return res.json(results.sort((a, b) => b.total - a.total));
  } catch {
    return res.status(500).json({ error: "Failed to fetch performance" });
  }
};

/* ─────────────────────────────────────
   GET RECENT ACTIVITY
   GET /api/teacher/activity
───────────────────────────────────── */
export const getRecentActivity = async (req, res) => {
  try {
    const { data, error } = await req.db
      .from("arena_attempts")
      .select(`
        correct, xp_earned, created_at,
        challenges ( title, difficulty )
      `)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch {
    return res.status(500).json({ error: "Failed to fetch activity" });
  }
};

/* ─────────────────────────────────────
   GENERATE AI QUESTION (teacher can too)
   GET /api/teacher/generate
───────────────────────────────────── */
export const teacherGenerateQuestion = async (req, res) => {
  const topic = (req.query.topic || "Calculus").toString().slice(0, 80);

  // Frontend sends capitalised values ("Easy"/"Medium"/"Hard"/"Extreme").
  // Previous code did case-sensitive equality against lowercase, so every
  // non-lowercase value silently fell into the "medium" branch AND threw
  // a 500 because the LLM's longer Extreme responses overflowed 600 tokens.
  const raw = (req.query.difficulty || "medium").toString().toLowerCase();
  const ALLOWED = ["easy", "medium", "hard", "extreme"];
  const difficulty = ALLOWED.includes(raw) ? raw : "medium";
  const points = { easy: 20, medium: 50, hard: 100, extreme: 200 }[difficulty];

  const prompt = `Generate ONE engineering mathematics MCQ for BMSIT students.
Topic: ${topic}
Difficulty: ${difficulty}

Return ONLY this JSON:
{
  "title": "short title",
  "question": "full question",
  "options": ["A", "B", "C", "D"],
  "correct_index": 0,
  "difficulty": "${difficulty}",
  "points": ${points},
  "solution": "explanation"
}`;

  let rawText = "";
  let usedProvider = null;
  try {
    // "oneshot" mode tells the helper to pick a non-thinking model
    // variant (gemini-2.5-flash-lite on the primary provider) because
    // we need the full max_tokens budget for the JSON response — a
    // thinking model would burn a chunk of that budget on invisible
    // reasoning and truncate the JSON mid-field. Helper handles
    // retry + Gemini→OpenRouter failover internally.
    const { response, provider } = await callLLM({
      messages: [
        { role: "system", content: "Output only valid JSON. No markdown." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      // 1200 tokens so Extreme-difficulty questions with longer
      // solutions don't truncate mid-JSON and fail the parser.
      maxTokens: 1200,
      mode:      "oneshot",
      timeoutMs: 30000,
    });
    usedProvider = provider;

    rawText = response.data?.choices?.[0]?.message?.content || "";
    let text = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start === -1) throw new Error("No JSON in response");

    return res.json(JSON.parse(text.slice(start, end + 1)));
  } catch (err) {
    // Map upstream failures to accurate status codes + log enough
    // context to pinpoint the cause in Render logs without replaying
    // the request. If the model returned text but the parser choked,
    // the rawText preview is what we need to fix the prompt.
    const upstreamStatus = err.response?.status;
    const isTimeout      = err.code === "ECONNABORTED";
    const status = isTimeout
      ? 504
      : (upstreamStatus && upstreamStatus >= 500 ? 502 : 500);
    logger.error({
      err,
      topic,
      difficulty,
      usedProvider,
      upstreamStatus,
      code: err.code,
      rawPreview: rawText ? rawText.slice(0, 400) : null,
      mappedStatus: status,
      noProvider: err.code === "NO_LLM_PROVIDER",
    }, "teacherGenerateQuestion failed");
    // Give the frontend a concrete short reason it can display; keep
    // the full upstream body out of the response (it can contain the
    // API key echo in some error shapes).
    const reason = isTimeout
      ? "AI service timed out — try a shorter topic or switch difficulty."
      : upstreamStatus && upstreamStatus >= 500
        ? "AI service is flaky right now — retry in a moment."
        : rawText
          ? "AI returned a response I couldn't parse — try again."
          : "AI generation failed. Try again.";
    return res.status(status).json({ error: reason });
  }
};

/* ─────────────────────────────────────
   SAVE QUESTION (teacher saves to DB)
   POST /api/teacher/save-question
───────────────────────────────────── */
export const teacherSaveQuestion = async (req, res) => {
  try {
    const q = req.body;
    if (!q.title || !q.question || !Array.isArray(q.options) || q.options.length !== 4) {
      return res.status(400).json({ error: "Invalid question format" });
    }

    // Same issue the cert-batch insert hit (commit 49b8f85): the
    // tenant proxy only auto-injects org_id when effectiveOrgId is
    // truthy, so a session where req.orgId is absent would leak an
    // org_id:NULL into the challenges insert and trip the NOT NULL
    // constraint with "null value in column org_id". Resolve the
    // org explicitly and fail loudly with a clear message if we
    // can't — rather than showing the generic 500 the user was
    // seeing on Extreme-difficulty saves.
    const orgIdForInsert = req.orgId || req.session?.user?.org_id;
    if (!orgIdForInsert) {
      logger.error({
        userId: req.session?.user?.id,
        role:   req.session?.user?.role,
      }, "teacherSaveQuestion: session has no org_id");
      return res.status(400).json({
        error: "No organisation context on your session. Log out and log back in.",
      });
    }

    // Normalise difficulty to lowercase (the DB column convention) AND
    // map "extreme" explicitly with a 200-point default — the generator
    // ladder is 20/50/100/200, but nothing in the old save path had an
    // extreme arm.
    const rawDiff = (q.difficulty || "medium").toString().toLowerCase();
    const ALLOWED = ["easy", "medium", "hard", "extreme"];
    const difficulty = ALLOWED.includes(rawDiff) ? rawDiff : "medium";
    const defaultPoints = { easy: 20, medium: 50, hard: 100, extreme: 200 }[difficulty];

    // Service-role supabase bypasses RLS; we inject org_id explicitly
    // so we don't depend on the proxy plumbing for this write.
    const { data, error } = await supabase
      .from("challenges")
      .insert({
        org_id:        orgIdForInsert,
        title:         q.title,
        question:      q.question,
        options:       q.options,
        correct_index: Number(q.correct_index),
        difficulty,
        points:        Number(q.points) || defaultPoints,
        solution:      q.solution || null,
        is_active:     true,
      })
      .select()
      .single();

    if (error) {
      logger.error({
        err: error,
        orgId: orgIdForInsert,
        difficulty,
      }, "teacherSaveQuestion insert failed");
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json({ success: true, challenge: data });
  } catch (err) {
    logger.error({ err }, "teacherSaveQuestion");
    return res.status(500).json({ error: "Failed to save question" });
  }
};

/* ─────────────────────────────────────
   GET ALL CHALLENGES (teacher view)
   GET /api/teacher/challenges
───────────────────────────────────── */
export const getTeacherChallenges = async (req, res) => {
  try {
    const { data, error } = await req.db
      .from("challenges")
      .select("id, title, difficulty, points, is_active, created_at")
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json((data || []).map(c => ({
      ...c,
      difficulty: (c.difficulty || "medium").toUpperCase(),
    })));
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* ─────────────────────────────────────
   TOGGLE CHALLENGE ACTIVE
   PATCH /api/teacher/challenges/:id/toggle
───────────────────────────────────── */
export const toggleTeacherChallenge = async (req, res) => {
  try {
    const { data: current } = await req.db
      .from("challenges").select("is_active").eq("id", req.params.id).maybeSingle();

    const { data, error } = await req.db
      .from("challenges")
      .update({ is_active: !current?.is_active })
      .eq("id", req.params.id).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, is_active: data.is_active });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* ─────────────────────────────────────
   GET LEADERBOARD (teacher view)
   GET /api/teacher/leaderboard
───────────────────────────────────── */
export const getTeacherLeaderboard = async (req, res) => {
  try {
    const { data, error } = await req.db
      .from("students")
      .select("name, email, xp, weekly_xp, title")
      .eq("role", "student")
      .order("xp", { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: error.message });
    return res.json((data || []).map((s, i) => ({
      rank:      i + 1,
      name:      s.name || s.email?.split("@")[0],
      xp:        s.xp || 0,
      weekly_xp: s.weekly_xp || 0,
      title:     s.title || "Axiom Scout",
    })));
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};
