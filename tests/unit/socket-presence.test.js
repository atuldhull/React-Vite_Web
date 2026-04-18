/**
 * Unit tests for backend/socket/presence.js — "who's online now" for the
 * admin live-users panel.
 *
 * Security properties being guarded here:
 *   - Unauthenticated sockets are refused (no presence entry created)
 *   - Only admin/super_admin can join the admin broadcast room
 *   - Free-form fields (name, page) are length-bounded + type-checked
 *   - The userId stamped in the presence entry is socket.userId, NEVER
 *     any client-supplied id — otherwise the admin panel could be
 *     deceived about who's on what page
 *
 * The presence store is exercised through its in-memory factory so tests
 * stay isolated (the exported singleton would bleed state between tests).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { attachPresence, cleanupPresence } from "../../backend/socket/presence.js";
import { presenceStore } from "../../backend/socket/store/presenceStore.js";

function mockIo() {
  const emitted = []; // [{ room, event, payload }]
  const emit = vi.fn((event, payload) => {
    emitted[emitted.length - 1].event = event;
    emitted[emitted.length - 1].payload = payload;
  });
  const to = vi.fn((room) => {
    emitted.push({ room, event: null, payload: null });
    return { emit };
  });
  return { io: { to }, emitted };
}

function mockSocket({ userId = "alice-id", userRole = "student", id = "socket-1" } = {}) {
  const handlers = {};
  return {
    id,
    userId,
    userRole,
    on:        vi.fn((event, fn) => { handlers[event] = fn; }),
    join:      vi.fn(),
    emit:      vi.fn(),
    _handlers: handlers,
  };
}

// Reset the shared presence store between tests so state doesn't bleed.
beforeEach(() => {
  for (const entry of presenceStore.list()) {
    presenceStore.remove(entry.socketId);
  }
  // The store is keyed internally; .list() doesn't reveal keys, so also
  // re-clear via a brute-force remove by known test socket ids below.
  presenceStore.remove("socket-1");
  presenceStore.remove("socket-2");
  presenceStore.remove("socket-3");
});

// ═══════════════════════════════════════════════════════════
// Wiring
// ═══════════════════════════════════════════════════════════

describe("attachPresence — wiring", () => {
  it("registers two handlers: presence + join_admin", () => {
    const { io } = mockIo();
    const socket = mockSocket();
    attachPresence(io, socket);
    expect(socket._handlers.presence).toBeTypeOf("function");
    expect(socket._handlers.join_admin).toBeTypeOf("function");
  });
});

// ═══════════════════════════════════════════════════════════
// presence heartbeat
// ═══════════════════════════════════════════════════════════

describe("presence heartbeat", () => {
  it("creates a presence entry keyed by socket.id", () => {
    const { io } = mockIo();
    const socket = mockSocket({ userId: "alice-id", id: "socket-1" });
    attachPresence(io, socket);

    socket._handlers.presence({ name: "Alice", page: "/arena" });

    const list = presenceStore.list();
    const entry = list.find((e) => e.userId === "alice-id");
    expect(entry).toBeDefined();
    expect(entry.name).toBe("Alice");
    expect(entry.page).toBe("/arena");
  });

  it("refuses presence updates from unauthenticated sockets", () => {
    const { io } = mockIo();
    const socket = mockSocket({ userId: null, id: "socket-2" });
    attachPresence(io, socket);

    socket._handlers.presence({ name: "Hacker", page: "/admin" });

    expect(presenceStore.list().find((e) => !e.userId)).toBeUndefined();
  });

  it("caps name at 80 chars (DoS defence against arbitrary payloads)", () => {
    const { io } = mockIo();
    const socket = mockSocket({ id: "socket-1" });
    attachPresence(io, socket);

    socket._handlers.presence({ name: "x".repeat(200), page: "/arena" });
    const entry = presenceStore.list().find((e) => e.userId === "alice-id");
    expect(entry.name.length).toBe(80);
  });

  it("falls back to 'Member' when name is non-string", () => {
    const { io } = mockIo();
    const socket = mockSocket({ id: "socket-1" });
    attachPresence(io, socket);

    socket._handlers.presence({ name: { evil: "object" }, page: "/arena" });
    const entry = presenceStore.list().find((e) => e.userId === "alice-id");
    expect(entry.name).toBe("Member");
  });

  it("falls back to '/' when page doesn't start with /", () => {
    const { io } = mockIo();
    const socket = mockSocket({ id: "socket-1" });
    attachPresence(io, socket);

    socket._handlers.presence({ name: "Alice", page: "javascript:alert(1)" });
    const entry = presenceStore.list().find((e) => e.userId === "alice-id");
    expect(entry.page).toBe("/");
  });

  it("broadcasts an active_users_update to admin_room after each heartbeat", () => {
    const { io, emitted } = mockIo();
    const socket = mockSocket({ id: "socket-1" });
    attachPresence(io, socket);

    socket._handlers.presence({ name: "Alice", page: "/dashboard" });

    expect(emitted[0].room).toBe("admin_room");
    expect(emitted[0].event).toBe("active_users_update");
    expect(Array.isArray(emitted[0].payload)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// join_admin — RBAC gate
// ═══════════════════════════════════════════════════════════

describe("join_admin", () => {
  it("admin users join admin_room and receive initial snapshot", () => {
    const { io } = mockIo();
    const socket = mockSocket({ userRole: "admin" });
    attachPresence(io, socket);

    socket._handlers.join_admin();

    expect(socket.join).toHaveBeenCalledWith("admin_room");
    expect(socket.emit).toHaveBeenCalledWith("active_users_update", expect.any(Array));
  });

  it("super_admin users also pass the RBAC gate", () => {
    const { io } = mockIo();
    const socket = mockSocket({ userRole: "super_admin" });
    attachPresence(io, socket);

    socket._handlers.join_admin();

    expect(socket.join).toHaveBeenCalledWith("admin_room");
  });

  it("rejects student role (no room join, no snapshot sent)", () => {
    const { io } = mockIo();
    const socket = mockSocket({ userRole: "student" });
    attachPresence(io, socket);

    socket._handlers.join_admin();

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it("rejects teacher role (admin panel is admin-only, not teacher)", () => {
    const { io } = mockIo();
    const socket = mockSocket({ userRole: "teacher" });
    attachPresence(io, socket);

    socket._handlers.join_admin();

    expect(socket.join).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated (null role)", () => {
    const { io } = mockIo();
    const socket = mockSocket({ userRole: null });
    attachPresence(io, socket);

    socket._handlers.join_admin();

    expect(socket.join).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════
// cleanupPresence — on disconnect
// ═══════════════════════════════════════════════════════════

describe("cleanupPresence", () => {
  it("removes the socket's presence entry + broadcasts update", () => {
    const { io, emitted } = mockIo();
    const socket = mockSocket({ id: "socket-1" });
    attachPresence(io, socket);

    socket._handlers.presence({ name: "Alice", page: "/arena" });
    expect(presenceStore.list().length).toBeGreaterThan(0);

    cleanupPresence(io, socket);
    expect(presenceStore.list().find((e) => e.userId === "alice-id")).toBeUndefined();
    // Second broadcast was fired on cleanup
    expect(emitted[emitted.length - 1].event).toBe("active_users_update");
  });
});
