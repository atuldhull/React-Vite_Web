/**
 * Socket.IO Redis adapter wiring.
 *
 * Why: Socket.IO's default in-process adapter only broadcasts events
 * to clients connected to THIS Node instance. The audit (issue 8)
 * flagged that Render auto-scaling or a second instance would silently
 * fragment live-quiz sessions — a teacher pushing the next question
 * from instance A would only reach the half of the class connected
 * to A, while students on instance B sit on the previous question.
 *
 * What this gives:
 *   When REDIS_URL is set, every Socket.IO emit is published through
 *   Redis pub/sub so all instances see it and re-broadcast to their
 *   local clients. The behaviour is identical to single-instance from
 *   the application's point of view — same `io.to(room).emit(...)`
 *   call sites, just no longer instance-bound.
 *
 *   When REDIS_URL is NOT set (dev, single-instance prod), this is a
 *   no-op and Socket.IO uses its default adapter — fine for the
 *   classroom-scale workload that single instance can handle.
 *
 * Limitation NOT addressed by this file:
 *   The in-memory quizStore (backend/socket/quizStore.js) is still a
 *   process-local `Map`. Live quiz STATE survives instance scaling
 *   only if the adapter is here AND state migrates to a Redis-backed
 *   store. That's a separate, larger refactor; this PR fixes the
 *   broadcast layer first because that's what causes the visible
 *   "students stuck on old question" symptom.
 */

import { createAdapter } from "@socket.io/redis-adapter";
import { createClient }  from "redis";
import { logger }        from "../config/logger.js";

let pubClient = null;
let subClient = null;

/**
 * Attach the Redis adapter to a Socket.IO Server. Returns true if the
 * adapter was installed, false if it was skipped (no REDIS_URL).
 *
 * Both pub and sub clients connect with no automatic retry-forever
 * behaviour. If Redis is unreachable on boot we log + fall through to
 * the default adapter rather than crashing the server — a degraded
 * single-instance is still better than a server that won't boot.
 */
export async function attachRedisAdapter(io) {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.info("Socket.IO: no REDIS_URL set, using default in-memory adapter (single-instance only).");
    return false;
  }

  try {
    pubClient = createClient({ url });
    subClient = pubClient.duplicate();

    pubClient.on("error", (err) => logger.error({ err }, "Socket.IO Redis pub client error"));
    subClient.on("error", (err) => logger.error({ err }, "Socket.IO Redis sub client error"));

    await Promise.all([pubClient.connect(), subClient.connect()]);

    io.adapter(createAdapter(pubClient, subClient));
    logger.info({ url: redactUrl(url) }, "Socket.IO Redis adapter attached — multi-instance broadcast active");
    return true;
  } catch (err) {
    // Don't take the server down because Redis is sick. Fall through
    // to the default adapter and surface the failure loudly so an
    // operator sees it in Render logs.
    logger.error({ err, url: redactUrl(url) },
      "Socket.IO Redis adapter failed to attach — falling back to default in-memory adapter");
    pubClient = null;
    subClient = null;
    return false;
  }
}

/**
 * Cleanly disconnect the Redis clients on server shutdown. Called
 * from server.js's process-exit handlers (or directly from tests).
 */
export async function detachRedisAdapter() {
  const closes = [];
  if (pubClient) closes.push(pubClient.quit().catch(() => {}));
  if (subClient) closes.push(subClient.quit().catch(() => {}));
  pubClient = null;
  subClient = null;
  await Promise.all(closes);
}

// Redact any password segment of the URL before logging — Redis URLs
// are commonly `redis://:password@host:port` and we never want creds
// to appear in Render's structured logs.
function redactUrl(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "(unparseable)";
  }
}
