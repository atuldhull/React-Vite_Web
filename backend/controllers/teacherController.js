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
import axios   from "axios";

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
  const topic      = req.query.topic || "Calculus";
  const difficulty = req.query.difficulty || "medium";

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "deepseek/deepseek-chat",
        messages: [
          { role: "system", content: "Output only valid JSON. No markdown." },
          { role: "user", content: `Generate ONE engineering mathematics MCQ for BMSIT students.
Topic: ${topic}
Difficulty: ${difficulty}

Return ONLY this JSON:
{
  "title": "short title",
  "question": "full question",
  "options": ["A", "B", "C", "D"],
  "correct_index": 0,
  "difficulty": "${difficulty}",
  "points": ${difficulty === "easy" ? 20 : difficulty === "hard" ? 100 : 50},
  "solution": "explanation"
}` },
        ],
        temperature: 0.4,
        max_tokens: 600,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    let text = response.data?.choices?.[0]?.message?.content || "";
    text = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start === -1) throw new Error("No JSON in response");

    return res.json(JSON.parse(text.slice(start, end + 1)));
  } catch (err) {
    return res.status(500).json({ error: err.message });
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

    const { data, error } = await req.db
      .from("challenges")
      .insert({
        title:         q.title,
        question:      q.question,
        options:       q.options,
        correct_index: Number(q.correct_index),
        difficulty:    (q.difficulty || "medium").toLowerCase(),
        points:        Number(q.points) || 50,
        solution:      q.solution || null,
        is_active:     true,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ success: true, challenge: data });
  } catch {
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
