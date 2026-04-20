/**
 * Integration tests — Razorpay event order creation (migration 23).
 *
 * Covers POST /api/events/:id/registrations/:regId/razorpay-order:
 *   1. 503 when RAZORPAY_KEY_ID is missing (unconfigured server)
 *   2. 404 when registration doesn't exist
 *   3. 403 when the caller isn't the registration's owner
 *   4. 400 when registration is already paid
 *   5. 400 when event is not paid / has no price
 *   6. Happy path: creates the order, stores razorpay_order_id,
 *      returns {order_id, amount, key_id, event_title}
 *
 * Uses the same Supabase mock strategy as paid-events.test.js. The
 * Razorpay client itself is stubbed so no real API call is made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const state = {
  registration: null,
  event:        null,
  lastUpdate:   null,
};

beforeEach(() => {
  state.registration = {
    id:               "reg-1",
    event_id:         "evt-1",
    user_id:          "u-student",
    payment_status:   "pending",
    razorpay_order_id: null,
  };
  state.event = {
    id:          "evt-1",
    title:       "BMSIT Hackathon",
    is_paid:     true,
    price_paise: 5000,
    org_id:      "org-A",
  };
  state.lastUpdate = null;
  vi.clearAllMocks();
  process.env.RAZORPAY_KEY_ID     = "rzp_test_unit";
  process.env.RAZORPAY_KEY_SECRET = "secret_unit";
});

// Supabase mock — same shape as paid-events.test.js. Handles every
// chain the controller hits: from(event_registrations).select().eq().eq().maybeSingle(),
// from(events).select().eq().maybeSingle(), from().update().eq().
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      const chain = {
        _table: table,
        select: () => chain,
        update: (payload) => {
          if (table !== "students") state.lastUpdate = payload;
          return {
            eq: () => ({
              select: () => ({ single: async () => ({ data: payload, error: null }) }),
              then:  (r) => Promise.resolve({ data: payload, error: null }).then(r),
              catch: () => {},
            }),
          };
        },
        eq: () => chain,
        in: () => chain,
        or: () => chain,
        order: () => chain,
        maybeSingle: async () => {
          if (table === "event_registrations") return { data: state.registration, error: null };
          if (table === "events")               return { data: state.event,        error: null };
          return { data: null, error: null };
        },
      };
      return chain;
    },
  }),
}));

// Stub the Razorpay SDK — no real network call. orders.create returns
// a deterministic id so the test can assert on the update payload.
vi.mock("razorpay", () => ({
  default: class FakeRazorpay {
    constructor() { this.orders = { create: vi.fn(async (input) => ({ id: "order_unit_123", ...input })) }; }
  },
}));

// Stub notifications (not used here but imported via the controller module).
vi.mock("../../backend/controllers/notificationController.js", () => ({
  sendNotification: vi.fn(async () => ({ ok: true })),
}));

const eventRoutes = (await import("../../backend/routes/eventRoutes.js")).default;
const { createClient: mockedCreate } = await import("@supabase/supabase-js");
const mockedSupabase = mockedCreate();

function buildApp({ userId = "u-student", role = "student", orgId = "org-A" } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { user: { id: userId, role, org_id: orgId, is_active: true } };
    req.userId   = userId;
    req.userRole = role;
    req.orgId    = orgId;
    req.id       = "req-test";
    req.db = {
      raw:   mockedSupabase,
      from:  (t) => mockedSupabase.from(t),
      audit: async () => {},
    };
    next();
  });
  app.use("/api/events", eventRoutes);
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

// Note: "503 when RAZORPAY_KEY_ID missing" is covered indirectly by
// config.js's own assertConfigured throwing + the controller's
// isConfigured() early return. Unit-testing that branch here fights
// ESM module caching (the route module captures the config at first
// import), so we leave that to a focused config.test.js instead.

// ════════════════════════════════════════════════════════════
// Authorisation guards
// ════════════════════════════════════════════════════════════

describe("POST /razorpay-order — authorisation", () => {
  it("404 when the registration doesn't exist", async () => {
    state.registration = null;
    const res = await request(buildApp()).post("/api/events/evt-1/registrations/reg-1/razorpay-order");
    expect(res.status).toBe(404);
  });

  it("403 when a different user tries to pay for someone else's registration", async () => {
    state.registration.user_id = "u-other"; // caller is u-student
    const res = await request(buildApp()).post("/api/events/evt-1/registrations/reg-1/razorpay-order");
    expect(res.status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════
// State guards
// ════════════════════════════════════════════════════════════

describe("POST /razorpay-order — state guards", () => {
  it("400 when the registration is already paid", async () => {
    state.registration.payment_status = "paid";
    const res = await request(buildApp()).post("/api/events/evt-1/registrations/reg-1/razorpay-order");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already paid/i);
  });

  it("400 when the event is free (not_required)", async () => {
    state.registration.payment_status = "not_required";
    const res = await request(buildApp()).post("/api/events/evt-1/registrations/reg-1/razorpay-order");
    expect(res.status).toBe(400);
  });

  it("400 when the event is not marked as paid", async () => {
    state.event.is_paid = false;
    const res = await request(buildApp()).post("/api/events/evt-1/registrations/reg-1/razorpay-order");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not paid/i);
  });

  it("400 when the event has zero price", async () => {
    state.event.price_paise = 0;
    const res = await request(buildApp()).post("/api/events/evt-1/registrations/reg-1/razorpay-order");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no price/i);
  });
});

// ════════════════════════════════════════════════════════════
// Happy path
// ════════════════════════════════════════════════════════════

describe("POST /razorpay-order — happy path", () => {
  it("creates the order, returns {order_id, amount, key_id}, stores the order id on the registration", async () => {
    const res = await request(buildApp()).post("/api/events/evt-1/registrations/reg-1/razorpay-order");
    expect(res.status).toBe(200);
    expect(res.body.order_id).toBe("order_unit_123");
    expect(res.body.amount).toBe(5000);
    expect(res.body.currency).toBe("INR");
    expect(res.body.key_id).toBe("rzp_test_unit");
    expect(res.body.event_title).toBe("BMSIT Hackathon");
    expect(res.body.registration_id).toBe("reg-1");
    // The update step persisted the order_id on the registration so
    // the webhook can reverse-lookup on payment.captured.
    expect(state.lastUpdate).toEqual({ razorpay_order_id: "order_unit_123" });
  });
});
