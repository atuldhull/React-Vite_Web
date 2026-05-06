/**
 * Entrypoint. Boots the HTTP server + Socket.IO and delegates everything
 * else. See:
 *   - app.js       for Express middleware + routes + error handlers
 *   - socket/      for Socket.IO auth + all real-time event handlers
 *
 * Kept deliberately slim so `node backend/server.js` reads top-to-bottom
 * and the HTTP surface can be unit-tested by importing createApp() directly.
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Resolve project root (one level above backend/) so we can locate .env.local
// regardless of where node is invoked.
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(PROJECT_ROOT, ".env.local") });

// Validate env BEFORE importing anything that uses it. validateEnv()
// process.exit(1)s on missing required vars (with a clear message)
// instead of letting Supabase produce cryptic errors at first DB hit.
import { validateEnv } from "./config/env.js";
const env = validateEnv();

// Install uncaughtException / unhandledRejection handlers EARLY —
// before we import anything else that might throw at module load —
// so those failures land in pino instead of a bare stderr stack.
import { installCrashHandlers } from "./config/crash.js";
installCrashHandlers();

// Initialise Sentry BEFORE createApp() so module-load throws and
// auto-instrumented HTTP spans are captured. No-ops when SENTRY_DSN
// isn't set (feature-gated same pattern as Razorpay / VAPID).
import { initSentry } from "./config/sentry.js";
initSentry();

import http from "http";
import { Server } from "socket.io";
import { createApp }    from "./app.js";
import { attachSocket } from "./socket/index.js";
import { attachRedisAdapter, detachRedisAdapter } from "./socket/redisAdapter.js";

const isProd = env.isProd;
const app    = createApp();
const server = http.createServer(app);

// Socket.IO CORS: in dev allow any origin (wildcard) so we can hit the
// server from the Vite dev server on a different port. In production,
// lock down to the explicit FRONTEND_URL — same policy as the Express
// cors() middleware in app.js. `false` would block all cross-origin,
// which breaks the Socket.IO client even from the same host.
const socketCorsOrigin = isProd
  ? (process.env.FRONTEND_URL || false)
  : true;

const io = new Server(server, {
  cors: {
    origin:      socketCorsOrigin,
    credentials: true,
  },
});

// Attach the Redis pub/sub adapter BEFORE attachSocket so the per-event
// listeners are bound to the multi-instance-capable adapter from the
// first message. attachRedisAdapter is async + best-effort: when
// REDIS_URL is unset (single-instance / dev) it no-ops; if Redis is
// unreachable it logs + falls through to the default adapter so the
// server still boots.
await attachRedisAdapter(io);
attachSocket(io);

// Graceful shutdown — close Redis clients before the process exits so
// pending pub/sub messages are flushed and the connections aren't left
// in a half-closed state.
const shutdown = async (signal) => {
  console.log(`\n[server] ${signal} received, shutting down...`);
  await detachRedisAdapter();
  server.close(() => process.exit(0));
  // Force-exit if close() hangs more than 10s.
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

/* ── START ── */
server.listen(env.port, () => {
  // Service Role is guaranteed set at this point — validateEnv would have
  // exited otherwise — so the line below is informational, not a check.
  console.log(`
┌─────────────────────────────────────────┐
│   \u2726  MATH COLLECTIVE \u2014 SERVER LIVE  \u2726   │
├─────────────────────────────────────────┤
│  \u{1F310}  http://localhost:${env.port}               │
│  \u{1F511}  Service Role: \u2705 Set           │
│  \u26A1  Live Quiz (Socket.io): ACTIVE      │
│  \u{1F3DB}\uFE0F  Multi-Tenant: ACTIVE              │
│  \u2728  Features on: ${String(env.enabledFeatures.length).padEnd(2)} | off: ${String(env.disabledFeatures.length).padEnd(2)}      │
└─────────────────────────────────────────┘
  `);
});

export { io, app };
