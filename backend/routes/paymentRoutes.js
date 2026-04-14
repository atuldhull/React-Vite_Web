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
import { validateBody } from "../validators/common.js";
import { createOrderSchema, verifyPaymentSchema } from "../validators/payment.js";
import { paymentLimiter } from "../middleware/rateLimiter.js";
import { idempotencyMiddleware } from "../middleware/idempotency.js";

const router = express.Router();

/* ── Public ── */
router.get("/plans", getPublicPlans);

/* ── Webhook — req.body is parsed JSON from express.json(). The raw body
      bytes are preserved as req.rawBody (see server.js verify callback)
      so the handler can HMAC-verify the Razorpay signature against the
      exact bytes Razorpay signed.
      NOT validated via Zod: Razorpay posts an event envelope we don't
      control; the handler does its own shape-check + HMAC verification. ── */
router.post("/webhook", razorpayWebhook);

/* ── Org admin protected ── */
router.use(requireAdmin, injectTenant);

// paymentLimiter: caps at 10 attempts per 10 min per org — Razorpay
// itself rate-limits on their side, but hitting that would stall every
// admin in the org; better to catch a hot loop here first.
//
// idempotencyMiddleware on /create-order: clients can pass an
// `Idempotency-Key` header so a network retry doesn't create a
// SECOND Razorpay order + duplicate payment_history row. See
// backend/middleware/idempotency.js for the contract; opt-in only —
// callers that don't send the header keep the previous behaviour.
router.post("/create-order", paymentLimiter, idempotencyMiddleware(),
            validateBody(createOrderSchema), createOrder);
router.post("/verify",       paymentLimiter, validateBody(verifyPaymentSchema), verifyPayment);
router.get("/history",       getBillingHistory);

export default router;
