/**
 * Web Push delivery service.
 *
 * Wraps the `web-push` library so controllers don't need to care about VAPID
 * key state or 404/410 cleanup. Safe to call without VAPID keys configured —
 * it just no-ops and logs a warning, so notifications still work via Socket.IO
 * in dev environments where push isn't set up yet.
 */

import webpush from "web-push";
import supabase from "../config/supabase.js";

let configured = false;

/**
 * Reads VAPID_* env vars and configures the web-push library. Idempotent —
 * safe to call multiple times. Returns true on success, false if keys are
 * missing.
 */
function ensureConfigured() {
  if (configured) return true;

  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const contact    = process.env.VAPID_CONTACT || "mailto:admin@example.com";

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(contact, publicKey, privateKey);
  configured = true;
  return true;
}

export function isWebPushConfigured() {
  return ensureConfigured();
}

/**
 * Send a web-push notification to every stored subscription for `userId`.
 * Fire-and-forget — failures are logged but never thrown. 404 / 410 responses
 * from the push service mean the subscription is dead; we remove those rows
 * so we don't keep trying forever.
 *
 * @param {string} userId
 * @param {{ title: string, body?: string, icon?: string, link?: string, tag?: string }} payload
 */
export async function sendWebPush(userId, payload) {
  if (!ensureConfigured()) return; // no keys set — silently skip

  try {
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, auth, p256dh")
      .eq("user_id", userId);

    if (error || !subs?.length) return;

    const notification = JSON.stringify({
      title: payload.title || "Math Collective",
      body:  payload.body || payload.message || "",
      icon:  payload.icon || "/app/icons/icon-192.png",
      badge: "/app/icons/icon-192.png",
      tag:   payload.tag || `notif-${Date.now()}`,
      data:  { url: payload.link || "/notifications" },
    });

    // Fire pushes in parallel; collect dead-subscription ids for cleanup.
    const dead = [];
    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } },
          notification,
          { TTL: 60 * 60 * 24 }, // 24h — old news isn't worth delivering
        );
      } catch (err) {
        // 404 (not found) or 410 (gone) => subscription is dead, remove it.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          dead.push(sub.id);
        } else {
          console.error(`[WebPush] delivery failed for sub ${sub.id}:`, err?.message || err);
        }
      }
    }));

    if (dead.length) {
      await supabase.from("push_subscriptions").delete().in("id", dead);
      console.log(`[WebPush] cleaned up ${dead.length} dead subscription(s)`);
    }
  } catch (err) {
    console.error("[WebPush] sendWebPush error:", err?.message || err);
  }
}
