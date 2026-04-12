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

import http from "http";
import { Server } from "socket.io";
import { createApp }    from "./app.js";
import { attachSocket } from "./socket/index.js";

const isProd = process.env.NODE_ENV === "production";
const app    = createApp();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: isProd ? false : "*", credentials: true },
});

attachSocket(io);

/* ── START ── */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
┌─────────────────────────────────────────┐
│   \u2726  MATH COLLECTIVE \u2014 SERVER LIVE  \u2726   │
├─────────────────────────────────────────┤
│  \u{1F310}  http://localhost:${PORT}               │
│  \u{1F511}  Service Role: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '\u2705 Set' : '\u274C MISSING'}           │
│  \u26A1  Live Quiz (Socket.io): ACTIVE      │
│  \u{1F3DB}\uFE0F  Multi-Tenant: ACTIVE              │
└─────────────────────────────────────────┘
  `);
});

export { io, app };
