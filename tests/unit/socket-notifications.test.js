/**
 * Unit tests for backend/socket/notifications.js.
 *
 * This layer fans out notification events to a user's live sockets.
 * Critical security property: only session-verified sockets can subscribe
 * to a user's notification stream — otherwise any unauthenticated client
 * could claim an arbitrary userId and receive that user's private
 * notifications.
 *
 * Tests use a fresh in-memory notification store per describe so state
 * doesn't leak between cases.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { attachNotifications, cleanupNotifications, pushNotification } from "../../backend/socket/notifications.js";
import { notificationStore } from "../../backend/socket/store/notificationStore.js";

function mockIo() {
  const emitted = [];
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

function mockSocket({ userId = "alice-id", id = "socket-1" } = {}) {
  const handlers = {};
  return {
    id,
    userId,
    on:   vi.fn((event, fn) => { handlers[event] = fn; }),
    join: vi.fn(),
    _handlers: handlers,
  };
}

// Scrub the shared store between tests — the export is a singleton.
beforeEach(() => {
  ["socket-1", "socket-2", "socket-3"].forEach((id) => notificationStore.removeSocket(id));
});

// ═══════════════════════════════════════════════════════════
// register_user
// ═══════════════════════════════════════════════════════════

describe("register_user", () => {
  it("joins the user's room + registers their socket in the store", () => {
    const { io } = mockIo();
    const socket = mockSocket({ userId: "alice-id", id: "socket-1" });
    attachNotifications(io, socket);

    socket._handlers.register_user();

    expect(socket.join).toHaveBeenCalledWith("user:alice-id");
    expect(notificationStore.hasUser("alice-id")).toBe(true);
  });

  it("refuses to register unauthenticated sockets (no room join)", () => {
    const { io } = mockIo();
    const socket = mockSocket({ userId: null, id: "socket-2" });
    attachNotifications(io, socket);

    socket._handlers.register_user();

    expect(socket.join).not.toHaveBeenCalled();
    expect(notificationStore.hasUser("alice-id")).toBe(false);
  });

  it("ignores any client-supplied id (socket.userId is the only source of truth)", () => {
    const { io } = mockIo();
    const socket = mockSocket({ userId: "alice-id", id: "socket-1" });
    attachNotifications(io, socket);

    // Even if the handler were called with an argument, the implementation
    // doesn't read it — prevents impersonation via "I'm user X" client claims.
    socket._handlers.register_user("mallory-id");

    expect(socket.join).toHaveBeenCalledWith("user:alice-id");
    expect(socket.join).not.toHaveBeenCalledWith("user:mallory-id");
  });

  it("supports the same user having multiple sockets (multi-tab case)", () => {
    const { io } = mockIo();
    const socketA = mockSocket({ userId: "alice-id", id: "socket-1" });
    const socketB = mockSocket({ userId: "alice-id", id: "socket-2" });
    attachNotifications(io, socketA);
    attachNotifications(io, socketB);

    socketA._handlers.register_user();
    socketB._handlers.register_user();

    expect(notificationStore.hasUser("alice-id")).toBe(true);
    // Removing one socket leaves the user still connected via the other
    notificationStore.removeSocket("socket-1");
    expect(notificationStore.hasUser("alice-id")).toBe(true);
    notificationStore.removeSocket("socket-2");
    expect(notificationStore.hasUser("alice-id")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// cleanupNotifications
// ═══════════════════════════════════════════════════════════

describe("cleanupNotifications", () => {
  it("removes the socket's binding on disconnect", () => {
    const { io } = mockIo();
    const socket = mockSocket({ userId: "alice-id", id: "socket-1" });
    attachNotifications(io, socket);
    socket._handlers.register_user();
    expect(notificationStore.hasUser("alice-id")).toBe(true);

    cleanupNotifications(socket);

    expect(notificationStore.hasUser("alice-id")).toBe(false);
  });

  it("is a no-op when a socket was never registered (e.g. unauth'd)", () => {
    const socket = mockSocket({ userId: null, id: "socket-3" });
    // No attach, no register. cleanup should silently succeed.
    expect(() => cleanupNotifications(socket)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════
// pushNotification — the helper controllers call
// ═══════════════════════════════════════════════════════════

describe("pushNotification", () => {
  it("emits 'notification' to the user's room with the given payload", () => {
    const { io, emitted } = mockIo();

    const payload = { id: "n-1", title: "Hi", body: "Hello" };
    pushNotification(io, "alice-id", payload);

    expect(emitted[0].room).toBe("user:alice-id");
    expect(emitted[0].event).toBe("notification");
    expect(emitted[0].payload).toEqual(payload);
  });

  it("doesn't throw when the target user has no live sockets (pure emit)", () => {
    const { io } = mockIo();
    // No subscriber for this user, but the helper should still fire-and-forget.
    expect(() => pushNotification(io, "nobody-home", { title: "orphan" })).not.toThrow();
  });
});
