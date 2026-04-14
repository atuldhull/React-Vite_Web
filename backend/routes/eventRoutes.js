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
  // Paid-event reconciliation (migration 19)
  submitPaymentRef, markPaid, rejectPayment, getPaymentsForEvent,
} from "../controllers/event/index.js";
import { requireAuth, requireAdmin, requireTeacher, checkFeatureFlag } from "../middleware/authMiddleware.js";
import { validateBody } from "../validators/common.js";
import { createEventSchema, updateEventSchema } from "../validators/events.js";
import { submitPaymentSchema, markPaidSchema, rejectPaymentSchema } from "../validators/registrations.js";

const router = express.Router();

// ── Event CRUD ──────────────────────────────────────────
// Public
router.get("/",                       getEvents);
router.get("/settings",               getSiteSettings);
router.get("/:id",                    getEvent);

// Teacher / Admin
router.post("/",                      requireTeacher, validateBody(createEventSchema), createEvent);
router.patch("/:id",                  requireTeacher, validateBody(updateEventSchema), updateEvent);
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

// ── Paid-event reconciliation (migration 19) ────────────
// Student submits their UPI reference after paying.
router.post(
  "/:id/registrations/:regId/pay",
  requireAuth,
  validateBody(submitPaymentSchema),
  submitPaymentRef,
);
// Admin/teacher lists payments for reconciliation.
router.get(
  "/:id/payments",
  requireTeacher,
  getPaymentsForEvent,
);
// Admin/teacher flips a submitted payment to paid.
router.post(
  "/:id/registrations/:regId/mark-paid",
  requireTeacher,
  validateBody(markPaidSchema),
  markPaid,
);
// Admin/teacher rejects a submitted payment with a reason.
router.post(
  "/:id/registrations/:regId/reject",
  requireTeacher,
  validateBody(rejectPaymentSchema),
  rejectPayment,
);

export default router;
