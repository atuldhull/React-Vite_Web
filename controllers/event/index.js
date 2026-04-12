/**
 * Event Controllers — Barrel export
 *
 * Re-exports all event-related controllers from their domain-specific files.
 * This preserves backwards compatibility with existing route imports.
 */

// Helpers (also exported for tests)
export { computeStatus, validateUUID, generateQrToken } from "./eventHelpers.js";

// Event CRUD
export { getEvents, getEvent, createEvent, updateEvent, deleteEvent, toggleRegistration } from "./eventCrudController.js";

// Registration
export { registerForEvent, cancelRegistration, getRegistrations } from "./registrationController.js";

// Attendance
export { checkinEvent, manualCheckin, scanQrCheckin, getAttendance } from "./attendanceController.js";

// Leaderboard
export { getEventLeaderboard, updateEventScore, publishEventResults } from "./leaderboardController.js";

// Achievements
export { getAchievements, getMyAchievements, getUserAchievements, grantAchievement } from "./achievementController.js";

// Site Settings
export { getSiteSettings, updateSiteSetting } from "./siteSettingsController.js";
