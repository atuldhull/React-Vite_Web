/**
 * Webhook error-path coverage — fills the gaps the broader
 * `payment.test.js` doesn't reach.
 *
 * `payment.test.js`'s supabase mock always returns `{ error: null }`,
 * so the three defensive branches inside handleEventRegistrationCapture
 * — supabase lookup error, supabase update error, and the best-effort
 * notification failure — are never exercised there. This file mocks
 * supabase with INJECTABLE errors per-test so each defensive branch
 * gets a hit.
 *
 * What matters at each branch: the webhook still ACKS 200 (Razorpay
 * keeps retrying on 5xx, which we explicitly do NOT want for a
 * cosmetic notification failure), AND the structured logger captures
 * the underlying error so an operator can grep prod logs later.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import crypto from "crypto";

process.env.RAZORPAY_KEY_ID         = "rzp_test_fake";
process.env.RAZORPAY_KEY_SECRET     = "fake_secret_key";
process.env.RAZORPAY_WEBHOOK_SECRET = "fake_webhook_secret";

// Per-test error injection knobs. Mutated in each `it()` before the
// webhook fires; reset in `beforeEach`.
const errorKnobs = {
  lookupReturnsError: null,
  updateReturnsError: null,
};

// Logger spy — assert that errors get structured-logged.
const loggerSpy = vi.hoisted(() => ({
  info:  vi.fn(),
  warn:  vi.fn(),
  error: vi.fn(),
}));

vi.mock("../../backend/config/logger.js", () => ({
  logger: loggerSpy,
}));

vi.mock("../../backend/middleware/authMiddleware.js", () => ({
  requireAuth:       (req, _res, next) => { req.userId = "u1"; next(); },
  requireAdmin:      (req, _res, next) => { req.userId = "u1"; req.orgId = "org-1"; next(); },
  requireTeacher:    (_req, _res, next) => next(),
  requireSuperAdmin: (_req, _res, next) => next(),
  requireSameOrg:    (_req, _res, next) => next(),
  checkFeatureFlag:  () => (_req, _res, next) => next(),
}));

vi.mock("../../backend/middleware/tenantMiddleware.js", () => ({
  injectTenant: (_req, _res, next) => next(),
}));

// Supabase mock — configurable per-test via `errorKnobs`. The event
// registration lookup returns the configured error when set; the
// update returns the configured update error.
vi.mock("../../backend/config/supabase.js", () => {
  function buildQuery(table) {
    const q = {
      select: () => q,
      update: (_patch) => ({
        eq: (_col, _val) => Promise.resolve({
          error: table === "event_registrations" ? errorKnobs.updateReturnsError : null,
        }),
      }),
      eq:           () => q,
      maybeSingle:  () => {
        if (table === "event_registrations") {
          if (errorKnobs.lookupReturnsError) {
            return Promise.resolve({ data: null, error: errorKnobs.lookupReturnsError });
          }
          // Return a pending registration row by default so we can
          // exercise the update branch — overridden via knob when
          // the test wants the lookup itself to fail.
          return Promise.resolve({
            data: {
              id:             "reg-err-1",
              event_id:       "evt-1",
              user_id:        "u-student",
              org_id:         "org-1",
              payment_status: "pending",
            },
            error: null,
          });
        }
        // payment_history lookup — return null so the webhook falls
        // through to the event-registration path.
        return Promise.resolve({ data: null, error: null });
      },
    };
    return q;
  }
  return { default: { from: (table) => buildQuery(table) } };
});

vi.mock("razorpay", () => ({ default: class {} }));

// notificationController — we control whether sendNotification's
// returned promise rejects, to exercise the .catch() on line 186.
const sendNotificationStub = vi.fn();
vi.mock("../../backend/controllers/notificationController.js", () => ({
  sendNotification: (...args) => sendNotificationStub(...args),
}));

const paymentRoutes = (await import("../../backend/routes/paymentRoutes.js")).default;

function buildApp() {
  const app = express();
  app.use(express.json({
    verify: (req, _res, buf) => {
      if (req.originalUrl === "/api/payment/webhook") req.rawBody = buf;
    },
  }));
  app.use("/api/payment", paymentRoutes);
  return app;
}

function signedWebhook(app, body) {
  const json = JSON.stringify(body);
  const sig  = crypto.createHmac("sha256", "fake_webhook_secret")
    .update(json).digest("hex");
  return request(app)
    .post("/api/payment/webhook")
    .set("Content-Type", "application/json")
    .set("x-razorpay-signature", sig)
    .send(json);
}

beforeEach(() => {
  errorKnobs.lookupReturnsError = null;
  errorKnobs.updateReturnsError = null;
  loggerSpy.info.mockClear();
  loggerSpy.warn.mockClear();
  loggerSpy.error.mockClear();
  sendNotificationStub.mockClear();
  sendNotificationStub.mockResolvedValue({ ok: true });
});

const capturedEnvelope = {
  event: "payment.captured",
  payload: { payment: { entity: { id: "pay-x", order_id: "order-x" } } },
};

// ════════════════════════════════════════════════════════════
// Lookup error branch (line 141)
// ════════════════════════════════════════════════════════════

describe("webhook handleEventRegistrationCapture — lookup error", () => {
  it("logs the lookup error and acks 200 (does not crash)", async () => {
    errorKnobs.lookupReturnsError = { message: "Postgres connection lost", code: "57P01" };

    const res = await signedWebhook(buildApp(), capturedEnvelope);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(loggerSpy.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.objectContaining({ message: "Postgres connection lost" }) }),
      expect.stringMatching(/handleEventRegistrationCapture lookup/),
    );
  });

  it("does not attempt the update when the lookup failed", async () => {
    // If the early return on line 141 were missing, the update on
    // line 158 would run with `reg = undefined` and throw. We're
    // asserting the early-return semantics here — no update attempt
    // is observable as the absence of an update error in logs.
    errorKnobs.lookupReturnsError = { message: "lookup fail" };

    const res = await signedWebhook(buildApp(), capturedEnvelope);

    expect(res.status).toBe(200);
    // No notification fires when we early-return on lookup error.
    expect(sendNotificationStub).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════
// Update error branch (lines 171-172)
// ════════════════════════════════════════════════════════════

describe("webhook handleEventRegistrationCapture — update error", () => {
  it("logs the update error and acks 200", async () => {
    errorKnobs.updateReturnsError = { message: "row level security violated", code: "42501" };

    const res = await signedWebhook(buildApp(), capturedEnvelope);

    expect(res.status).toBe(200);
    expect(loggerSpy.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.objectContaining({ message: "row level security violated" }) }),
      expect.stringMatching(/handleEventRegistrationCapture update/),
    );
  });

  it("does not fire the success notification when the update failed", async () => {
    // sendNotification is only called AFTER a successful update —
    // confirms the early-return at line 172 takes effect.
    errorKnobs.updateReturnsError = { message: "constraint failed" };

    await signedWebhook(buildApp(), capturedEnvelope);

    expect(sendNotificationStub).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════
// Notification failure (line 186)
// ════════════════════════════════════════════════════════════

describe("webhook handleEventRegistrationCapture — notification rejection", () => {
  it("a rejected sendNotification promise is swallowed and logged at warn (not error)", async () => {
    // Notification is fire-and-forget. Failures should:
    //   - NOT propagate into the webhook handler's catch
    //   - NOT downgrade the response from 200
    //   - DO show up in logs so an operator can investigate
    sendNotificationStub.mockRejectedValueOnce(new Error("web-push 410 Gone"));

    const res = await signedWebhook(buildApp(), capturedEnvelope);

    expect(res.status).toBe(200);
    expect(sendNotificationStub).toHaveBeenCalled();

    // The .catch() fires on a microtask boundary; yield twice so it
    // has run by the time we assert.
    await Promise.resolve();
    await Promise.resolve();

    expect(loggerSpy.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.objectContaining({ message: "web-push 410 Gone" }) }),
      expect.stringMatching(/auto-paid notification failed/),
    );
    // NOT logger.error — a missed notification isn't urgent enough.
    expect(loggerSpy.error).not.toHaveBeenCalled();
  });
});
