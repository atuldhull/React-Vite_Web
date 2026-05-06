/**
 * Live quiz session store.
 *
 * In-memory `Map<code, session>` keyed by 6-char room code. Each entry
 * holds the teacher socketId, the player map, current question index,
 * and the reveal timer handle.
 *
 * Persistence layer (added Phase 5):
 *   When REDIS_URL is set, every create / delete plus a periodic
 *   snapshot is mirrored to a Redis hash. On server boot the in-memory
 *   map is rehydrated from Redis so an active quiz survives a Render
 *   auto-restart or a `git push` deploy. Reveal timers can't be
 *   serialised (they're process-local setTimeout handles), so a
 *   restored session comes back paused at its last snapshotted state
 *   — the teacher hits "Next" to resume scoring.
 *
 * What this DOES NOT yet solve:
 *   Genuine multi-instance horizontal scale — two Render instances
 *   running simultaneously would each hold their own copy of the
 *   in-memory map, and only the instance that owns a room can advance
 *   it (because the timer handle is local). The Socket.IO Redis
 *   adapter (Phase 4) handles broadcast fan-out across instances, so
 *   in practice the right deployment shape today is:
 *     a) single instance + this snapshot layer (handles restart), OR
 *     b) multi-instance with sticky sessions on Render so every client
 *        in a quiz lands on the room's owning instance.
 *   True instance-agnostic quiz state needs delayed-job queues
 *   (BullMQ) for timers — separate refactor, not this PR.
 */

import { logger } from "../../config/logger.js";

const REDIS_KEY = "mc:quiz:sessions";       // hash: code -> JSON.stringify(session)
const SNAPSHOT_INTERVAL_MS = 5000;          // tick that mirrors mutated sessions to Redis

// Reveal-timer handles aren't serialisable — strip before persisting
// so they don't break JSON.stringify and so a rehydrated session
// doesn't carry a stale reference.
function serialise(session) {
  const { revealTimer: _omit, ...persisted } = session;
  return JSON.stringify(persisted);
}

function deserialise(json) {
  if (!json) return null;
  try {
    const session = JSON.parse(json);
    // Restored sessions come back without their reveal timer. Mark
    // them so the quiz handler can short-circuit auto-advance and
    // wait for a manual "next" from the teacher.
    session.revealTimer = null;
    session.restored    = true;
    return session;
  } catch (err) {
    logger.warn({ err }, "quizStore: failed to deserialise restored session, skipping");
    return null;
  }
}

function createQuizStore({ redisClient } = {}) {
  // code -> session (the source of truth for live mutation)
  const sessions = new Map();

  // Keep track of which codes have changed since the last snapshot so
  // the periodic tick only writes the diff, not every session.
  const dirty = new Set();

  function markDirty(code) { dirty.add(code); }

  // Best-effort flush of dirty sessions to Redis. Errors are logged
  // and swallowed — Redis being briefly down should never crash the
  // quiz handler.
  async function flushDirty() {
    if (!redisClient || dirty.size === 0) return;
    const codes = [...dirty];
    dirty.clear();
    try {
      const pipeline = [];
      for (const code of codes) {
        const session = sessions.get(code);
        if (session) {
          pipeline.push(redisClient.hSet(REDIS_KEY, code, serialise(session)));
        } else {
          pipeline.push(redisClient.hDel(REDIS_KEY, code));
        }
      }
      await Promise.all(pipeline);
    } catch (err) {
      logger.warn({ err, codeCount: codes.length }, "quizStore: snapshot flush failed");
      // Re-mark for the next tick so we retry.
      codes.forEach((c) => dirty.add(c));
    }
  }

  // Periodic snapshot. unref() so it doesn't block process exit.
  let snapshotTimer = null;
  if (redisClient) {
    snapshotTimer = setInterval(() => { flushDirty(); }, SNAPSHOT_INTERVAL_MS);
    snapshotTimer.unref?.();
  }

  return {
    create(code, session) {
      sessions.set(code, session);
      markDirty(code);
    },

    get(code) {
      return sessions.get(code);
    },

    delete(code) {
      sessions.delete(code);
      markDirty(code);
    },

    entries() {
      return sessions.entries();
    },

    /**
     * Mark a session as needing flush to Redis. Quiz handlers should
     * call this after every mutation (next question, score change,
     * player join). Cheaper than auto-detecting dirty-state and lets
     * the call sites be explicit about when state is consistent.
     */
    touch(code) {
      if (sessions.has(code)) markDirty(code);
    },

    /**
     * Hydrate the in-memory map from Redis. Called once at boot. Any
     * codes already in memory are preserved (we trust local state
     * over a possibly-stale snapshot).
     */
    async hydrate() {
      if (!redisClient) return 0;
      try {
        const all = await redisClient.hGetAll(REDIS_KEY);
        let restored = 0;
        for (const [code, json] of Object.entries(all || {})) {
          if (sessions.has(code)) continue;
          const session = deserialise(json);
          if (session) {
            sessions.set(code, session);
            restored++;
          }
        }
        if (restored > 0) {
          logger.info({ restored }, "quizStore: rehydrated active sessions from Redis");
        }
        return restored;
      } catch (err) {
        logger.warn({ err }, "quizStore: hydrate failed, starting empty");
        return 0;
      }
    },

    /**
     * Force-flush all dirty sessions immediately. Called from SIGTERM
     * so an in-flight quiz isn't lost when Render restarts the
     * instance.
     */
    async drain() {
      await flushDirty();
      if (snapshotTimer) {
        clearInterval(snapshotTimer);
        snapshotTimer = null;
      }
    },
  };
}

// Module-singleton — wired up at server boot in server.js after the
// Redis client is connected. Default is the no-Redis variant so any
// import that fires before bootstrap (e.g. test harness) gets a
// working in-memory store.
let activeStore = createQuizStore();

export const quizStore = new Proxy({}, {
  get(_target, prop) {
    return activeStore[prop];
  },
});

/**
 * Replace the module's quiz store with one backed by Redis. Idempotent
 * on the same client — call once after Redis connects. If Redis is
 * unavailable, the existing in-memory store is left in place.
 */
export async function attachRedisToQuizStore(redisClient) {
  if (!redisClient) return;
  const next = createQuizStore({ redisClient });
  await next.hydrate();
  activeStore = next;
  logger.info("quizStore: Redis snapshot layer attached");
}

export { createQuizStore };
