/**
 * Phase-6 validator unit tests.
 *
 * Covers the schemas added during the input-validation coverage pass —
 * user, comments, referral, and the messaging extensions. Each schema
 * is exercised against its happy path AND the abuse vectors the
 * hardening was designed to close:
 *
 *   - missing field        → 400 at the validator, not a controller crash
 *   - oversized field      → rejected before the DB write
 *   - extra unknown keys   → rejected by .strict() to block IDOR probes
 *
 * Pure schema unit tests — no Express, no Supabase, no surprises.
 */

import { describe, it, expect } from "vitest";
import { updateProfileSchema, changePasswordSchema } from "../../backend/validators/user.js";
import { postCommentSchema, askAiSchema } from "../../backend/validators/comments.js";
import { applyReferralCodeSchema } from "../../backend/validators/referral.js";
import {
  registerPublicKeySchema,
  sendFriendRequestSchema,
  respondFriendRequestSchema,
  getOrCreateConversationSchema,
  sendMessageSchema,
  markAsReadSchema,
  blockUserSchema,
  reportMessageSchema,
} from "../../backend/validators/messaging.js";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("user.updateProfileSchema", () => {
  it("accepts a partial payload (UI sends only changed fields)", () => {
    expect(updateProfileSchema.safeParse({ name: "Alice" }).success).toBe(true);
    expect(updateProfileSchema.safeParse({}).success).toBe(true);   // no-op PATCH
  });

  it("rejects empty name (controller used to silently allow this)", () => {
    expect(updateProfileSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("caps name at 60 chars", () => {
    expect(updateProfileSchema.safeParse({ name: "x".repeat(61) }).success).toBe(false);
  });

  it("caps bio at 200 chars", () => {
    expect(updateProfileSchema.safeParse({ bio: "x".repeat(201) }).success).toBe(false);
  });

  it("caps avatar_config payload at 4 KB serialised", () => {
    const big = { huge: "x".repeat(4096) };
    expect(updateProfileSchema.safeParse({ avatar_config: big }).success).toBe(false);
  });
});

describe("user.changePasswordSchema", () => {
  it("happy path", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "newpass1234" }).success).toBe(true);
  });

  it("rejects newPassword shorter than 8 chars (matches controller's pre-Zod rule)", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "short" }).success).toBe(false);
  });

  it("rejects extra keys (strict mode — guards against a 'targetUserId' override probe)", () => {
    const out = changePasswordSchema.safeParse({
      currentPassword: "x", newPassword: "newpass1234", targetUserId: "victim",
    });
    expect(out.success).toBe(false);
  });
});

describe("comments.postCommentSchema", () => {
  it("happy path", () => {
    expect(postCommentSchema.safeParse({ content: "Wait, that limit is unbounded?" }).success).toBe(true);
  });

  it("rejects empty content", () => {
    expect(postCommentSchema.safeParse({ content: "" }).success).toBe(false);
    expect(postCommentSchema.safeParse({ content: "   " }).success).toBe(false);
  });

  it("caps content at 1000 chars (matches table column ceiling)", () => {
    expect(postCommentSchema.safeParse({ content: "x".repeat(1001) }).success).toBe(false);
    expect(postCommentSchema.safeParse({ content: "x".repeat(1000) }).success).toBe(true);
  });

  it("rejects an injected user_name field (strict)", () => {
    const out = postCommentSchema.safeParse({ content: "ok", user_name: "admin" });
    expect(out.success).toBe(false);
  });
});

describe("comments.askAiSchema", () => {
  it("happy path with optional title", () => {
    expect(askAiSchema.safeParse({ question: "explain derivatives", challengeTitle: "Q1" }).success).toBe(true);
  });

  it("caps the question at 2 KB (OpenRouter token cost)", () => {
    expect(askAiSchema.safeParse({ question: "x".repeat(2001) }).success).toBe(false);
  });
});

describe("referral.applyReferralCodeSchema", () => {
  it("happy path", () => {
    expect(applyReferralCodeSchema.safeParse({ code: "ASYM1234" }).success).toBe(true);
  });

  it("rejects unrealistically short or long codes", () => {
    expect(applyReferralCodeSchema.safeParse({ code: "AB" }).success).toBe(false);
    expect(applyReferralCodeSchema.safeParse({ code: "x".repeat(33) }).success).toBe(false);
  });

  it("rejects a 'targetUserId' injection", () => {
    expect(applyReferralCodeSchema.safeParse({ code: "ASYM1234", targetUserId: "victim" }).success).toBe(false);
  });
});

describe("messaging.registerPublicKeySchema", () => {
  it("happy path with a small JWK", () => {
    expect(registerPublicKeySchema.safeParse({ publicKey: { kty: "OKP", x: "abc" } }).success).toBe(true);
  });

  it("rejects a publicKey above the 8 KB cap", () => {
    const huge = { x: "x".repeat(8 * 1024 + 1) };
    expect(registerPublicKeySchema.safeParse({ publicKey: huge }).success).toBe(false);
  });

  it("rejects missing publicKey", () => {
    expect(registerPublicKeySchema.safeParse({}).success).toBe(false);
  });
});

describe("messaging UUID-keyed schemas", () => {
  it("sendFriendRequestSchema accepts a UUID", () => {
    expect(sendFriendRequestSchema.safeParse({ recipientId: UUID }).success).toBe(true);
  });

  it("sendFriendRequestSchema rejects non-UUID strings", () => {
    expect(sendFriendRequestSchema.safeParse({ recipientId: "u-1" }).success).toBe(false);
  });

  it("respondFriendRequestSchema requires both fields", () => {
    expect(respondFriendRequestSchema.safeParse({ requestId: UUID, accept: true  }).success).toBe(true);
    expect(respondFriendRequestSchema.safeParse({ requestId: UUID                 }).success).toBe(false);
    expect(respondFriendRequestSchema.safeParse({                  accept: false }).success).toBe(false);
  });

  it("getOrCreateConversationSchema requires otherUserId", () => {
    expect(getOrCreateConversationSchema.safeParse({}).success).toBe(false);
    expect(getOrCreateConversationSchema.safeParse({ otherUserId: UUID }).success).toBe(true);
  });

  it("markAsReadSchema requires conversationId UUID", () => {
    expect(markAsReadSchema.safeParse({ conversationId: UUID }).success).toBe(true);
    expect(markAsReadSchema.safeParse({}).success).toBe(false);
  });

  it("blockUserSchema requires blockedId UUID", () => {
    expect(blockUserSchema.safeParse({ blockedId: UUID }).success).toBe(true);
    expect(blockUserSchema.safeParse({}).success).toBe(false);
  });
});

describe("messaging.sendMessageSchema", () => {
  it("happy path with all fields", () => {
    expect(sendMessageSchema.safeParse({
      conversationId:   UUID,
      encryptedContent: "ciphertext",
      iv:               "iv",
      messageType:      "text",
    }).success).toBe(true);
  });

  it("messageType defaults via controller — schema lets it be omitted", () => {
    expect(sendMessageSchema.safeParse({
      conversationId: UUID, encryptedContent: "x", iv: "y",
    }).success).toBe(true);
  });

  it("caps encryptedContent at 64 KB (table-DoS defence)", () => {
    expect(sendMessageSchema.safeParse({
      conversationId: UUID,
      encryptedContent: "x".repeat(64 * 1024 + 1),
      iv: "y",
    }).success).toBe(false);
  });

  it("rejects an unknown messageType (strict enum)", () => {
    expect(sendMessageSchema.safeParse({
      conversationId: UUID, encryptedContent: "x", iv: "y", messageType: "voice",
    }).success).toBe(false);
  });
});

describe("messaging.reportMessageSchema", () => {
  it("happy path with optional reason", () => {
    expect(reportMessageSchema.safeParse({ messageId: UUID, reason: "spam" }).success).toBe(true);
  });

  it("reason is optional but reason text is length-bounded", () => {
    expect(reportMessageSchema.safeParse({ messageId: UUID }).success).toBe(true);
    expect(reportMessageSchema.safeParse({ messageId: UUID, reason: "x".repeat(501) }).success).toBe(false);
  });
});
