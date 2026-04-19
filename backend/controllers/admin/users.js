import supabase from "../../config/supabase.js";
import { logger } from "../../config/logger.js";

/* ═══════════════════════════════════════════
   USERS — Get all students
   GET /api/admin/users
═══════════════════════════════════════════ */
export const getAllUsers = async (req, res) => {
  try {
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(100, Number(req.query.limit) || 50);
    const from  = (page - 1) * limit;

    const { data, count, error } = await req.db
      .from("students")
      .select("id, user_id, name, email, xp, title, role, department, subject, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + limit - 1);

    if (error) {
      logger.error({ err: error, adminId: req.session?.user?.id }, "getAllUsers query failed");
      return res.status(500).json({ error: error.message });
    }

    // Diagnostic: admins report "teachers/members tab empty". The
    // students table is tenant-scoped via the req.db proxy, so this
    // log reveals whether the filter is simply returning zero rows
    // (org mismatch between the viewing admin and the student rows)
    // vs. an actual DB error or RLS issue.
    logger.info({
      adminId: req.session?.user?.id || null,
      orgId:   req.orgId || null,
      role:    req.userRole || null,
      count:   data?.length || 0,
      total:   count || 0,
      page,
    }, "getAllUsers: tenant-scoped count");

    return res.json({ users: data || [], total: count || 0, page, limit });
  } catch (err) {
    logger.error({ err }, "getAllUsers");
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
    const { error: dbError } = await req.db
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
      logger.error({ err: dbError }, "CreateUser Students insert error");
      // User was created in Auth — partial failure
    }

    return res.status(201).json({
      success: true,
      message: `User ${email} created successfully`,
      userId,
    });
  } catch (err) {
    logger.error({ err: err }, "CreateUser Error");
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
  } catch {
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

    const { error } = await req.db
      .from("students")
      .update({ role })
      .eq("user_id", userId);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch {
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
    await req.db.from("students").delete().eq("user_id", userId);

    // Delete from Supabase Auth
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ success: true, message: "User deleted" });
  } catch {
    return res.status(500).json({ error: "Failed to delete user" });
  }
};
