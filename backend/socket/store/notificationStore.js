/**
 * Notification subscription store — "which socket ids are bound to which
 * userId for notification fan-out".
 *
 * Defines a small interface so the in-memory implementation below can be
 * swapped for a Redis-backed one without touching handlers. To move to
 * Redis, implement the same surface ({ add, remove, removeSocket, hasUser })
 * backed by `SADD user:<id>:sockets <socketId>` and emit side-channel
 * messages via Redis pub/sub.
 */

function createInMemoryNotificationStore() {
  // userId -> Set<socketId>
  const byUser = new Map();
  // socketId -> userId (reverse index, for O(1) cleanup on disconnect)
  const byUserSocket = new Map();

  return {
    /** Bind a socket to a user so notifications reach them. */
    add(userId, socketId) {
      let set = byUser.get(userId);
      if (!set) {
        set = new Set();
        byUser.set(userId, set);
      }
      set.add(socketId);
      byUserSocket.set(socketId, userId);
    },

    /** Unbind a single (user, socket) pair. */
    remove(userId, socketId) {
      const set = byUser.get(userId);
      if (!set) return;
      set.delete(socketId);
      if (set.size === 0) byUser.delete(userId);
      byUserSocket.delete(socketId);
    },

    /** Called on socket disconnect — cleans up all bindings for that socket. */
    removeSocket(socketId) {
      const userId = byUserSocket.get(socketId);
      if (!userId) return;
      this.remove(userId, socketId);
    },

    /** Test helper: does this user have any live sockets? */
    hasUser(userId) {
      return byUser.has(userId);
    },
  };
}

// Single shared instance used by the notification socket handler.
// Import-time construction is fine — the store is stateless until used.
export const notificationStore = createInMemoryNotificationStore();

// Exported for tests that need a fresh instance
export { createInMemoryNotificationStore };
