/**
 * paymentController.js — barrel file.
 *
 * All payment logic lives in controllers/payment/*.js (orders, verification,
 * webhook, billing, invoiceEmail). This file only re-exports so existing
 * route imports keep working without any change.
 */

export { createOrder }                       from "./payment/orders.js";
export { verifyPayment }                     from "./payment/verification.js";
export { razorpayWebhook }                   from "./payment/webhook.js";
export { getBillingHistory, getPublicPlans } from "./payment/billing.js";
