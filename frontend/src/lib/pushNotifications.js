/**
 * Push Notification client.
 *
 * Handles the browser-side half of Web Push:
 *   1. wait for the service worker to be ready (registered in main.jsx)
 *   2. request Notification permission
 *   3. call pushManager.subscribe() with our VAPID public key
 *   4. POST the resulting PushSubscription JSON to /api/notifications/push-subscribe
 *
 * VAPID public key is read from import.meta.env.VITE_VAPID_PUBLIC_KEY at
 * build time. If missing, push is silently disabled — in-page Socket.IO
 * notifications still work. See docs/PUSH_NOTIFICATIONS.md for setup.
 */

// Vite replaces this at build time with the value from .env / .env.local.
// Empty string means push is not configured (dev default).
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

/**
 * True iff this browser can plausibly receive web-push. Doesn't check
 * permission — use Notification.permission for that.
 */
export function isPushSupported() {
  return (
    typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window
  );
}

/**
 * Prompt the user for notification permission. Never prompts if the user
 * already granted or explicitly denied — respect their prior choice.
 * Returns: 'granted' | 'denied' | 'default' | 'unsupported'
 */
export async function requestNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied")  return "denied";
  return Notification.requestPermission();
}

/**
 * Get the ready service worker registration. SW registration itself happens
 * once in main.jsx — here we just wait for it.
 */
async function getRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.ready; // resolves once the active SW is controlling
}

/**
 * Subscribe the browser's PushManager and return the PushSubscription.
 * Reuses an existing subscription if one is already active.
 */
async function subscribe(registration) {
  if (!VAPID_PUBLIC_KEY) {
    console.warn("[Push] VITE_VAPID_PUBLIC_KEY not set — skipping subscribe");
    return null;
  }

  // Reuse if already subscribed (browsers deduplicate on endpoint)
  let subscription = await registration.pushManager.getSubscription();
  if (subscription) return subscription;

  subscription = await registration.pushManager.subscribe({
    userVisibleOnly:      true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
  return subscription;
}

/**
 * POST the subscription JSON to the backend so it can be stored against
 * the current session user.
 */
async function postSubscription(subscription) {
  if (!subscription) return;
  try {
    const res = await fetch("/api/notifications/push-subscribe", {
      method:      "POST",
      headers:     { "Content-Type": "application/json" },
      credentials: "include",
      body:        JSON.stringify(subscription.toJSON()),
    });
    if (!res.ok) {
      console.warn("[Push] subscribe POST failed:", res.status);
    }
  } catch (err) {
    console.error("[Push] failed to send subscription:", err);
  }
}

/**
 * End-to-end push setup. Call once per session (e.g., after login).
 * No-ops gracefully on unsupported browsers, missing VAPID keys, or
 * denied permission. Safe to call multiple times.
 */
export async function setupPushNotifications({ promptIfDefault = false } = {}) {
  if (!isPushSupported()) return { status: "unsupported" };

  const current = Notification.permission;
  if (current === "denied") return { status: "denied" };

  if (current === "default") {
    if (!promptIfDefault) return { status: "default" };
    const result = await requestNotificationPermission();
    if (result !== "granted") return { status: result };
  }

  const registration = await getRegistration();
  if (!registration) return { status: "no-sw" };

  const subscription = await subscribe(registration);
  if (!subscription) return { status: "no-vapid" };

  await postSubscription(subscription);
  return { status: "subscribed", subscription };
}

/**
 * Cleanly unsubscribe (and tell the server). Useful on logout.
 */
export async function teardownPushNotifications() {
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;

    await subscription.unsubscribe();
    await fetch("/api/notifications/push-unsubscribe", {
      method:      "POST",
      headers:     { "Content-Type": "application/json" },
      credentials: "include",
      body:        JSON.stringify({ endpoint }),
    }).catch(() => {});
  } catch {
    // non-fatal
  }
}

// VAPID public key is URL-safe base64 — decode to a Uint8Array for subscribe().
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = atob(base64);
  const out     = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}
