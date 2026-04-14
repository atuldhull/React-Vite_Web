import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import * as mc from "../controllers/messagingController.js";
import { validateBody } from "../validators/common.js";
import {
  updateChatSettingsSchema,
  batchRelationshipsSchema,
  cancelFriendRequestSchema,
} from "../validators/messaging.js";

const router = Router();

// All messaging routes require auth
router.use(requireAuth);

// Keys (E2EE)
router.post("/keys/register", mc.registerPublicKey);
router.get("/keys/:userId", mc.getPublicKey);

// Friends
router.post("/friends/request", mc.sendFriendRequest);
router.post("/friends/respond", mc.respondFriendRequest);
router.post("/friends/request/cancel", validateBody(cancelFriendRequestSchema), mc.cancelFriendRequest);
router.delete("/friends/:friendshipId", mc.unfriend);
router.get("/friends", mc.getFriends);
router.get("/friends/pending", mc.getPendingRequests);

// Relationship state (Phase 15 — rich profile integration)
router.get("/relationship/:userId", mc.getRelationship);
router.post("/relationships/batch", validateBody(batchRelationshipsSchema), mc.getRelationshipsBatch);

// Conversations
router.post("/conversations", mc.getOrCreateConversation);
router.get("/conversations", mc.getConversations);

// Messages
router.post("/messages", mc.sendMessage);
router.get("/messages/:conversationId", mc.getMessages);
router.post("/messages/read", mc.markAsRead);

// User discovery
router.get("/search", mc.searchUsers);

// Block/Report
router.post("/block", mc.blockUser);
router.post("/report", mc.reportMessage);

// Settings
router.get("/settings", mc.getChatSettings);
router.patch("/settings", validateBody(updateChatSettingsSchema), mc.updateChatSettings);

export default router;
