import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const spaIndex = path.join(__dirname, "../public/app/index.html");

const serveSpa = (req, res) => res.sendFile(spaIndex);

/* ── All frontend routes serve the React SPA ── */

// Public
router.get("/", serveSpa);
router.get("/home", serveSpa);
router.get("/arena", serveSpa);
router.get("/dashboard", serveSpa);
router.get("/events", serveSpa);
router.get("/leaderboard", serveSpa);
router.get("/gallery", serveSpa);
router.get("/contact", serveSpa);

// Auth
router.get("/login", serveSpa);
router.get("/register", serveSpa);

// Student
router.get("/profile", serveSpa);
router.get("/certificates", serveSpa);
router.get("/projects", serveSpa);
router.get("/notifications", serveSpa);
router.get("/billing", serveSpa);
router.get("/live-quiz", serveSpa);
router.get("/history", serveSpa);

// Teacher
router.get("/teacher", serveSpa);
router.get("/teacher/:page", serveSpa);

// Admin
router.get("/admin", serveSpa);
router.get("/admin/:page", serveSpa);

// Super Admin
router.get("/super-admin", serveSpa);
router.get("/super-admin/:page", serveSpa);

export default router;
