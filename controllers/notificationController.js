import supabase from "../config/supabase.js";
import { pushNotification } from "../server.js";

/* ── GET notifications for current user ── */
export const getNotifications = async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Login required" });

  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: error.message });

    // Return flat array — frontend expects Array.isArray(data) to be true
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* ── MARK one notification as read ── */
export const markRead = async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Login required" });

  try {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", req.params.id)
      .eq("user_id", userId);

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* ── MARK ALL as read ── */
export const markAllRead = async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Login required" });

  try {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* ── DELETE / clear all notifications ── */
export const clearAll = async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Login required" });

  try {
    await supabase.from("notifications").delete().eq("user_id", userId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* ── SEND notification to specific users (internal helper + admin endpoint) ── */
export const sendNotification = async ({ userIds, title, body, type = "info", link = null }) => {
  if (!userIds?.length) return;
  try {
    const rows = userIds.map(uid => ({ user_id: uid, title, body, type, link, is_read: false }));
    const { data: inserted } = await supabase.from("notifications").insert(rows).select();

    // Push real-time socket event to each connected user
    (inserted || rows).forEach((row, i) => {
      pushNotification(userIds[i], {
        id:         row.id || null,
        title:      row.title,
        body:       row.body,
        type:       row.type,
        link:       row.link,
        is_read:    false,
        created_at: row.created_at || new Date().toISOString(),
      });
    });
  } catch (err) {
    console.error("[Notif] send error:", err.message);
  }
};

/* ── BROADCAST to ALL students (admin) ── */
export const broadcastNotification = async (req, res) => {
  const { title, body, type = "info", link } = req.body;
  if (!title || !body) return res.status(400).json({ error: "title and body required" });

  try {
    const { data: students } = await supabase
      .from("students")
      .select("user_id")
      .eq("role", "student");

    const rows = (students || []).map(s => ({
      user_id: s.user_id, title, body, type, link: link || null, is_read: false,
    }));

    if (rows.length) {
      const { data: inserted } = await supabase.from("notifications").insert(rows).select();
      // Push real-time socket events
      (inserted || rows).forEach(row => {
        pushNotification(row.user_id, {
          id:         row.id || null,
          title:      row.title,
          body:       row.body,
          type:       row.type,
          link:       row.link,
          is_read:    false,
          created_at: row.created_at || new Date().toISOString(),
        });
      });
    }
    return res.json({ success: true, sent: rows.length });
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};
