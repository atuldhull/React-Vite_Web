import express from "express";
import authController from "../controllers/authController.js";

const router = express.Router();

router.post("/register",            authController.register);
router.post("/login",               authController.login);
router.post("/logout",              authController.logout);
router.get ("/logout",              authController.logoutRedirect);
router.post("/resend-verification", authController.resendVerification);
router.post("/forgot-password",     authController.forgotPassword);
router.post("/reset-password",      authController.resetPassword);
router.get("/session", authController.getSession);

/* Current session user — used by frontend auth checks */
router.get("/me", (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ loggedIn: true, user: req.session.user });
  }
  res.json({ loggedIn: false });
});

export default router;
