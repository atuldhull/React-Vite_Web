/**
 * /api/core/* — Core Team portal (Club Asymptotes).
 *
 * requireAuth gates the whole router. Individual routes layer on
 * requireCoreMember (must have redeemed a code) and requireCoreTier
 * (council / head privileges).
 */
import express from "express";

import { requireAuth } from "../middleware/authMiddleware.js";
import { requireCoreMember, requireCoreTier } from "../middleware/coreMiddleware.js";
import { validateBody } from "../validators/common.js";
import {
  redeemCodeSchema, createTeamSchema, addMemberSchema,
  createTaskSchema, submitTaskSchema,
  createFeedbackSchema, feedbackStatusSchema, createIdeaSchema,
  createMeetingSchema, rsvpSchema,
} from "../validators/coreTeam.js";

import { getMe, redeemCode, listTeams, leaderboard, createTeam, addMember, getBadge } from "../controllers/coreTeam/members.js";
import { listTasks, createTask, claimTask, submitTask, confirmTask, deleteTask } from "../controllers/coreTeam/tasks.js";
import { listFeedback, createFeedback, updateFeedbackStatus, revealAuthor } from "../controllers/coreTeam/feedback.js";
import { listIdeas, createIdea, voteIdea, deleteIdea } from "../controllers/coreTeam/ideas.js";
import { listTrends, refreshTrends } from "../controllers/coreTeam/trends.js";
import { listMeetings, createMeeting, rsvpMeeting, deleteMeeting } from "../controllers/coreTeam/meetings.js";

const router = express.Router();
const council = requireCoreTier(["council"]);
const lead    = requireCoreTier(["council", "head"]);

router.use(requireAuth);

/* ── access ── */
router.get("/me",     getMe);
router.post("/redeem", validateBody(redeemCodeSchema), redeemCode);

/* ── roster ── */
router.get("/teams",       requireCoreMember, listTeams);
router.get("/leaderboard", requireCoreMember, leaderboard);
router.post("/teams",      council, validateBody(createTeamSchema),  createTeam);
router.post("/members",    council, validateBody(addMemberSchema),   addMember);

/* ── tasks ── */
router.get("/tasks",              requireCoreMember, listTasks);
router.post("/tasks",             lead, validateBody(createTaskSchema), createTask);
router.post("/tasks/:id/claim",   requireCoreMember, claimTask);
router.post("/tasks/:id/submit",  requireCoreMember, validateBody(submitTaskSchema), submitTask);
router.post("/tasks/:id/confirm", lead, confirmTask);
router.delete("/tasks/:id",       lead, deleteTask);

/* ── feedback (anonymous suggestions / complaints) ── */
router.get("/feedback",                 requireCoreMember, listFeedback);
router.post("/feedback",                requireCoreMember, validateBody(createFeedbackSchema), createFeedback);
router.patch("/feedback/:id/status",    lead, validateBody(feedbackStatusSchema), updateFeedbackStatus);
router.get("/feedback/:id/author",      requireCoreMember, revealAuthor);

/* ── ideas board ── */
router.get("/ideas",          requireCoreMember, listIdeas);
router.post("/ideas",         requireCoreMember, validateBody(createIdeaSchema), createIdea);
router.post("/ideas/:id/vote", requireCoreMember, voteIdea);
router.delete("/ideas/:id",   requireCoreMember, deleteIdea);

/* ── trends wall ── */
router.get("/trends",          requireCoreMember, listTrends);
router.post("/trends/refresh", council, refreshTrends);

/* ── meeting scheduler ── */
router.get("/meetings",           requireCoreMember, listMeetings);
router.post("/meetings",          lead, validateBody(createMeetingSchema), createMeeting);
router.post("/meetings/:id/rsvp", requireCoreMember, validateBody(rsvpSchema), rsvpMeeting);
router.delete("/meetings/:id",    lead, deleteMeeting);

/* ── core badge lookup — any signed-in user (powers profile-page tags) ── */
router.get("/badge/:userId", getBadge);

export default router;
