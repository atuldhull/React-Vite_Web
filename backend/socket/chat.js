/**
 * Real-time chat relays. The actual message payload is end-to-end encrypted
 * by the client (ECDH + AES-GCM) — the server just forwards bytes between
 * the right user-rooms. `socket.userId` is the authoritative senderId; we
 * never trust one supplied in the message body.
 */

export function attachChat(io, socket) {
  socket.on("chat:send", ({ conversationId, recipientId, encryptedContent, iv, messageType }) => {
    io.to(`user:${recipientId}`).emit("chat:receive", {
      conversationId,
      senderId:         socket.userId,
      encryptedContent,
      iv,
      messageType:      messageType || "text",
      createdAt:        new Date().toISOString(),
    });
  });

  socket.on("chat:typing", ({ conversationId, recipientId }) => {
    io.to(`user:${recipientId}`).emit("chat:typing", {
      conversationId,
      userId: socket.userId,
    });
  });

  socket.on("chat:read", ({ conversationId, senderId }) => {
    io.to(`user:${senderId}`).emit("chat:read", {
      conversationId,
      readBy: socket.userId,
      readAt: new Date().toISOString(),
    });
  });
}
