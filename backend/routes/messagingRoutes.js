import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import * as mc from "../controllers/messagingController.js";
import { validateBody } from "../validators/common.js";
import {
  updateChatSettingsSchema,
  batchRelationshipsSchema,
  cancelFriendRequestSchema,
  registerPublicKeySchema,
  sendFriendRequestSchema,
  respondFriendRequestSchema,
  getOrCreateConversationSchema,
  sendMessageSchema,
  markAsReadSchema,
  blockUserSchema,
  reportMessageSchema,
} from "../validators/messaging.js";

const router = Router();

// All messaging routes require auth
router.use(requireAuth);

// Keys (E2EE)
router.post("/keys/register", validateBody(registerPublicKeySchema), mc.registerPublicKey);
router.get("/keys/:userId", mc.getPublicKey);

// Friends
router.post("/friends/request",         validateBody(sendFriendRequestSchema),     mc.sendFriendRequest);
router.post("/friends/respond",         validateBody(respondFriendRequestSchema),  mc.respondFriendRequest);
router.post("/friends/request/cancel",  validateBody(cancelFriendRequestSchema),   mc.cancelFriendRequest);
router.delete("/friends/:friendshipId", mc.unfriend);
router.get("/friends", mc.getFriends);
router.get("/friends/pending", mc.getPendingRequests);

// Relationship state (Phase 15 — rich profile integration)
router.get("/relationship/:userId", mc.getRelationship);
router.post("/relationships/batch", validateBody(batchRelationshipsSchema), mc.getRelationshipsBatch);

// Conversations
router.post("/conversations", validateBody(getOrCreateConversationSchema), mc.getOrCreateConversation);
router.get("/conversations", mc.getConversations);

// Messages
router.post("/messages",      validateBody(sendMessageSchema), mc.sendMessage);
router.get("/messages/:conversationId", mc.getMessages);
router.post("/messages/read", validateBody(markAsReadSchema),  mc.markAsRead);

// User discovery
router.get("/search", mc.searchUsers);

// Block/Report
router.post("/block",  validateBody(blockUserSchema),     mc.blockUser);
router.post("/report", validateBody(reportMessageSchema), mc.reportMessage);

// Settings
router.get("/settings", mc.getChatSettings);
router.patch("/settings", validateBody(updateChatSettingsSchema), mc.updateChatSettings);

export default router;
