/**
 * Presence store — "who is online right now, on which page".
 *
 * Keyed by socketId so a single user with multiple tabs shows as multiple
 * entries. To swap for Redis, back this with a HASH keyed by socketId +
 * EXPIRE after N seconds of no heartbeat; clients re-upsert on each
 * `presence` event.
 */

function createInMemoryPresenceStore() {
  // socketId -> { userId, name, page, connectedAt, lastSeen }
  const entries = new Map();

  return {
    upsert(socketId, data) {
      const existing = entries.get(socketId);
      entries.set(socketId, {
        ...data,
        connectedAt: existing?.connectedAt || data.connectedAt,
      });
    },

    remove(socketId) {
      entries.delete(socketId);
    },

    /** Snapshot of all entries with computed sessionDuration (seconds). */
    list() {
      const now = Date.now();
      return [...entries.values()].map((u) => ({
        ...u,
        sessionDuration: Math.floor((now - new Date(u.connectedAt).getTime()) / 1000),
      }));
    },
  };
}

export const presenceStore = createInMemoryPresenceStore();
export { createInMemoryPresenceStore };
