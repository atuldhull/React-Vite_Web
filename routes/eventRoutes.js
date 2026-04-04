/**
 * Event Routes — Full event management API
 *
 * Services mounted:
 *   /api/events/*          — Event CRUD + Registration + Attendance + Leaderboard
 *   /api/achievements/*    — Achievement catalog + user unlocks
 *
 * Updated: April 4, 2026
 */

import express from "express";
import {
  // Event CRUD
  getEvents, getEvent, createEvent, updateEvent,
  deleteEvent, toggleRegistration,
  // Registration
  registerForEvent, cancelRegistration, getRegistrations,
  // Attendance
  checkinEvent, manualCheckin, scanQrCheckin, getAttendance,
  // Leaderboard
  getEventLeaderboard, updateEventScore, publishEventResults,
  // Site settings
  getSiteSettings, updateSiteSetting,
} from "../controllers/eventcontrollers.js";
import { requireAuth, requireAdmin, requireTeacher, checkFeatureFlag } from "../middleware/authMiddleware.js";

const router = express.Router();

// ── Event CRUD ──────────────────────────────────────────
// Public
router.get("/",                       getEvents);
router.get("/settings",               getSiteSettings);
router.get("/:id",                    getEvent);

// Teacher / Admin
router.post("/",                      requireTeacher, createEvent);
router.patch("/:id",                  requireTeacher, updateEvent);
router.delete("/:id",                 requireTeacher, deleteEvent);
router.patch("/:id/toggle-reg",       requireTeacher, toggleRegistration);

// Admin only
router.patch("/settings/:key",        requireAdmin, updateSiteSetting);

// ── Registration ────────────────────────────────────────
router.post("/:id/register",          requireAuth, registerForEvent);
router.delete("/:id/register",        requireAuth, cancelRegistration);
router.get("/:id/registrations",      requireTeacher, getRegistrations);

// ── Attendance ──────────────────────────────────────────
router.post("/:id/checkin",           requireAuth, checkinEvent);
router.post("/:id/checkin-manual",    requireTeacher, manualCheckin);
router.post("/:id/scan-qr",          requireTeacher, checkFeatureFlag("qr_checkin"), scanQrCheckin);
router.get("/:id/attendance",         requireTeacher, getAttendance);

// ── Event Leaderboard ───────────────────────────────────
router.get("/:id/leaderboard",        getEventLeaderboard);
router.post("/:id/leaderboard",       requireTeacher, checkFeatureFlag("event_leaderboard"), updateEventScore);
router.post("/:id/leaderboard/publish", requireAdmin, checkFeatureFlag("event_leaderboard"), publishEventResults);

export default router;
