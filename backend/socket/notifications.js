/**
 * Notification subscription + push helper.
 *
 * Socket bindings live in `notificationStore` (see ./store/notificationStore.js)
 * so the handler stays concerned only with wire protocol. Swap that module for
 * a Redis implementation to scale horizontally.
 */

import { notificationStore } from "./store/notificationStore.js";

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
    notificationStore.add(verifiedId, socket.id);
    socket.join(`user:${verifiedId}`);
  });
}

export function cleanupNotifications(socket) {
  notificationStore.removeSocket(socket.id);
}

/**
 * Emit a notification payload to every socket currently associated with
 * the given userId. This is the real-time / in-page channel. Web-push
 * (service-worker-delivered) notifications are fired separately from the
 * controller that triggers the notification — see controllers/notificationController.js.
 */
export function pushNotification(io, userId, payload) {
  io.to(`user:${userId}`).emit("notification", payload);
}
