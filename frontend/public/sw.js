/* global self, caches, clients, fetch, URL, console, setTimeout, Request, Response, Promise */
/* eslint-env serviceworker */
/**
 * Service Worker — Math Collective PWA
 *
 * Caching strategies:
 *   - CACHE-FIRST: Static assets (JS, CSS, fonts, images, textures)
 *   - NETWORK-FIRST: API calls (/api/*) — fresh data preferred, cached fallback
 *   - STALE-WHILE-REVALIDATE: HTML pages — show cached, update in background
 *   - CACHE-ONLY: Offline fallback page
 *
 * Push notifications: Handles incoming push events for quiz invites, messages, etc.
 */

// Bump CACHE_NAME so the install handler pre-caches fresh with the
// post-fix logic — otherwise every browser that has mc-v1 already
// caches the old sw.js's broken responses.
const CACHE_NAME = "mc-v3";
const OFFLINE_URL = "/app/offline.html";

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  "/app/",
  "/app/offline.html",
  "/app/manifest.json",
  "/app/icons/icon-192.png",
  "/app/icons/icon-512.png",
];

// ═══════════════════════════════════════════════════════════
// INSTALL — pre-cache critical assets
// ═══════════════════════════════════════════════════════════

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Pre-caching critical assets");
      return cache.addAll(PRECACHE_URLS);
    }),
  );
  // Activate immediately (don't wait for old SW to finish)
  self.skipWaiting();
});

// ═══════════════════════════════════════════════════════════
// ACTIVATE — clean up old caches
// ═══════════════════════════════════════════════════════════

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      );
    }),
  );
  // Take control of all open pages immediately
  self.clients.claim();
});

// ═══════════════════════════════════════════════════════════
// FETCH — smart caching per request type
// ═══════════════════════════════════════════════════════════

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (POST, PATCH, etc.)
  if (event.request.method !== "GET") return;

  // Skip WebSocket and Socket.IO
  if (url.pathname.startsWith("/socket.io")) return;

  // Skip cross-origin — browsers treat SW-proxied fetches as connect-src
  // CSP operations, so every third-party origin would need to be listed
  // in connect-src (Google Fonts, Cloudinary, etc.). Far cleaner to let
  // the browser make those requests directly without our caching logic
  // in the way.
  if (url.origin !== self.location.origin) return;

  // ── API calls: Network-first with cache fallback ──
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful GET API responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          // Offline — try cache; if nothing cached, synthesise a 503
          // so respondWith() always gets a real Response (passing
          // undefined crashes the SW with "Failed to convert value
          // to 'Response'").
          const cached = await caches.match(event.request);
          return cached || new Response(JSON.stringify({ error: "offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }),
    );
    return;
  }

  // ── Static assets (JS, CSS, fonts, images, textures): Cache-first ──
  if (
    url.pathname.match(/\.(js|css|woff2?|png|jpg|jpeg|gif|svg|webp|ico|hdr)$/) ||
    url.pathname.includes("/assets/") ||
    url.pathname.includes("/textures/") ||
    url.pathname.includes("/icons/")
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      }),
    );
    return;
  }

  // ── HTML pages: Stale-while-revalidate ──
  if (event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      caches.match(event.request).then(async (cached) => {
        const fetchPromise = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(async () => {
            // Completely offline — try to show fallback page; if even
            // that isn't cached, synthesise a minimal offline page so
            // respondWith() never receives undefined.
            const offline = await caches.match(OFFLINE_URL);
            return offline || new Response("<h1>Offline</h1>", {
              status: 503,
              headers: { "Content-Type": "text/html" },
            });
          });

        return cached || fetchPromise;
      }),
    );
    return;
  }

  // ── Everything else: Network with cache fallback ──
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      return cached || new Response("", { status: 503 });
    }),
  );
});

// ═══════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS
// ═══════════════════════════════════════════════════════════

self.addEventListener("push", (event) => {
  let data = { title: "Math Collective", body: "You have a new notification" };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || data.message || "New notification",
    icon: "/app/icons/icon-192.png",
    badge: "/app/icons/icon-192.png",
    vibrate: [100, 50, 100],
    tag: data.tag || "mc-notification",
    renotify: true,
    data: {
      url: data.url || data.link || "/app/",
    },
    actions: data.actions || [
      { action: "open", title: "Open" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "Math Collective", options),
  );
});

// ── Handle notification click ──
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/app/";

  if (event.action === "dismiss") return;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes("/app/") && "focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Otherwise open new window
      return clients.openWindow(url);
    }),
  );
});

// ── Background sync (for offline message queue) ──
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-messages") {
    // Future: retry sending queued messages when back online
    console.log("[SW] Background sync: sync-messages");
  }
});
