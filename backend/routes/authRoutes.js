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

const router = express.Router();

router.post("/register",            validateBody(registerSchema),           authController.register);
router.post("/login",               validateBody(loginSchema),              authController.login);
router.post("/logout",              authController.logout);
router.get ("/logout",              authController.logoutRedirect);
router.post("/resend-verification", validateBody(resendVerificationSchema), authController.resendVerification);
router.post("/forgot-password",     validateBody(forgotPasswordSchema),     authController.forgotPassword);
router.post("/reset-password",      validateBody(resetPasswordSchema),      authController.resetPassword);
router.get("/session", authController.getSession);

/* Current session user — used by frontend auth checks */
router.get("/me", (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ loggedIn: true, user: req.session.user });
  }
  res.json({ loggedIn: false });
});

export default router;
