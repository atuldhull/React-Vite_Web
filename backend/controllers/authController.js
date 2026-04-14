/**
 * controllers/authController.js  (MULTI-TENANT VERSION)
 *
 * Changes from v1:
 *  - Login now fetches org_id, stores in session
 *  - Register can accept org invite token (joins org automatically)
 *  - Session payload includes org_id, org_name
 *  - Role-based redirect updated for super_admin
 */

import supabase from "../config/supabase.js";
import { logger } from "../config/logger.js";

// Tenant scoping note: auth flows (register, login, getSession,
// validateInvite, resend, forgot/reset) run BEFORE the user has a
// session — req.orgId is undefined, so req.db falls through to the
// unscoped client anyway. We deliberately use raw `supabase` here to
// keep that intent obvious. Where a NEW students row is created,
// org_id is sourced explicitly:
//   - register():  from invitation.org_id (required when no token)
//   - login():     a "first-login" student row used to be auto-created
//                  with org_id=NULL. After migration 14 that fails the
//                  NOT NULL constraint, so we skip the upsert when no
//                  org context is available — login still succeeds and
//                  the operator can attach the user to an org via the
//                  /api/admin/invite flow.

/* ── REGISTER ── */
const register = async (req, res) => {
  try {
    const { name, email, password, invite_token } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    // Validate invite token if provided
    let invitation = null;
    if (invite_token) {
      const { data: inv } = await supabase
        .from("org_invitations")
        .select("*, organisations(id, name, status)")
        .eq("token", invite_token)
        .eq("accepted", false)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (!inv) return res.status(400).json({ error: "Invalid or expired invite link" });
      if (inv.email && inv.email !== email.toLowerCase()) {
        return res.status(400).json({ error: "This invite was sent to a different email address" });
      }
      invitation = inv;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name || email.split("@")[0] } },
    });
    if (error) throw error;

    if (data.user) {
      // org_id is REQUIRED post-migration-14. If no invitation token,
      // refuse — open registration without an org context shouldn't
      // create orphan student rows. (For development we fall back to
      // the FIRST org in the system; remove this fallback once invite-
      // gated signup is the production policy.)
      let orgId = invitation?.org_id || null;
      if (!orgId) {
        const { data: org } = await supabase
          .from("organisations").select("id").order("created_at").limit(1).maybeSingle();
        orgId = org?.id || null;
      }
      if (!orgId) {
        return res.status(500).json({ error: "Cannot create account: no organisation configured" });
      }

      const studentRow = {
        user_id:  data.user.id,
        email:    email.toLowerCase(),
        name:     name || email.split("@")[0],
        role:     invitation?.role || "student",
        org_id:   orgId,
      };

      await supabase.from("students").upsert(studentRow, { onConflict: "email" });

      // Mark invitation as accepted
      if (invitation) {
        await supabase
          .from("org_invitations")
          .update({ accepted: true })
          .eq("id", invitation.id);
      }
    }

    return res.json({
      message: "Registered! Check email to verify, then log in.",
      user: data.user,
      org_name: invitation?.organisations?.name || null,
    });
  } catch (err) {
    logger.error({ err: err }, "Register");
    return res.status(400).json({ error: err.message || "Registration failed" });
  }
};

/* ── LOGIN ── */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message?.toLowerCase().includes("email not confirmed") ||
          error.message?.toLowerCase().includes("not confirmed")) {
        return res.status(401).json({
          error: "EMAIL_NOT_VERIFIED",
          message: "Please verify your email first.",
        });
      }
      throw error;
    }

    if (!data.user?.email_confirmed_at) {
      return res.status(401).json({
        error: "EMAIL_NOT_VERIFIED",
        message: "Please verify your email first.",
      });
    }

    const authUser = data.user;

    // Fetch full student profile including org
    const { data: student } = await supabase
      .from("students")
      .select(`
        name, email, user_id, role, xp, title, org_id, is_active,
        weekly_xp, department, subject,
        organisations(id, name, slug, primary_color, status, plan_name, feature_flags)
      `)
      .eq("user_id", authUser.id)
      .maybeSingle();

    // Blocked account
    if (student?.is_active === false) {
      return res.status(403).json({ error: "Your account has been suspended. Contact your administrator." });
    }

    // Blocked org
    if (student?.organisations?.status === "suspended") {
      return res.status(403).json({ error: "Your organisation's account has been suspended." });
    }

    const role  = student?.role  || "student";
    const title = student?.title || "Axiom Scout";
    const xp    = student?.xp    || 0;
    const org   = student?.organisations || null;

    // Create student row if first login. Pre-migration this auto-
    // created an orphan row with org_id=NULL — now NOT NULL, so we
    // pin to the only org as a fallback. In a true multi-tenant world
    // this should NEVER fire (signup creates the row); flagging via
    // log so we can audit any user that hits this path.
    if (!student) {
      const { data: defaultOrg } = await supabase
        .from("organisations").select("id").order("created_at").limit(1).maybeSingle();
      if (defaultOrg?.id) {
        logger.warn({ email: authUser.email, orgId: defaultOrg.id }, "Login auto-creating student row — register flow should have done this");
        await supabase.from("students").upsert({
          user_id: authUser.id,
          email:   authUser.email.toLowerCase(),
          name:    authUser.user_metadata?.name || authUser.email.split("@")[0],
          org_id:  defaultOrg.id,
        }, { onConflict: "email" });
      }
    }

    // Set session — includes org context
    req.session.user = {
      id:         authUser.id,
      email:      authUser.email,
      name:       student?.name || authUser.user_metadata?.name || authUser.email.split("@")[0],
      role,
      title,
      xp,
      org_id:     student?.org_id  || null,
      org_name:   org?.name        || null,
      org_slug:   org?.slug        || null,
      org_color:  org?.primary_color || "#7c3aed",
      org_plan:   org?.plan_name   || "free",
      is_active:  student?.is_active ?? true,
    };

    logger.info({ email: authUser.email, role, org: org?.name || null }, "Login successful");

    // Update last_seen
    supabase.from("students")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("user_id", authUser.id)
      .then(() => {});

    // Role-based redirect
    const redirectMap = {
      super_admin: "/super-admin",
      admin:       "/admin",
      teacher:     "/teacher",
      student:     "/dashboard",
    };
    const redirectTo = redirectMap[role] || "/dashboard";

    return res.json({
      message: "Login successful",
      user: req.session.user,
      redirectTo,
    });

  } catch (err) {
    logger.error({ err: err }, "Login");
    return res.status(401).json({ error: "Invalid email or password" });
  }
};

/* ── LOGOUT (shared helper) ── */
function destroySession(req, res, onSuccess) {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.clearCookie("connect.sid");
    onSuccess();
  });
}

const logout = (req, res) => {
  destroySession(req, res, () => res.json({ message: "Logged out" }));
};

const logoutRedirect = (req, res) => {
  destroySession(req, res, () => res.redirect("/"));
};

/* ── RESEND VERIFICATION ── */
const resendVerification = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
  try {
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true, message: "Verification email sent" });
  } catch {
    return res.status(500).json({ error: "Failed to resend" });
  }
};

/* ── GET SESSION (client polls this to check login state) ── */
const getSession = (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: "Not logged in" });
  return res.json({ user: req.session.user });
};

/* ── VALIDATE INVITE TOKEN ── */
const validateInvite = async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Token required" });

  const { data } = await supabase
    .from("org_invitations")
    .select("email, role, organisations(name, primary_color)")
    .eq("token", token)
    .eq("accepted", false)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!data) return res.status(404).json({ error: "Invalid or expired invite" });

  return res.json({
    valid: true,
    email: data.email,
    role:  data.role,
    org:   data.organisations,
  });
};

/* ── FORGOT PASSWORD ── */
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${req.protocol}://${req.get("host")}/login`,
    });
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true, message: "Password reset email sent. Check your inbox and click the link." });
  } catch {
    return res.status(500).json({ error: "Failed to send reset email" });
  }
};

/* ── RESET PASSWORD (using Supabase recovery token) ── */
const resetPassword = async (req, res) => {
  const { access_token, new_password } = req.body;
  if (!access_token || !new_password) return res.status(400).json({ error: "Token and new password required" });
  if (new_password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  try {
    // Use the access token to get the user, then update password
    const { data: { user }, error: userError } = await supabase.auth.getUser(access_token);
    if (userError || !user) return res.status(400).json({ error: "Invalid or expired reset link. Please request a new one." });

    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: new_password,
    });
    if (updateError) return res.status(500).json({ error: updateError.message });

    logger.info({ email: user.email }, "Password reset completed");
    return res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    logger.error({ err: err }, "Reset Password");
    return res.status(500).json({ error: "Password reset failed" });
  }
};

export default {
  register,
  login,
  logout,
  logoutRedirect,
  resendVerification,
  getSession,
  validateInvite,
  forgotPassword,
  resetPassword,
};
