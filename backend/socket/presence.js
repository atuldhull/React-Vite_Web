/**
 * Presence tracking for the admin "live users" panel.
 *
 * `activeUsers` is indexed by socket.id so a single user with multiple tabs
 * shows as multiple entries — the admin panel can dedupe by userId if desired.
 */

const activeUsers = {};

function buildActiveUsersList() {
  const now = Date.now();
  return Object.values(activeUsers).map((u) => ({
    ...u,
    sessionDuration: Math.floor((now - new Date(u.connectedAt).getTime()) / 1000),
  }));
}

export function getActiveUsers() {
  return buildActiveUsersList();
}

export function attachPresence(io, socket) {
  /* Presence heartbeat — client sends current page, server tracks. */
  socket.on("presence", ({ name, page }) => {
    // Only trust the session-verified userId, never client-supplied.
    const verifiedId = socket.userId;
    if (!verifiedId) return;

    // Bound free-form fields.
    const safeName = typeof name === "string" ? name.slice(0, 80) : "Member";
    const safePage = typeof page === "string" && page.startsWith("/") ? page.slice(0, 200) : "/";

    activeUsers[socket.id] = {
      userId:      verifiedId,
      name:        safeName,
      page:        safePage,
      connectedAt: activeUsers[socket.id]?.connectedAt || new Date().toISOString(),
      lastSeen:    new Date().toISOString(),
    };
    io.to("admin_room").emit("active_users_update", buildActiveUsersList());
  });

  /* Admin subscribes to the live-users stream. Only admin/super_admin. */
  socket.on("join_admin", () => {
    if (!socket.userRole || !["admin", "super_admin"].includes(socket.userRole)) return;
    socket.join("admin_room");
    socket.emit("active_users_update", buildActiveUsersList());
  });
}

export function cleanupPresence(io, socket) {
  delete activeUsers[socket.id];
  io.to("admin_room").emit("active_users_update", buildActiveUsersList());
}
