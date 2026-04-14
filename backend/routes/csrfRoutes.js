/**
 * GET /api/csrf-token — mints a fresh CSRF token + sets the paired
 * hash cookie. The frontend calls this once on app boot, stashes the
 * returned `csrfToken` in memory, and puts it in the `x-csrf-token`
 * header on every mutating request.
 *
 * Public — does NOT require auth. Anonymous users need a token to
 * call POST /api/auth/login (the login form itself is CSRF-protected).
 */

import express from "express";
import { getCsrfTokenHandler } from "../middleware/csrfProtection.js";

const router = express.Router();
router.get("/", getCsrfTokenHandler);
export default router;
