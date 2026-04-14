/**
 * User-profile routes (Phase 15 — rich profile pages).
 *
 * Mounted at /api/users (plural) to distinguish from the legacy
 * /api/user/* self-actions. Every endpoint here takes a target
 * user id as `:id` and respects the privacy tiers in
 * lib/profileAccess.js.
 */

import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import * as ctrl from "../controllers/userProfileController.js";

const router = express.Router();

router.use(requireAuth);

// GET /api/users/:id/profile — aggregate for the profile page.
// Returns { profile, access, relationship } — the frontend renders
// from that single payload (counts, tabs, action buttons).
router.get("/:id/profile", ctrl.getProfile);

// GET /api/users/:id/friends — paginated friend list for the
// target, with mutual flags against the viewer. Respects the
// show_friend_list privacy toggle.
router.get("/:id/friends", ctrl.getFriendsList);

// GET /api/users/:id/activity — merged timeline (events +
// achievements). Respects show_activity_feed.
router.get("/:id/activity", ctrl.getActivity);

// GET /api/users/:id/mutual-friends — friend-intersection between
// the viewer and the target. Used by the Overview tab's mutual
// friends strip. Returns empty for self-view.
router.get("/:id/mutual-friends", ctrl.getMutualFriends);

export default router;
