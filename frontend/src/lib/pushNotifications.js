/**
 * Push Notification Utilities
 *
 * Handles:
 *   - Permission request
 *   - Service worker registration
 *   - Push subscription (VAPID)
 *   - Sending subscription to backend
 */

const SW_PATH = "/app/sw.js";
const SW_SCOPE = "/app/";

/**
 * Register the service worker.
 * Call this on app startup.
 */
export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.warn("[PWA] Service workers not supported");
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE });
    console.log("[PWA] Service worker registered:", registration.scope);

    // Check for updates every 30 minutes
    setInterval(() => registration.update(), 30 * 60 * 1000);

    return registration;
  } catch (err) {
    console.error("[PWA] SW registration failed:", err);
    return null;
  }
}

/**
 * Request push notification permission.
 * Returns the permission state: 'granted' | 'denied' | 'default'
 */
export async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    console.warn("[PWA] Notifications not supported");
    return "denied";
  }

  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";

  const result = await Notification.requestPermission();
  return result;
}

/**
 * Subscribe to push notifications.
 * Returns the PushSubscription object (send to backend).
 *
 * NOTE: Requires a VAPID public key. For now, this is a placeholder.
 * To enable real push: generate VAPID keys with `web-push generate-vapid-keys`
 * and set the public key here.
 */
export async function subscribeToPush(registration) {
  if (!registration) return null;

  try {
    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();
    if (subscription) return subscription;

    // VAPID public key — replace with your generated key
    // Generate with: npx web-push generate-vapid-keys
    const VAPID_PUBLIC_KEY = ""; // Set this after generating

    if (!VAPID_PUBLIC_KEY) {
      console.warn("[PWA] VAPID public key not set — push disabled");
      return null;
    }

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    return subscription;
  } catch (err) {
    console.error("[PWA] Push subscription failed:", err);
    return null;
  }
}

/**
 * Send push subscription to backend for storage.
 */
export async function sendSubscriptionToServer(subscription) {
  if (!subscription) return;

  try {
    await fetch("/api/notifications/push-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
  } catch (err) {
    console.error("[PWA] Failed to send subscription to server:", err);
  }
}

/**
 * Full push notification setup flow.
 * Call this after user logs in.
 */
export async function setupPushNotifications() {
  const permission = await requestNotificationPermission();
  if (permission !== "granted") return null;

  const registration = await registerServiceWorker();
  if (!registration) return null;

  const subscription = await subscribeToPush(registration);
  if (subscription) {
    await sendSubscriptionToServer(subscription);
  }

  return subscription;
}

// Helper: convert VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
