/**
 * ADMIN CONTROLLER
 *
 * BUG FIXES:
 *  1. Events: all queries use `date` column (not `event_date`)
 *  2. saveAIQuestion: uses `solution` column (not theorem/method/hint)
 *  3. ADDED: createUser — admin can create new student accounts
 *  4. ADDED: deleteUser — admin can remove users
 *  5. getAllUsers now queries correct students columns
 */

import axios    from "axios";
import archiver from "archiver";
import supabase from "../config/supabase.js";

/* ═══════════════════════════════════════════
   AI QUESTION — Generate preview (admin)
   GET /api/admin/generate
═══════════════════════════════════════════ */
export const generateAIQuestion = async (req, res) => {
  try {
    const TOPICS = [
      "Matrices and Linear Algebra","Eigenvalues and Eigenvectors","Differential Calculus",
      "Integral Calculus","Probability and Statistics","Discrete Mathematics","Graph Theory",
      "Boolean Algebra","Differential Equations","Laplace Transforms","Fourier Series",
      "Numerical Methods","Vector Calculus","Electric Circuits","Digital Electronics",
      "Control Systems","Thermodynamics","Fluid Mechanics","Kinematics",
      "Algorithms and Time Complexity","Cryptography Basics","Optimization Techniques",
    ];
    const topic      = req.query.topic || TOPICS[Math.floor(Math.random() * TOPICS.length)];
    const difficulty = req.query.difficulty || "medium";

    const prompt = `Generate ONE engineering mathematics MCQ for BMSIT students.
Topic: ${topic}
Difficulty: ${difficulty}

Return ONLY this JSON (no markdown):
{
  "title": "short descriptive title",
  "question": "full question text",
  "options": ["option A", "option B", "option C", "option D"],
  "correct_index": 0,
  "difficulty": "${difficulty}",
  "points": ${difficulty === "easy" ? 20 : difficulty === "hard" ? 100 : 50},
  "solution": "step-by-step explanation of the correct answer"
}`;

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model:    "deepseek/deepseek-chat",
        messages: [
          { role: "system", content: "Output only valid JSON. No markdown. No extra text." },
          { role: "user",   content: prompt },
        ],
        temperature: 0.4,
        max_tokens:  800,
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type":  "application/json",
        },
        timeout: 35000,
      }
    );

    let text = response.data?.choices?.[0]?.message?.content || "";
    text = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const start = text.indexOf("{");
    const end   = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON in AI response");

    const question = JSON.parse(text.slice(start, end + 1));
    if (!question.title || !question.question || !Array.isArray(question.options)) {
      throw new Error("AI returned incomplete question");
    }

    return res.json(question);
  } catch (err) {
    console.error("[AdminAI] Error:", err.message);
    return res.status(500).json({ error: "AI generation failed: " + err.message });
  }
};

/* ═══════════════════════════════════════════
   AI QUESTION — Save to DB
   POST /api/admin/save
═══════════════════════════════════════════ */
export const saveAIQuestion = async (req, res) => {
  try {
    const q = req.body;

    if (!q.title || !q.question || !Array.isArray(q.options) || q.options.length !== 4) {
      return res.status(400).json({ error: "Invalid question format" });
    }

    // Shuffle to avoid correct answer always being first
    const correctAnswer = q.options[q.correct_index];
    const shuffled      = [...q.options].sort(() => Math.random() - 0.5);

    const { data, error } = await supabase
      .from("challenges")
      .insert({
        title:         q.title,
        question:      q.question,
        options:       shuffled,
        correct_index: shuffled.indexOf(correctAnswer),
        difficulty:    (q.difficulty || "medium").toLowerCase(),
        points:        Number(q.points) || 50,
        solution:      q.solution || null,      // ← uses `solution` column
        is_active:     true,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ success: true, challenge: data });
  } catch (err) {
    return res.status(500).json({ error: "Failed to save question" });
  }
};

/* ═══════════════════════════════════════════
   USERS — Get all students
   GET /api/admin/users
═══════════════════════════════════════════ */
export const getAllUsers = async (req, res) => {
  try {
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(100, Number(req.query.limit) || 50);
    const from  = (page - 1) * limit;

    const { data, count, error } = await supabase
      .from("students")
      .select("id, user_id, name, email, xp, title, role, department, subject, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + limit - 1);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ users: data || [], total: count || 0, page, limit });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch users" });
  }
};

/* ═══════════════════════════════════════════
   USERS — Create new user (admin)
   POST /api/admin/users/create
═══════════════════════════════════════════ */
export const createUser = async (req, res) => {
  try {
    const { name, email, password, role = "student", department, subject } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    if (!["student", "teacher", "admin"].includes(role)) {
      return res.status(400).json({ error: "role must be 'student', 'teacher' or 'admin'" });
    }

    // Create in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,  // skip email verification for admin-created accounts
      user_metadata: { name: name || email.split("@")[0] },
    });

    if (authError) return res.status(500).json({ error: authError.message });

    const userId = authData.user.id;

    // Upsert into students table
    const { error: dbError } = await supabase
      .from("students")
      .upsert({
        user_id:    userId,
        email:      email.toLowerCase(),
        name:       name || email.split("@")[0],
        role,
        xp:         0,
        title:      "Axiom Scout",
        department: department || null,
        subject:    subject    || null,
      }, { onConflict: "email" });

    if (dbError) {
      console.error("[CreateUser] Students insert error:", dbError.message);
      // User was created in Auth — partial failure
    }

    return res.status(201).json({
      success: true,
      message: `User ${email} created successfully`,
      userId,
    });
  } catch (err) {
    console.error("[CreateUser] Error:", err.message);
    return res.status(500).json({ error: "Failed to create user" });
  }
};

/* ═══════════════════════════════════════════
   USERS — Reset password
   POST /api/admin/users/:userId/reset-password
═══════════════════════════════════════════ */
export const resetUserPassword = async (req, res) => {
  try {
    const { userId }      = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: "Password reset successfully" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to reset password" });
  }
};

/* ═══════════════════════════════════════════
   USERS — Update role
   PATCH /api/admin/users/:userId/role
═══════════════════════════════════════════ */
export const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role }   = req.body;

    if (!["student", "teacher", "admin"].includes(role)) {
      return res.status(400).json({ error: "Role must be 'student', 'teacher' or 'admin'" });
    }

    const { error } = await supabase
      .from("students")
      .update({ role })
      .eq("user_id", userId);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update role" });
  }
};

/* ═══════════════════════════════════════════
   USERS — Delete user
   DELETE /api/admin/users/:userId
═══════════════════════════════════════════ */
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Delete from students table first
    await supabase.from("students").delete().eq("user_id", userId);

    // Delete from Supabase Auth
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ success: true, message: "User deleted" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete user" });
  }
};

/* ═══════════════════════════════════════════
   EVENTS — All CRUD (use `date` column)
   BUG FIX: was using event_date — table has `date`
═══════════════════════════════════════════ */

export const getAdminEvents = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("date", { ascending: true });    // ← FIXED: was event_date

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch events" });
  }
};

export const createEvent = async (req, res) => {
  try {
    const { title, description, location, date } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });

    const { data, error } = await supabase
      .from("events")
      .insert({ title, description, location, date })  // ← uses `date` column
      .select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ success: true, event: data });
  } catch (err) {
    return res.status(500).json({ error: "Failed to create event" });
  }
};

export const updateEvent = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("events")
      .update(req.body)
      .eq("id", req.params.id)
      .select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, event: data });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update event" });
  }
};

export const deleteEvent = async (req, res) => {
  try {
    const { error } = await supabase.from("events").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete event" });
  }
};

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
  } catch (err) {
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
    const { performWeeklyReset } = await import("../services/weeklyReset.js");
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


/* ═══════════════════════════════════════════════
   DATA MANAGEMENT
   Admin can clear/delete platform data
═══════════════════════════════════════════════ */

/* Clear all arena attempts for a user — DELETE /api/admin/data/attempts/:userId */
export const clearUserAttempts = async (req, res) => {
  try {
    const { error } = await supabase
      .from("arena_attempts")
      .delete()
      .eq("user_id", req.params.userId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: "Arena attempts cleared" });
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* Reset a user's XP to 0 — PATCH /api/admin/data/reset-xp/:userId */
export const resetUserXP = async (req, res) => {
  try {
    const { error } = await supabase
      .from("students")
      .update({ xp: 0, weekly_xp: 0 })
      .eq("user_id", req.params.userId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: "XP reset to 0" });
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* Delete a team and its project — DELETE /api/admin/data/teams/:teamId */
export const deleteTeam = async (req, res) => {
  try {
    // Projects cascade delete via FK, but delete explicitly first
    await supabase.from("projects").delete().eq("team_id", req.params.teamId);
    const { error } = await supabase.from("teams").delete().eq("id", req.params.teamId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: "Team and project deleted" });
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* Delete a project — DELETE /api/admin/data/projects/:projectId */
export const deleteProject = async (req, res) => {
  try {
    await supabase.from("project_votes").delete().eq("project_id", req.params.projectId);
    const { error } = await supabase.from("projects").delete().eq("id", req.params.projectId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: "Project deleted" });
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* Get all teams with their projects — GET /api/admin/data/teams */
export const getAllTeams = async (req, res) => {
  try {
    const { data: teams, error } = await supabase
      .from("teams")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    const { data: projects } = await supabase
      .from("projects")
      .select("id, team_id, title, is_approved, total_points, category");

    const projectMap = {};
    (projects || []).forEach(p => { projectMap[p.team_id] = p; });

    // Enrich with member names
    const { data: students } = await supabase
      .from("students")
      .select("user_id, name, email");
    const studentMap = {};
    (students || []).forEach(s => { studentMap[s.user_id] = s; });

    const enriched = (teams || []).map(t => ({
      ...t,
      project: projectMap[t.id] || null,
      member_names: (t.members || []).map(uid => studentMap[uid]?.name || studentMap[uid]?.email || uid),
    }));

    return res.json(enriched);
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* Get all scheduled tests — GET /api/admin/data/tests */
export const getAllScheduledTests = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("scheduled_tests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* Delete a scheduled test — DELETE /api/admin/data/tests/:testId */
export const deleteScheduledTest = async (req, res) => {
  try {
    await supabase.from("test_attempts").delete().eq("test_id", req.params.testId);
    const { error } = await supabase.from("scheduled_tests").delete().eq("id", req.params.testId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* Clear ALL arena attempts (nuclear) — DELETE /api/admin/data/all-attempts */
export const clearAllAttempts = async (req, res) => {
  try {
    const { error } = await supabase
      .from("arena_attempts")
      .delete()
      .gte("id", "00000000-0000-0000-0000-000000000000");
    if (error) return res.status(500).json({ error: error.message });
    // Also reset all XP
    await supabase
      .from("students")
      .update({ xp: 0, weekly_xp: 0 })
      .gte("id", "00000000-0000-0000-0000-000000000000");
    return res.json({ success: true, message: "All attempts cleared and XP reset" });
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* ═══════════════════════════════════════════════════════════════
   EXPORT ALL DATA — ZIP with CSV files
   GET /api/admin/export

   Downloads a ZIP containing:
     students.csv        — all users with XP, role, title
     challenges.csv      — all challenges
     arena_attempts.csv  — all arena submissions
     events.csv          — all events
     event_registrations.csv — all event registrations
     event_attendance.csv    — all attendance records
     event_leaderboard.csv  — all event scores
     achievements.csv       — achievement catalog
     user_achievements.csv  — all unlocked achievements
     notifications.csv      — all notifications
     friendships.csv        — all friend connections
═══════════════════════════════════════════════════════════════ */

function toCsv(rows) {
  if (!rows || rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  return [
    headers.join(","),
    ...rows.map(row => headers.map(h => escape(row[h])).join(","))
  ].join("\n");
}

export const exportAllData = async (req, res) => {
  try {
    // Fetch all tables in parallel
    const [
      students, challenges, attempts, events,
      registrations, attendance, leaderboard,
      achievementsDef, userAchievements,
      notifications, friendships,
    ] = await Promise.all([
      supabase.from("students").select("user_id, name, email, role, xp, weekly_xp, title, department, subject, bio, created_at").then(r => r.data || []),
      supabase.from("challenges").select("id, title, difficulty, points, is_active, created_at").then(r => r.data || []),
      supabase.from("arena_attempts").select("user_id, challenge_id, selected_index, correct, xp_earned, created_at").then(r => r.data || []),
      supabase.from("events").select("id, title, event_type, date, starts_at, ends_at, location, organiser, capacity, xp_reward, registration_open, is_active, created_at").then(r => r.data || []),
      supabase.from("event_registrations").select("id, event_id, user_id, status, registered_at, cancelled_at, checked_in_at, team_name").then(r => r.data || []).catch(() => []),
      supabase.from("event_attendance").select("id, event_id, user_id, checkin_method, checkin_time, xp_awarded, session_label").then(r => r.data || []).catch(() => []),
      supabase.from("event_leaderboard").select("id, event_id, user_id, score, rank, team_name, judged_at").then(r => r.data || []).catch(() => []),
      supabase.from("achievements").select("id, slug, title, category, criteria_type, criteria_value, xp_reward, rarity").then(r => r.data || []).catch(() => []),
      supabase.from("user_achievements").select("id, user_id, achievement_id, event_id, unlocked_at, xp_awarded").then(r => r.data || []).catch(() => []),
      supabase.from("notifications").select("id, user_id, title, body, type, is_read, link, created_at").then(r => r.data || []).catch(() => []),
      supabase.from("friendships").select("id, requester_id, recipient_id, status, created_at").then(r => r.data || []).catch(() => []),
    ]);

    // Build CSV files
    const files = [
      { name: "students.csv", data: toCsv(students) },
      { name: "challenges.csv", data: toCsv(challenges) },
      { name: "arena_attempts.csv", data: toCsv(attempts) },
      { name: "events.csv", data: toCsv(events) },
      { name: "event_registrations.csv", data: toCsv(registrations) },
      { name: "event_attendance.csv", data: toCsv(attendance) },
      { name: "event_leaderboard.csv", data: toCsv(leaderboard) },
      { name: "achievements.csv", data: toCsv(achievementsDef) },
      { name: "user_achievements.csv", data: toCsv(userAchievements) },
      { name: "notifications.csv", data: toCsv(notifications) },
      { name: "friendships.csv", data: toCsv(friendships) },
    ];

    // Stream ZIP response
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="math-collective-export-${new Date().toISOString().slice(0,10)}.zip"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => res.status(500).json({ error: err.message }));
    archive.pipe(res);

    // Add summary
    const summary = [
      `Math Collective — Data Export`,
      `Date: ${new Date().toISOString()}`,
      `Exported by: ${req.session?.user?.name || "admin"}`,
      ``,
      `Files:`,
      ...files.map(f => `  ${f.name} — ${f.data ? f.data.split("\n").length - 1 : 0} rows`),
    ].join("\n");
    archive.append(summary, { name: "README.txt" });

    // Add CSV files
    for (const f of files) {
      archive.append(f.data || "No data", { name: f.name });
    }

    await archive.finalize();
  } catch (err) {
    console.error("[Export]", err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Export failed: " + err.message });
    }
  }
};
