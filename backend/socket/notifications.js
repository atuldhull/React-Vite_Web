/**
 * Notification subscription + push helper.
 *
 * `userSockets` is an in-memory map of userId -> Set<socketId>. OK for a
 * single-instance deployment; would need Redis pub/sub to scale horizontally.
 */

const userSockets = {};

export function attachNotifications(io, socket) {
  /*
   * Only session-verified sockets may subscribe to a user's notification
   * stream. We IGNORE any client-supplied id — the earlier
   * `socket.userId || clientUserId` fallback would have let an unauthenticated
   * client claim any uuid and receive that user's notifications.
   */
  socket.on("register_user", () => {
    const verifiedId = socket.userId;
    if (!verifiedId) return; // unauthenticated socket — refuse silently
    if (!userSockets[verifiedId]) userSockets[verifiedId] = new Set();
    userSockets[verifiedId].add(socket.id);
    socket.join(`user:${verifiedId}`);
  });
}

export function cleanupNotifications(socket) {
  if (socket.userId && userSockets[socket.userId]) {
    userSockets[socket.userId].delete(socket.id);
    if (!userSockets[socket.userId].size) delete userSockets[socket.userId];
  }
}

/**
 * Emit a notification payload to every socket currently associated with
 * the given userId.
 */
export function pushNotification(io, userId, payload) {
  io.to(`user:${userId}`).emit("notification", payload);
}
