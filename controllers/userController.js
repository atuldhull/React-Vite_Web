import supabase from "../config/supabase.js";

/* ── XP → Title mapping ── */
export const XP_TITLES = [
  { min: 0,    title: "Axiom Scout"       },
  { min: 200,  title: "Proof Reader"      },
  { min: 500,  title: "Theorem Hunter"    },
  { min: 1000, title: "Series Solver"     },
  { min: 2000, title: "Integral Warrior"  },
  { min: 3500, title: "Conjecture Master" },
  { min: 5000, title: "Prime Theorist"    },
  { min: 7500, title: "Euler's Heir"      },
  { min: 10000,title: "Math Collective Legend" },
];

export function getTitleForXP(xp) {
  let title = XP_TITLES[0].title;
  for (const t of XP_TITLES) {
    if (xp >= t.min) title = t.title;
    else break;
  }
  return title;
}

export function getNextTitle(xp) {
  for (const t of XP_TITLES) {
    if (xp < t.min) return { title: t.title, xpNeeded: t.min - xp, xpRequired: t.min };
  }
  return null; // already at max
}

/* ── Auto-update title when XP changes ── */
export async function syncTitle(userId, xp) {
  const newTitle = getTitleForXP(xp);
  await supabase.from("students").update({ title: newTitle }).eq("user_id", userId);
  return newTitle;
}

/* GET PROFILE — GET /api/user/profile */
export const getProfile = async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Login required" });

  try {
    const { data: student, error } = await supabase
      .from("students")
      .select("name, email, xp, title, role, bio, avatar_letter, avatar_emoji, avatar_color, avatar_config")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!student) return res.status(404).json({ error: "Profile not found" });

    const xp       = student.xp || 0;
    const title    = getTitleForXP(xp);
    const next     = getNextTitle(xp);
    const level    = Math.floor(Math.sqrt(xp / 50)) + 1;

    return res.json({
      name:          student.name  || req.session.user.name,
      email:         student.email || req.session.user.email,
      bio:           student.bio   || "",
      avatar_letter: student.avatar_letter || (student.name||"A").charAt(0).toUpperCase(),
      avatar_emoji:  student.avatar_emoji  || "😎",
      avatar_color:  student.avatar_color  || "linear-gradient(135deg,#7c3aed,#3b82f6)",
      avatar_config: student.avatar_config || null,
      xp, level, title,
      role:          student.role  || "student",
      nextTitle:     next,
      xpTitles:      XP_TITLES,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
};

/* UPDATE PROFILE — PATCH /api/user/profile */
export const updateProfile = async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Login required" });

  const { name, bio, avatar_emoji, avatar_color } = req.body;
  const updates = {};
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: "Name cannot be empty" });
    updates.name          = name.trim().slice(0, 60);
    updates.avatar_letter = name.trim().charAt(0).toUpperCase();
  }
  if (bio !== undefined)          updates.bio          = bio.trim().slice(0, 200);
  if (avatar_emoji !== undefined) updates.avatar_emoji = avatar_emoji;
  if (avatar_color !== undefined) updates.avatar_color = avatar_color;
  if (req.body.avatar_config !== undefined) updates.avatar_config = req.body.avatar_config;

  try {
    const { error } = await supabase.from("students").update(updates).eq("user_id", userId);
    if (error) return res.status(500).json({ error: error.message });

    // Update session name
    if (updates.name) req.session.user.name = updates.name;

    return res.json({ success: true, ...updates });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update profile" });
  }
};

/* GET TEST HISTORY — GET /api/user/test-history */
export const getTestHistory = async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Login required" });

  try {
    const { data, error } = await supabase
      .from("test_attempts")
      .select(`
        id, score, max_score, submitted_at, started_at,
        scheduled_tests ( title, description, starts_at, ends_at )
      `)
      .eq("user_id", userId)
      .eq("submitted", true)
      .order("submitted_at", { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });

    return res.json((data || []).map(a => ({
      id:           a.id,
      score:        a.score,
      maxScore:     a.max_score,
      percentage:   a.max_score > 0 ? Math.round((a.score / a.max_score) * 100) : 0,
      submittedAt:  a.submitted_at,
      test: {
        title:       a.scheduled_tests?.title       || "Unknown Test",
        description: a.scheduled_tests?.description || "",
        date:        a.scheduled_tests?.starts_at   || null,
      },
    })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch test history" });
  }
};

/* GET STATS — GET /api/user/stats */
export const getUserStats = async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Login required" });

  try {
    const { data: student } = await supabase
      .from("students")
      .select("xp, title, role")   // ← FIXED: added role
      .eq("user_id", userId)
      .maybeSingle();

    const { count: total } = await supabase
      .from("arena_attempts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    const { count: correct } = await supabase
      .from("arena_attempts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("correct", true);

    const { count: above } = await supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .gt("xp", student?.xp || 0);

    const xp       = student?.xp || 0;
    const accuracy = total > 0 ? Math.round(((correct || 0) / total) * 100) : 0;
    const rank     = (above || 0) + 1;

    // Auto-sync title based on current XP
    const correctTitle = getTitleForXP(xp);
    if (student && student.title !== correctTitle) {
      await supabase.from("students").update({ title: correctTitle }).eq("user_id", userId);
    }

    return res.json({
      xp,
      solved:    correct || 0,
      total:     total   || 0,
      accuracy,
      rank,
      title:     correctTitle,
      nextTitle: getNextTitle(xp),
      role:      student?.role || "student",
    });
  } catch (err) {
    console.error("[Stats]", err.message);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
};

/* CHANGE PASSWORD — POST /api/user/change-password */
export const changePassword = async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Login required" });

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: "Both passwords required" });
  if (newPassword.length < 8)
    return res.status(400).json({ error: "New password must be at least 8 characters" });

  try {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: req.session.user.email, password: currentPassword,
    });
    if (signInError) return res.status(401).json({ error: "Current password is incorrect" });

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (updateError) return res.status(500).json({ error: "Failed to update password" });

    return res.json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    return res.status(500).json({ error: "Password change failed" });
  }
};