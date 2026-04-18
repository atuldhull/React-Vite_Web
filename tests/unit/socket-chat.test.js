/**
 * Unit tests for backend/socket/chat.js.
 *
 * This handler is the relay layer for E2EE real-time messages. Bugs
 * here silently fail but have real consequences:
 *   - Wrong room → messages delivered to the wrong user
 *   - Trusted senderId from client → impersonation (someone sends as
 *     Alice by supplying senderId="alice-id" in the payload)
 *   - Missing defaults → the frontend receives an incomplete payload
 *     and crashes during decryption
 *
 * We mock Socket.IO minimally: io.to() returns an object with emit();
 * socket.on() records handlers into a map so tests can invoke them
 * directly. This keeps the test deterministic and fast — no real
 * event loop or transport in play.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { attachChat } from "../../backend/socket/chat.js";

function mockIo() {
  const rooms = [];           // [{ room, event, payload }]
  const emit  = vi.fn((event, payload) => {
    rooms[rooms.length - 1].event   = event;
    rooms[rooms.length - 1].payload = payload;
  });
  const to    = vi.fn((room) => {
    rooms.push({ room, event: null, payload: null });
    return { emit };
  });
  return { io: { to }, emit, to, rooms };
}

function mockSocket(userId) {
  const handlers = {};
  return {
    userId,
    on:         vi.fn((event, fn) => { handlers[event] = fn; }),
    _handlers:  handlers,
  };
}

let io, socket, emitted;

beforeEach(() => {
  const m = mockIo();
  io       = m.io;
  emitted  = m.rooms;
  socket   = mockSocket("alice-id");
  attachChat(io, socket);
});

// ═══════════════════════════════════════════════════════════
// Handler registration
// ═══════════════════════════════════════════════════════════

describe("attachChat — wiring", () => {
  it("registers three socket handlers: send, typing, read", () => {
    expect(socket._handlers["chat:send"]).toBeTypeOf("function");
    expect(socket._handlers["chat:typing"]).toBeTypeOf("function");
    expect(socket._handlers["chat:read"]).toBeTypeOf("function");
  });
});

// ═══════════════════════════════════════════════════════════
// chat:send — the main relay
// ═══════════════════════════════════════════════════════════

describe("chat:send", () => {
  it("relays encrypted payload to the recipient's user-room", () => {
    socket._handlers["chat:send"]({
      conversationId:   "conv-1",
      recipientId:      "bob-id",
      encryptedContent: "<ciphertext>",
      iv:               "<iv>",
      messageType:      "text",
    });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].room).toBe("user:bob-id");
    expect(emitted[0].event).toBe("chat:receive");
  });

  it("stamps senderId from socket.userId — never from client payload", () => {
    // Attacker supplies a senderId trying to impersonate.
    socket._handlers["chat:send"]({
      conversationId:   "conv-1",
      recipientId:      "bob-id",
      encryptedContent: "<c>",
      iv:               "<iv>",
      senderId:         "mallory-id",   // malicious input — should be IGNORED
    });

    expect(emitted[0].payload.senderId).toBe("alice-id");
    expect(emitted[0].payload.senderId).not.toBe("mallory-id");
  });

  it("defaults messageType to 'text' when omitted", () => {
    socket._handlers["chat:send"]({
      conversationId:   "conv-1",
      recipientId:      "bob-id",
      encryptedContent: "<c>",
      iv:               "<iv>",
    });
    expect(emitted[0].payload.messageType).toBe("text");
  });

  it("preserves the caller's messageType when provided", () => {
    socket._handlers["chat:send"]({
      conversationId:   "conv-1",
      recipientId:      "bob-id",
      encryptedContent: "<c>",
      iv:               "<iv>",
      messageType:      "image",
    });
    expect(emitted[0].payload.messageType).toBe("image");
  });

  it("attaches a fresh ISO createdAt timestamp", () => {
    const before = Date.now();
    socket._handlers["chat:send"]({
      conversationId: "conv-1", recipientId: "bob-id",
      encryptedContent: "<c>", iv: "<iv>",
    });
    const after = Date.now();
    const ts = Date.parse(emitted[0].payload.createdAt);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("forwards conversationId + iv verbatim (client routes on these)", () => {
    socket._handlers["chat:send"]({
      conversationId:   "conv-42",
      recipientId:      "bob-id",
      encryptedContent: "<c>",
      iv:               "<random-iv-bytes>",
    });
    expect(emitted[0].payload.conversationId).toBe("conv-42");
    expect(emitted[0].payload.iv).toBe("<random-iv-bytes>");
  });
});

// ═══════════════════════════════════════════════════════════
// chat:typing — ephemeral presence
// ═══════════════════════════════════════════════════════════

describe("chat:typing", () => {
  it("emits to the recipient's room with typing user's id", () => {
    socket._handlers["chat:typing"]({
      conversationId: "conv-1",
      recipientId:    "bob-id",
    });

    expect(emitted[0].room).toBe("user:bob-id");
    expect(emitted[0].event).toBe("chat:typing");
    expect(emitted[0].payload.userId).toBe("alice-id");
    expect(emitted[0].payload.conversationId).toBe("conv-1");
  });

  it("uses socket.userId for the typing signal — not client input", () => {
    socket._handlers["chat:typing"]({
      conversationId: "conv-1",
      recipientId:    "bob-id",
      userId:         "mallory-id",   // malicious override attempt
    });
    expect(emitted[0].payload.userId).toBe("alice-id");
  });
});

// ═══════════════════════════════════════════════════════════
// chat:read — read receipts
// ═══════════════════════════════════════════════════════════

describe("chat:read", () => {
  it("emits read-receipt to the sender's room (not the reader's)", () => {
    // Alice read a message that Bob sent → notify Bob.
    socket._handlers["chat:read"]({
      conversationId: "conv-1",
      senderId:       "bob-id",
    });

    expect(emitted[0].room).toBe("user:bob-id");
    expect(emitted[0].event).toBe("chat:read");
    expect(emitted[0].payload.readBy).toBe("alice-id");
  });

  it("stamps readAt with an ISO timestamp", () => {
    socket._handlers["chat:read"]({ conversationId: "conv-1", senderId: "bob-id" });
    expect(Number.isFinite(Date.parse(emitted[0].payload.readAt))).toBe(true);
  });
});
