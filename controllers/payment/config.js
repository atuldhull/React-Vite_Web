/**
 * Razorpay configuration + lazy client.
 *
 * Keys live in env. Client is only instantiated when first needed
 * so the server can boot even if razorpay isn't installed yet, or
 * the keys haven't been configured.
 */

import nodemailer from "nodemailer";

let _razorpay = null;

/** Returns true if Razorpay keys are configured. */
export function isConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/** Throws a consistent error if keys are missing. */
export function assertConfigured() {
  if (!isConfigured()) {
    const err = new Error(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.local.",
    );
    err.code = "RAZORPAY_NOT_CONFIGURED";
    throw err;
  }
}

/**
 * Returns the Razorpay client, creating it on first use.
 * async — callers MUST `await` this.
 */
export async function getRazorpay() {
  if (_razorpay) return _razorpay;
  assertConfigured();
  const { default: Razorpay } = await import("razorpay");
  _razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  return _razorpay;
}

/** Exposed to frontend (key id is public) when creating an order. */
export function publicKeyId() {
  return process.env.RAZORPAY_KEY_ID || null;
}

/** HMAC key used for checkout-result signature verification. */
export function paymentSigningKey() {
  assertConfigured();
  return process.env.RAZORPAY_KEY_SECRET;
}

/**
 * Webhook signing secret. Distinct from the API key secret above.
 * In production this MUST be set — we refuse to verify without it.
 */
export function webhookSecret() {
  return process.env.RAZORPAY_WEBHOOK_SECRET || null;
}

/** Nodemailer transporter reusing the same credentials as the contact form. */
export function getMailTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.CONTACT_EMAIL,
      pass: process.env.CONTACT_APP_PASSWORD,
    },
  });
}
