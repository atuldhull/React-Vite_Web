/**
 * Presence tracking for the admin "live users" panel.
 *
 * Storage lives in `presenceStore` (see ./store/presenceStore.js) so this
 * handler is purely wire-protocol. Swap that module for a TTL-backed Redis
 * HASH when you need multi-instance presence.
 */

import { presenceStore } from "./store/presenceStore.js";

export function getActiveUsers() {
  return presenceStore.list();
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

    presenceStore.upsert(socket.id, {
      userId:      verifiedId,
      name:        safeName,
      page:        safePage,
      connectedAt: new Date().toISOString(),
      lastSeen:    new Date().toISOString(),
    });
    io.to("admin_room").emit("active_users_update", presenceStore.list());
  });

  /* Admin subscribes to the live-users stream. Only admin/super_admin. */
  socket.on("join_admin", () => {
    if (!socket.userRole || !["admin", "super_admin"].includes(socket.userRole)) return;
    socket.join("admin_room");
    socket.emit("active_users_update", presenceStore.list());
  });
}

export function cleanupPresence(io, socket) {
  presenceStore.remove(socket.id);
  io.to("admin_room").emit("active_users_update", presenceStore.list());
}
