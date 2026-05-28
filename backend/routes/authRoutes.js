import express from "express";
import authController from "../controllers/authController.js";
import { validateBody } from "../validators/common.js";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resendVerificationSchema,
} from "../validators/auth.js";
import {
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  resendVerificationLimiter,
} from "../middleware/rateLimiter.js";

const router = express.Router();

// Route-level limiters layer ON TOP of the parent authLimiter mounted
// in registerRoutes.js (10/15m IP). The stricter per-route caps fire
// first for their specific abuse pattern; the parent stays as a
// global ceiling for any /auth POST without its own limiter.
//
// Limiters run BEFORE validateBody so a single attempt counts even
// when the body is malformed — preventing a "send junk to dodge the
// limiter" pattern.
router.post("/register",            registerLimiter,           validateBody(registerSchema),           authController.register);
router.post("/login",               loginLimiter,              validateBody(loginSchema),              authController.login);
router.post("/logout",              authController.logout);
router.get ("/logout",              authController.logoutRedirect);
router.post("/resend-verification", resendVerificationLimiter, validateBody(resendVerificationSchema), authController.resendVerification);
router.post("/forgot-password",     forgotPasswordLimiter,     validateBody(forgotPasswordSchema),     authController.forgotPassword);
router.post("/reset-password",      resetPasswordLimiter,      validateBody(resetPasswordSchema),      authController.resetPassword);
router.get("/session", authController.getSession);

/* Current session user — used by frontend auth checks */
router.get("/me", (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ loggedIn: true, user: req.session.user });
  }
  res.json({ loggedIn: false });
});

export default router;
