/**
 * Socket.IO orchestrator.
 *
 * Wires the session-auth middleware, connects every handler module to each
 * incoming socket, and registers the realtime helpers with the shared
 * `services/realtime.js` surface so controllers can publish notifications
 * without reaching back into this file.
 */

import { registerRealtime } from "../services/realtime.js";
import { attachSocketAuth }         from "./auth.js";
import {
  attachNotifications,
  cleanupNotifications,
  pushNotification,
} from "./notifications.js";
import {
  attachPresence,
  cleanupPresence,
  getActiveUsers,
} from "./presence.js";
import { attachQuiz, cleanupQuiz } from "./quiz.js";
import { attachChat }              from "./chat.js";

export { getActiveUsers };

/**
 * Connects auth + all handler modules to the given io server and registers
 * the realtime service shims. Idempotent on a per-io basis — safe to call
 * exactly once at boot.
 */
export function attachSocket(io) {
  attachSocketAuth(io);

  // Expose realtime helpers to non-socket code (controllers, routes).
  // We partially apply `io` here so callers don't need it.
  registerRealtime({
    pushNotification: (userId, payload) => pushNotification(io, userId, payload),
    getActiveUsers,
  });

  io.on("connection", (socket) => {
    attachNotifications(io, socket);
    attachPresence(io, socket);
    attachQuiz(io, socket, {
      pushNotification: (userId, payload) => pushNotification(io, userId, payload),
    });
    attachChat(io, socket);

    socket.on("disconnect", () => {
      cleanupQuiz(io, socket);
      cleanupNotifications(socket);
      cleanupPresence(io, socket);
    });
  });
}
