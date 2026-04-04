/**
 * routes/paymentRoutes.js
 *
 * Payment routes for Razorpay integration.
 *
 * Public:
 *   GET  /api/payment/plans           — list all subscription plans
 *
 * Org admin protected:
 *   POST /api/payment/create-order    — create a Razorpay order
 *   POST /api/payment/verify          — verify payment + upgrade plan
 *   GET  /api/payment/history         — billing history for this org
 *
 * Webhook (no session auth — Razorpay server calls this):
 *   POST /api/payment/webhook
 */

import express from "express";
import { requireAdmin } from "../middleware/authMiddleware.js";
import { injectTenant } from "../middleware/tenantMiddleware.js";
import {
  createOrder,
  verifyPayment,
  razorpayWebhook,
  getBillingHistory,
  getPublicPlans,
} from "../controllers/paymentController.js";

const router = express.Router();

/* ── Public ── */
router.get("/plans", getPublicPlans);

/* ── Webhook — must be BEFORE express.json() re-parse (raw body needed for sig check) ── */
router.post("/webhook", express.raw({ type: "application/json" }), (req, res, next) => {
  // Parse raw body back to JSON for our handler
  if (Buffer.isBuffer(req.body)) req.body = JSON.parse(req.body.toString());
  next();
}, razorpayWebhook);

/* ── Org admin protected ── */
router.use(requireAdmin, injectTenant);

router.post("/create-order", createOrder);
router.post("/verify",       verifyPayment);
router.get("/history",       getBillingHistory);

export default router;
