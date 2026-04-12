/**
 * Socket.IO session-based authentication.
 *
 * Attaches the Express session to each connection and copies the verified
 * user fields onto the socket object. Unauthenticated sockets are allowed
 * through (public pages use real-time for events/notifications preview) but
 * they receive a null userId so handlers can bail out on that check.
 */

import { sessionMiddleware } from "../middleware/sessionConfig.js";

export function attachSocketAuth(io) {
  io.engine.use(sessionMiddleware);

  io.use((socket, next) => {
    const session = socket.request.session;
    if (session?.user?.id) {
      socket.userId   = session.user.id;
      socket.userRole = session.user.role;
      socket.userName = session.user.name;
    } else {
      // Anonymous connection — allowed, but userId is null so any handler
      // that requires identity must refuse silently.
      socket.userId   = null;
      socket.userRole = null;
    }
    next();
  });
}
