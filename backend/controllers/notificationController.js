import supabase from "../config/supabase.js";
import { pushNotification } from "../services/realtime.js";
import { sendWebPush } from "../services/webPush.js";

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
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* ── SEND notification to specific users (internal helper + admin endpoint) ──
   Three delivery channels all fire together:
     1. DB row (persisted for the notifications page / bell)
     2. Socket.IO event (real-time in-page toast while the user is browsing)
     3. Web Push (service-worker notification, including when the app is closed) */
export const sendNotification = async ({ userIds, title, body, type = "info", link = null }) => {
  if (!userIds?.length) return;
  try {
    const rows = userIds.map(uid => ({ user_id: uid, title, body, type, link, is_read: false }));
    const { data: inserted } = await supabase.from("notifications").insert(rows).select();

    // 2. Real-time socket fan-out (for live in-app toasts)
    (inserted || rows).forEach((row, i) => {
      const targetUserId = userIds[i];
      const payload = {
        id:         row.id || null,
        title:      row.title,
        body:       row.body,
        type:       row.type,
        link:       row.link,
        is_read:    false,
        created_at: row.created_at || new Date().toISOString(),
      };
      pushNotification(targetUserId, payload);

      // 3. Web Push (service-worker notification — works when app is closed)
      //    Non-blocking: fire-and-forget so a slow Push Service can't stall
      //    the Socket emit or the HTTP response.
      sendWebPush(targetUserId, { title, body, link });
    });
  } catch (err) {
    console.error("[Notif] send error:", err.message);
  }
};

/* ── SUBSCRIBE to web push — client sends its PushSubscription JSON ──
   Idempotent on endpoint: re-subscribing just updates the auth/p256dh keys. */
export const subscribePush = async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Login required" });

  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.auth || !keys?.p256dh) {
    return res.status(400).json({ error: "Invalid subscription payload" });
  }

  try {
    const userAgent = (req.headers["user-agent"] || "").slice(0, 255);
    const { error } = await supabase.from("push_subscriptions").upsert({
      user_id:    userId,
      endpoint,
      auth:       keys.auth,
      p256dh:     keys.p256dh,
      user_agent: userAgent,
      last_used_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });

    if (error) {
      console.error("[Push] subscribe error:", error.message);
      return res.status(500).json({ error: "Failed to save subscription" });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("[Push] subscribe exception:", err.message);
    return res.status(500).json({ error: "Failed" });
  }
};

/* ── UNSUBSCRIBE a specific endpoint (called when browser unsubscribes) ── */
export const unsubscribePush = async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Login required" });

  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: "endpoint required" });

  try {
    await supabase.from("push_subscriptions")
      .delete().eq("user_id", userId).eq("endpoint", endpoint);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Failed" });
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
      // Push real-time socket events + web push (same three channels as sendNotification)
      (inserted || rows).forEach(row => {
        const payload = {
          id:         row.id || null,
          title:      row.title,
          body:       row.body,
          type:       row.type,
          link:       row.link,
          is_read:    false,
          created_at: row.created_at || new Date().toISOString(),
        };
        pushNotification(row.user_id, payload);
        sendWebPush(row.user_id, { title: row.title, body: row.body, link: row.link });
      });
    }
    return res.json({ success: true, sent: rows.length });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};
