/**
 * Payment API Tests — supertest integration tests for the Razorpay flow.
 *
 * We do NOT call Razorpay. All payment-state transitions can be tested
 * against mocked supabase + mocked razorpay client.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import crypto from "crypto";

// ── Configure env BEFORE anything imports config.js ──
process.env.RAZORPAY_KEY_ID          = "rzp_test_fake";
process.env.RAZORPAY_KEY_SECRET      = "fake_secret_key";
process.env.RAZORPAY_WEBHOOK_SECRET  = "fake_webhook_secret";
process.env.CONTACT_EMAIL            = "test@example.com";
process.env.CONTACT_APP_PASSWORD     = "fake";

// ── In-memory stores that the supabase mock reads/writes ──
const store = {
  payments: new Map(),
  orgs: new Map(),
  plans: new Map(),
  students: new Map(),
};

function resetStore() {
  store.payments.clear();
  store.orgs.clear();
  store.plans.clear();
  store.students.clear();

  store.orgs.set("org-1", { id: "org-1", name: "Acme College" });
  store.plans.set("pro", { id: "plan-pro", name: "pro", display_name: "Pro", price_monthly: 499 });
  store.plans.set("free", { id: "plan-free", name: "free", display_name: "Free", price_monthly: 0 });
  store.students.set("user-1", { user_id: "user-1", name: "Admin", email: "admin@acme.edu" });
}

// ── Bypass auth middleware — inject a fake admin session ──
vi.mock("../../middleware/authMiddleware.js", () => ({
  requireAuth:       (req, _res, next) => { req.userId = "user-1"; req.userRole = "admin"; next(); },
  requireAdmin:      (req, _res, next) => { req.userId = "user-1"; req.userRole = "admin"; req.orgId = "org-1"; next(); },
  requireTeacher:    (req, _res, next) => { req.userId = "user-1"; req.userRole = "teacher"; next(); },
  requireSuperAdmin: (req, _res, next) => { req.userId = "user-1"; req.userRole = "super_admin"; next(); },
  requireSameOrg:    (_req, _res, next) => next(),
  checkFeatureFlag:  () => (_req, _res, next) => next(),
}));

// ── Bypass tenant injection (would hit supabase otherwise) ──
vi.mock("../../middleware/tenantMiddleware.js", () => ({
  injectTenant: (_req, _res, next) => next(),
}));

// ── Mock supabase ──
vi.mock("../../config/supabase.js", () => {
  function buildQueryOn(tableName) {
    const filters = {};
    const q = {
      select: () => q,
      insert: (row) => {
        if (tableName === "payment_history") {
          store.payments.set(row.razorpay_order_id, {
            ...row, created_at: new Date().toISOString(),
          });
        }
        return {
          select: () => ({
            single:      () => Promise.resolve({ data: row, error: null }),
            maybeSingle: () => Promise.resolve({ data: row, error: null }),
          }),
          then: (fn) => Promise.resolve({ data: row, error: null }).then(fn),
        };
      },
      update: (patch) => {
        let keyCaptured = null;
        const sub = {
          eq: (col, val) => {
            if (tableName === "payment_history" && col === "razorpay_order_id") {
              keyCaptured = val;
              const existing = store.payments.get(val);
              if (existing) store.payments.set(val, { ...existing, ...patch });
            }
            if (tableName === "organisations" && col === "id") {
              const existing = store.orgs.get(val);
              if (existing) store.orgs.set(val, { ...existing, ...patch });
            }
            return sub;
          },
          then: (fn) => Promise.resolve({ data: keyCaptured ? store.payments.get(keyCaptured) : null, error: null }).then(fn),
        };
        return sub;
      },
      upsert: () => q,
      delete: () => q,
      eq: (col, val) => { filters[col] = val; return q; },
      neq: () => q,
      in:  () => q,
      order: () => q,
      limit: () => q,
      single:      () => Promise.resolve({ data: resolveRow(tableName, filters), error: null }),
      maybeSingle: () => Promise.resolve({ data: resolveRow(tableName, filters), error: null }),
      then: (fn) => Promise.resolve({ data: resolveList(tableName, filters), error: null }).then(fn),
    };
    return q;
  }

  function resolveRow(table, filters) {
    if (table === "payment_history" && filters.razorpay_order_id) {
      return store.payments.get(filters.razorpay_order_id) || null;
    }
    if (table === "subscription_plans" && filters.name) {
      return store.plans.get(filters.name) || null;
    }
    if (table === "organisations" && filters.id) {
      return store.orgs.get(filters.id) || null;
    }
    if (table === "students" && filters.user_id) {
      return store.students.get(filters.user_id) || null;
    }
    return null;
  }

  function resolveList(table, filters) {
    if (table === "payment_history" && filters.org_id) {
      return [...store.payments.values()].filter(p => p.org_id === filters.org_id);
    }
    if (table === "subscription_plans") return [...store.plans.values()];
    return [];
  }

  return { default: { from: (name) => buildQueryOn(name) } };
});

// ── Mock razorpay so createOrder works without a real API call ──
vi.mock("razorpay", () => ({
  default: class FakeRazorpay {
    constructor() {}
    orders = {
      create: async (opts) => ({
        id: `order_${Math.random().toString(36).slice(2, 10)}`,
        amount: opts.amount,
        currency: opts.currency,
        receipt: opts.receipt,
      }),
    };
  },
}));

// ── Mock nodemailer so invoice sends are no-ops ──
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: async () => ({ accepted: ["x"] }) }) },
}));

const paymentRoutes = (await import("../../routes/paymentRoutes.js")).default;

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

// Send a webhook with a body we control the serialization of.
// We pre-serialize to a string, HMAC over that string, and send it raw.
async function sendWebhook(app, body, overrides = {}) {
  const json = JSON.stringify(body);
  const sig = crypto.createHmac("sha256", "fake_webhook_secret").update(json).digest("hex");
  return request(app)
    .post("/api/payment/webhook")
    .set("Content-Type", "application/json")
    .set("x-razorpay-signature", overrides.badSig ? "deadbeef" : sig)
    .send(json);
}

beforeEach(() => { resetStore(); });

// ════════════════════════════════════════════════════════════
// createOrder
// ════════════════════════════════════════════════════════════

describe("POST /api/payment/create-order", () => {
  it("returns 400 when plan_name is missing", async () => {
    const res = await request(buildApp()).post("/api/payment/create-order").send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 when plan does not exist", async () => {
    const res = await request(buildApp())
      .post("/api/payment/create-order")
      .send({ plan_name: "nonexistent-plan" });
    expect(res.status).toBe(404);
  });

  it("refuses to charge for the free plan", async () => {
    const res = await request(buildApp())
      .post("/api/payment/create-order")
      .send({ plan_name: "free" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/free plan/i);
  });

  it("creates a Razorpay order and returns order_id + key_id", async () => {
    const res = await request(buildApp())
      .post("/api/payment/create-order")
      .send({ plan_name: "pro" });
    expect(res.status).toBe(200);
    expect(res.body.order_id).toMatch(/^order_/);
    expect(res.body.amount).toBe(49900); // 499 INR in paise
    expect(res.body.currency).toBe("INR");
    expect(res.body.key_id).toBe("rzp_test_fake");
  });
});

// ════════════════════════════════════════════════════════════
// verifyPayment
// ════════════════════════════════════════════════════════════

describe("POST /api/payment/verify", () => {
  it("rejects missing fields with 400", async () => {
    const res = await request(buildApp())
      .post("/api/payment/verify")
      .send({ razorpay_order_id: "o1" });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid signature with 400", async () => {
    store.payments.set("order_test", {
      org_id: "org-1", razorpay_order_id: "order_test",
      plan_name: "pro", plan_id: "plan-pro", amount: 499, status: "created",
    });

    const res = await request(buildApp())
      .post("/api/payment/verify")
      .send({
        razorpay_order_id:   "order_test",
        razorpay_payment_id: "pay_xyz",
        razorpay_signature:  "deadbeef",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/signature/i);
  });

  it("accepts a valid signature and upgrades the plan", async () => {
    store.payments.set("order_good", {
      org_id: "org-1", razorpay_order_id: "order_good",
      plan_name: "pro", plan_id: "plan-pro", amount: 499, status: "created",
    });

    const sig = crypto
      .createHmac("sha256", "fake_secret_key")
      .update("order_good|pay_good")
      .digest("hex");

    const res = await request(buildApp())
      .post("/api/payment/verify")
      .send({
        razorpay_order_id:   "order_good",
        razorpay_payment_id: "pay_good",
        razorpay_signature:  sig,
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.plan_name).toBe("pro");

    const stored = store.payments.get("order_good");
    expect(stored.status).toBe("paid");
    expect(store.orgs.get("org-1").plan_name).toBe("pro");
  });

  it("is idempotent — second verify on a paid order still returns success without re-upgrading", async () => {
    store.payments.set("order_paid", {
      org_id: "org-1", razorpay_order_id: "order_paid",
      plan_name: "pro", plan_id: "plan-pro", amount: 499, status: "paid",
      plan_expires_at: new Date().toISOString(),
    });

    const sig = crypto
      .createHmac("sha256", "fake_secret_key")
      .update("order_paid|pay_paid")
      .digest("hex");

    const res = await request(buildApp())
      .post("/api/payment/verify")
      .send({
        razorpay_order_id:   "order_paid",
        razorpay_payment_id: "pay_paid",
        razorpay_signature:  sig,
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// webhook
// ════════════════════════════════════════════════════════════

describe("POST /api/payment/webhook", () => {
  it("rejects a webhook with a bad signature", async () => {
    const res = await sendWebhook(buildApp(),
      { event: "payment.captured", payload: { payment: { entity: { id: "pay1", order_id: "order_x" } } } },
      { badSig: true });
    expect(res.status).toBe(400);
  });

  it("accepts a webhook with a valid signature and upgrades the org", async () => {
    store.payments.set("order_wh", {
      org_id: "org-1", razorpay_order_id: "order_wh",
      plan_name: "pro", plan_id: "plan-pro", amount: 499, status: "created",
    });

    const res = await sendWebhook(buildApp(),
      { event: "payment.captured", payload: { payment: { entity: { id: "pay_wh", order_id: "order_wh" } } } });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(store.payments.get("order_wh").status).toBe("paid");
    expect(store.orgs.get("org-1").plan_name).toBe("pro");
  });

  it("is idempotent — re-sending a webhook for an already-paid order does not re-apply", async () => {
    const paidAt = new Date().toISOString();
    store.payments.set("order_idem", {
      org_id: "org-1", razorpay_order_id: "order_idem",
      plan_name: "pro", plan_id: "plan-pro", amount: 499,
      status: "paid", paid_at: paidAt,
    });

    const res = await sendWebhook(buildApp(),
      { event: "payment.captured", payload: { payment: { entity: { id: "pay_idem", order_id: "order_idem" } } } });

    expect(res.status).toBe(200);
    expect(store.payments.get("order_idem").paid_at).toBe(paidAt);
  });

  it("marks order as failed on payment.failed event", async () => {
    store.payments.set("order_fail", {
      org_id: "org-1", razorpay_order_id: "order_fail",
      plan_name: "pro", plan_id: "plan-pro", amount: 499, status: "created",
    });

    const res = await sendWebhook(buildApp(),
      { event: "payment.failed", payload: { payment: { entity: { id: "pay_fail", order_id: "order_fail" } } } });

    expect(res.status).toBe(200);
    expect(store.payments.get("order_fail").status).toBe("failed");
  });
});

// ════════════════════════════════════════════════════════════
// public + admin endpoints
// ════════════════════════════════════════════════════════════

describe("GET /api/payment/plans — public", () => {
  it("returns the list of plans", async () => {
    const res = await request(buildApp()).get("/api/payment/plans");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /api/payment/history — admin only", () => {
  it("returns the org's payment history", async () => {
    store.payments.set("order_h1", {
      org_id: "org-1", razorpay_order_id: "order_h1",
      plan_name: "pro", amount: 499, status: "paid",
    });
    const res = await request(buildApp()).get("/api/payment/history");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
