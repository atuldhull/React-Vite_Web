# PWA & Web Push — Setup Guide

This document covers installing the app on a device, how push
notifications are wired end-to-end, and what you (the operator) still
need to configure.

## 1. "Can I install it as an app?"

Yes, on every major platform.

| Platform | Install flow | Notes |
|----------|--------------|-------|
| Chrome / Edge (desktop) | Address-bar install icon, or our **Install** button in the header | Fires `beforeinstallprompt` |
| Chrome (Android) | Our **Install** button, or browser menu "Add to Home screen" | Standalone, full-screen |
| Samsung Internet | Our **Install** button | |
| iOS Safari | Share sheet -> **Add to Home Screen** | iOS never fires `beforeinstallprompt`; we show an inline hint instead |
| Firefox (desktop) | No direct install; works as a regular PWA tab | Firefox removed native install support |

Installability is driven by `public/app/manifest.json` plus the service
worker at `public/app/sw.js`. Both are already in place. Once installed:

- App runs in `display: standalone` — no browser chrome, no URL bar.
- Home-screen icon is `icon-192.png` / `icon-512.png` (maskable).
- Splash screen uses the manifest `background_color` (`#030712`) and
  `theme_color` (`#7c3aed`).
- App shortcuts (long-press the icon on Android) jump straight to Arena,
  Dashboard, or Live Quiz.

## 2. "Will the layouts survive install mode?"

Yes — and explicitly tested for:

- **Viewport**: `viewport-fit=cover` in `frontend/index.html` exposes
  the device's safe-area insets.
- **Notch / home-indicator padding**: `body` in `theme.css` applies
  `padding: env(safe-area-inset-*)` so sticky headers and fixed
  footers don't get clipped under the iPhone notch or the Android
  gesture bar.
- **Helper classes**: `.sai-top`, `.sai-bottom`, `.sai-left`,
  `.sai-right` for per-element safe-area insets.
- **Touch targets**: minimum 44px enforced via the existing
  `@media (hover: none) and (pointer: coarse)` rule in `theme.css`.
- **Responsive breakpoints**: every layout uses Tailwind `lg:` /
  `sm:` prefixes; hamburger menu kicks in under `lg`.
- **No horizontal overflow**: `overflow-x: hidden` on `body` below
  480px in `theme.css`.

If you resize the DevTools viewport from desktop down through iPhone SE
(375px) and iPhone 14 Pro (393px with a notch), no element overflows and
no content hides behind the status bar.

## 3. "Will notifications work?"

Three delivery channels, wired together:

| Channel | When user sees it | Requires |
|---------|-------------------|----------|
| **Database row** | Notifications page + bell badge when user next visits | nothing |
| **Socket.IO in-app toast** | Only while the tab is open | nothing |
| **Web Push (service worker)** | As a system notification banner, even with the tab closed OR the browser closed (app installed) | VAPID keys + the push_subscriptions table |

`backend/controllers/notificationController.js::sendNotification` fires
all three for every notification. No caller code changes.

## 4. Web Push setup (the one thing you still need to do)

### Step 1 — install deps (already done on `main`)

```
npm install web-push
```

### Step 2 — generate a VAPID key pair

Run once, keep the output secret:

```
node backend/scripts/generateVapidKeys.js
```

Output looks like:

```
VAPID_PUBLIC_KEY=BMn7...
VAPID_PRIVATE_KEY=qR7X...
VAPID_CONTACT=mailto:admin@your-domain.com

VITE_VAPID_PUBLIC_KEY=BMn7...
```

### Step 3 — populate env

Add the three backend lines to **`.env.local`** (server-side only):

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_CONTACT=mailto:admin@your-domain.com
```

Add the public key to **frontend env** so Vite embeds it in the bundle:

```
VITE_VAPID_PUBLIC_KEY=...       # SAME as VAPID_PUBLIC_KEY
```

The private key MUST NEVER ship to the browser. Only the public key
gets the `VITE_` prefix.

### Step 4 — apply the SQL migration

In Supabase SQL editor (or your migration runner), run
`backend/migrations/13_push_subscriptions.sql`. It creates a single
table `push_subscriptions` with one row per (user, browser) pair.

### Step 5 — restart the backend

`npm start`. On first notification:

- The user will see a permission prompt the first time they log in.
- If they grant, the browser generates a PushSubscription and POSTs
  it to `/api/notifications/push-subscribe`.
- From then on, every call to `sendNotification({ userIds, ... })`
  fires a web push that shows up as a system notification — even
  when the app is closed.
- If a subscription becomes invalid (user cleared browser data, etc.),
  the server gets a 404/410 back from the push service and deletes
  the stale row automatically.

## 5. How it behaves when VAPID keys are missing

Everything still works, push just doesn't fire:

- `services/webPush.js::sendWebPush` early-returns and logs nothing.
- `frontend/src/lib/pushNotifications.js` logs `"VITE_VAPID_PUBLIC_KEY
  not set — skipping subscribe"` once and stops.
- Socket.IO in-app toasts continue to work.
- Notification DB rows continue to persist.

So you can develop locally without VAPID keys, then flip push on in
production by just adding the env vars and restarting.

## 6. Architecture reference

```
User action triggers a notification:
  controllers/notificationController.js
       sendNotification({ userIds, title, body, link })
       ├── 1. INSERT into notifications table
       ├── 2. services/realtime.js::pushNotification(userId, payload)
       │       -> io.to(`user:${userId}`).emit("notification", payload)
       │       -> only sockets that did `register_user` (session-verified)
       │          receive this
       └── 3. services/webPush.js::sendWebPush(userId, payload)
               -> look up rows in push_subscriptions
               -> web-push.sendNotification() for each
               -> browser's Push Service delivers to the SW
               -> public/app/sw.js `push` event fires
               -> self.registration.showNotification()
```

The three channels are independent: DB is persistent, Socket is
live-only, Web Push is the only one that reaches a closed-tab user.

## 7. Security notes

- **VAPID private key**: server-only. Never ship to the browser.
- **Subscription storage**: `push_subscriptions` has `user_id NOT NULL`
  and `ON DELETE CASCADE` — deleting a user auto-removes their
  subscriptions.
- **Subscribe endpoint**: `POST /api/notifications/push-subscribe` is
  `requireAuth`-guarded. A malicious client can only subscribe under
  their own session.
- **Unsubscribe endpoint**: same guard; users can only unsubscribe
  their own endpoints.
- **Socket binding**: `register_user` refuses silently if the socket
  has no session — covers the previous `socket.userId || clientUserId`
  bypass that could have let an anonymous client subscribe to any
  user's Socket.IO notification stream.

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| "VAPID public key not set" in console | `VITE_VAPID_PUBLIC_KEY` missing from frontend env or build wasn't rerun | Set it, rebuild frontend |
| Permission prompt never appears | Already in "denied" state from a previous dismissal | Browser settings -> Site permissions -> Reset |
| Push arrives on web but not after install | SW scope mismatch | Verify `public/app/sw.js` is served at `/app/sw.js` (not redirected) |
| `relation "push_subscriptions" does not exist` | migration not run | Run `backend/migrations/13_push_subscriptions.sql` |
| Push never delivers in production | VAPID keys not set in production env | Copy `VAPID_*` vars to your hosting platform |
