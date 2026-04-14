/**
 * Integration tests — paid events (migration 19).
 *
 * Covers the manual UPI/QR reconciliation flow end-to-end:
 *   1. Student submits a UPI ref after paying → status 'submitted'
 *   2. Cross-student poking → 403 (you can't pay for someone else)
 *   3. Student can't submit to a free-event registration
 *   4. Student can't submit after already paid
 *   5. Student CAN resubmit after rejection (rejected → submitted)
 *   6. Non-teacher can't mark paid → 403
 *   7. Admin marks paid → status 'paid', paid_at set
 *   8. Admin mark-paid on already-paid row → idempotent 200
 *   9. Admin rejects submitted → status 'rejected' + reason stored
 *  10. Admin can't reject an already-paid row → 409
 *  11. Validator: bogus UPI ref shape → 400
 *  12. Validator: reject with no reason → 400
 *
 * Strategy mirrors messaging.test.js: mock the supabase client + the
 * tenant-aware `req.db` proxy, build a minimal Express app that mounts
 * only eventRoutes + supertest against it. No real DB involved.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mutable mock state ───────────────────────────────────────
const state = {
  // Registration row returned by req.db.from("event_registrations")...maybeSingle()
  registration: null,
  // Updated registration row returned after .update(...).select().single()
  updateReturn: null,
  // Event row used by the tenant-scoped .from("events") lookup
  event: null,
  // List returned by the reconciliation GET /:id/payments
  paymentsList: [],
  // Track the last update payload so we can assert on it
  lastUpdate: null,
  // Track audit calls
  auditCalls: [],
};

beforeEach(() => {
  state.registration  = null;
  state.updateReturn  = null;
  state.event         = { id: "evt-1", is_paid: true, price_paise: 5000, org_id: "org-A" };
  state.paymentsList  = [];
  state.lastUpdate    = null;
  state.auditCalls    = [];
  vi.clearAllMocks();
});

// Supabase mock — covers every chain the reconciliation controllers
// hit. Controllers use both `req.db` (wrapped) and the raw
// supabase client (for the joined .students:user_id(...) fetch), so
// both paths land here.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      const chain = {
        _table: table,
        select:  () => chain,
        insert:  () => ({
          select: () => ({
            single: async () => ({ data: { id: "row-new" }, error: null }),
          }),
        }),
        update:  (payload) => {
          // Only record update payloads for the reconciliation tables.
          // authMiddleware.requireAuth fire-and-forgets a students
          // .update({ last_seen_at }) on every protected request; letting
          // THAT call overwrite state.lastUpdate would race the test's
          // real assertion target.
          if (table !== "students") state.lastUpdate = payload;
          return {
            eq: () => {
              const updated = state.updateReturn ?? { id: "row-upd", ...payload };
              // Terminal methods after .update().eq():
              //   - .select().single()  (controllers reading the new row)
              //   - .then()/.catch()    (fire-and-forget writes — e.g. requireAuth's last_seen_at)
              return {
                select: () => ({
                  single: async () => ({ data: updated, error: null }),
                }),
                then:  (r) => Promise.resolve({ data: updated, error: null }).then(r),
                catch: () => {},
              };
            },
          };
        },
        eq:      () => chain,
        neq:     () => chain,
        in:      () => chain,
        or:      () => chain,
        order:   () => chain,
        range:   () => chain,
        limit:   () => chain,
        // Terminal awaiters
        single:      async () => ({ data: null, error: null }),
        maybeSingle: async () => {
          if (table === "event_registrations") return { data: state.registration, error: null };
          if (table === "events")               return { data: state.event,         error: null };
          return { data: null, error: null };
        },
        then: (r) => {
          if (table === "event_registrations") {
            return Promise.resolve({ data: state.paymentsList, error: null }).then(r);
          }
          return Promise.resolve({ data: [], error: null }).then(r);
        },
      };
      return chain;
    },
  }),
}));

// Stub notifications so markPaid/reject don't try to fan out.
vi.mock("../../backend/controllers/notificationController.js", () => ({
  sendNotification: vi.fn(async () => ({ ok: true })),
}));

// Mount only the events router + the validators. No CSRF, no session
// middleware — we stub the session directly per-request.
// Importing BOTH the router and the (mocked) supabase client here —
// the mocked createClient is what every .from() call will resolve to,
// so req.db.from(...) and the controllers' raw supabase.from(...) both
// end up on the same chain-object. That's the whole point of this file.
const eventRoutes = (await import("../../backend/routes/eventRoutes.js")).default;
const { createClient: mockedCreateClient } = await import("@supabase/supabase-js");
const mockedSupabase = mockedCreateClient();

/**
 * Build a minimal app with a fake session and a req.db proxy that
 * routes everything to the mocked supabase client above.
 *
 * role: controls which auth middleware branches we exercise.
 *       "student" / "teacher" / "admin".
 */
function buildApp({ userId = "u-student", role = "student", orgId = "org-A" } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { user: { id: userId, role, org_id: orgId, is_active: true } };
    req.userId   = userId;
    req.userRole = role;
    req.orgId    = orgId;
    req.id       = "req-test";
    // Tenant proxy — fans out to the mocked supabase client. We
    // don't need the real injectTenant logic; the terminal method
    // shapes are what matter for the assertions.
    req.db = {
      raw:   mockedSupabase,
      from:  (t) => mockedSupabase.from(t),
      audit: async (...args) => { state.auditCalls.push(args); },
    };
    next();
  });
  app.use("/api/events", eventRoutes);
  // Minimal error handler so uncaught throws don't bubble as 500s
  // without explanation. Kept terse; tests assert on status codes.
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

// ════════════════════════════════════════════════════════════
// STUDENT — POST /api/events/:id/registrations/:regId/pay
// ════════════════════════════════════════════════════════════

describe("POST /api/events/:id/registrations/:regId/pay", () => {
  it("400 when paymentRef is missing (validator)", async () => {
    const res = await request(buildApp())
      .post("/api/events/evt-1/registrations/reg-1/pay")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });

  it("400 when paymentRef is too short (validator)", async () => {
    const res = await request(buildApp())
      .post("/api/events/evt-1/registrations/reg-1/pay")
      .send({ paymentRef: "abc" });
    expect(res.status).toBe(400);
  });

  it("400 when paymentRef has special characters (validator)", async () => {
    const res = await request(buildApp())
      .post("/api/events/evt-1/registrations/reg-1/pay")
      .send({ paymentRef: "abc-123-xyz!" });
    expect(res.status).toBe(400);
  });

  it("404 when the registration does not exist", async () => {
    state.registration = null;
    const res = await request(buildApp())
      .post("/api/events/evt-1/registrations/reg-1/pay")
      .send({ paymentRef: "1234567890AB" });
    expect(res.status).toBe(404);
  });

  it("403 when trying to pay for someone else's registration", async () => {
    state.registration = { id: "reg-1", event_id: "evt-1", user_id: "other-student", status: "registered", payment_status: "pending" };
    const res = await request(buildApp({ userId: "u-student" }))
      .post("/api/events/evt-1/registrations/reg-1/pay")
      .send({ paymentRef: "1234567890AB" });
    expect(res.status).toBe(403);
  });

  it("400 when event is FREE (payment_status='not_required')", async () => {
    state.registration = { id: "reg-1", event_id: "evt-1", user_id: "u-student", status: "registered", payment_status: "not_required" };
    const res = await request(buildApp())
      .post("/api/events/evt-1/registrations/reg-1/pay")
      .send({ paymentRef: "1234567890AB" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/free/i);
  });

  it("409 when already paid", async () => {
    state.registration = { id: "reg-1", event_id: "evt-1", user_id: "u-student", status: "registered", payment_status: "paid" };
    const res = await request(buildApp())
      .post("/api/events/evt-1/registrations/reg-1/pay")
      .send({ paymentRef: "1234567890AB" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ALREADY_PAID");
  });

  it("happy path: pending → submitted with paymentRef stored", async () => {
    state.registration = { id: "reg-1", event_id: "evt-1", user_id: "u-student", status: "registered", payment_status: "pending" };
    state.updateReturn = { id: "reg-1", payment_status: "submitted", payment_ref: "UPI1234567890" };
    const res = await request(buildApp({ userId: "u-student" }))
      .post("/api/events/evt-1/registrations/reg-1/pay")
      .send({ paymentRef: "UPI1234567890" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(state.lastUpdate.payment_status).toBe("submitted");
    expect(state.lastUpdate.payment_ref).toBe("UPI1234567890");
    expect(state.lastUpdate.rejection_reason).toBeNull();
  });

  it("resubmission: rejected → submitted with reason cleared", async () => {
    state.registration = { id: "reg-1", event_id: "evt-1", user_id: "u-student", status: "registered", payment_status: "rejected" };
    state.updateReturn = { id: "reg-1", payment_status: "submitted", payment_ref: "FIXED12345678" };
    const res = await request(buildApp({ userId: "u-student" }))
      .post("/api/events/evt-1/registrations/reg-1/pay")
      .send({ paymentRef: "FIXED12345678" });
    expect(res.status).toBe(200);
    expect(state.lastUpdate.payment_status).toBe("submitted");
    expect(state.lastUpdate.rejection_reason).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════
// ADMIN — POST /api/events/:id/registrations/:regId/mark-paid
// ════════════════════════════════════════════════════════════

describe("POST /api/events/:id/registrations/:regId/mark-paid", () => {
  it("401 when not logged in", async () => {
    // Build an app WITHOUT the session-stubbing middleware.
    const app = express();
    app.use(express.json());
    app.use("/api/events", eventRoutes);
    const res = await request(app)
      .post("/api/events/evt-1/registrations/reg-1/mark-paid").send({});
    expect(res.status).toBe(401);
  });

  it("403 when logged in as a student (not teacher/admin)", async () => {
    const res = await request(buildApp({ role: "student" }))
      .post("/api/events/evt-1/registrations/reg-1/mark-paid").send({});
    expect(res.status).toBe(403);
  });

  it("404 when the registration doesn't exist", async () => {
    state.registration = null;
    const res = await request(buildApp({ role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-1/mark-paid").send({});
    expect(res.status).toBe(404);
  });

  it("400 when the event is free (payment_status=not_required)", async () => {
    state.registration = { id: "reg-1", event_id: "evt-1", user_id: "u-1", payment_status: "not_required" };
    const res = await request(buildApp({ role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-1/mark-paid").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/free/i);
  });

  it("idempotent: already-paid returns 200 with alreadyPaid flag", async () => {
    state.registration = { id: "reg-1", event_id: "evt-1", user_id: "u-1", payment_status: "paid" };
    const res = await request(buildApp({ role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-1/mark-paid").send({});
    expect(res.status).toBe(200);
    expect(res.body.alreadyPaid).toBe(true);
    // We did NOT write an update in the idempotent path.
    expect(state.lastUpdate).toBeNull();
  });

  it("happy path: submitted → paid with paid_at + marked_by set", async () => {
    state.registration = { id: "reg-1", event_id: "evt-1", user_id: "u-student", payment_status: "submitted" };
    state.updateReturn = { id: "reg-1", payment_status: "paid" };
    const res = await request(buildApp({ userId: "admin-42", role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-1/mark-paid").send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(state.lastUpdate.payment_status).toBe("paid");
    expect(state.lastUpdate.marked_by).toBe("admin-42");
    expect(state.lastUpdate.paid_at).toBeTruthy();
    expect(state.lastUpdate.rejection_reason).toBeNull();
    // Audit trail written.
    expect(state.auditCalls.length).toBe(1);
    expect(state.auditCalls[0][0]).toBe("event_payment_marked_paid");
  });

  it("ignores any extra body fields (markPaidSchema is strict {})", async () => {
    state.registration = { id: "reg-1", event_id: "evt-1", user_id: "u-1", payment_status: "submitted" };
    const res = await request(buildApp({ role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-1/mark-paid")
      .send({ overridePrice: 0, paid_at: "1970-01-01T00:00:00Z" });
    // strict() with an empty shape REJECTS any extra keys.
    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════
// ADMIN — POST /api/events/:id/registrations/:regId/reject
// ════════════════════════════════════════════════════════════

describe("POST /api/events/:id/registrations/:regId/reject", () => {
  it("400 when reason is missing (validator)", async () => {
    const res = await request(buildApp({ role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-1/reject").send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });

  it("400 when reason exceeds 300 chars", async () => {
    const res = await request(buildApp({ role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-1/reject")
      .send({ reason: "x".repeat(301) });
    expect(res.status).toBe(400);
  });

  it("404 when registration missing", async () => {
    state.registration = null;
    const res = await request(buildApp({ role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-1/reject")
      .send({ reason: "ref not found in bank app" });
    expect(res.status).toBe(404);
  });

  it("409 when trying to reject an already-paid registration", async () => {
    state.registration = { id: "reg-1", event_id: "evt-1", user_id: "u-1", payment_status: "paid" };
    const res = await request(buildApp({ role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-1/reject")
      .send({ reason: "changed my mind" });
    expect(res.status).toBe(409);
  });

  it("happy path: submitted → rejected with reason stored", async () => {
    state.registration = { id: "reg-1", event_id: "evt-1", user_id: "u-student", payment_status: "submitted" };
    state.updateReturn = { id: "reg-1", payment_status: "rejected" };
    const res = await request(buildApp({ userId: "admin-42", role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-1/reject")
      .send({ reason: "UPI ref 12345 wasn't found in bank statement" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(state.lastUpdate.payment_status).toBe("rejected");
    expect(state.lastUpdate.rejection_reason).toMatch(/bank statement/);
    expect(state.lastUpdate.marked_by).toBe("admin-42");
    expect(state.auditCalls.length).toBe(1);
    expect(state.auditCalls[0][0]).toBe("event_payment_rejected");
  });
});

// ════════════════════════════════════════════════════════════
// ADMIN — GET /api/events/:id/payments (reconciliation list)
// ════════════════════════════════════════════════════════════

describe("GET /api/events/:id/payments", () => {
  it("403 for a student", async () => {
    const res = await request(buildApp({ role: "student" })).get("/api/events/evt-1/payments");
    expect(res.status).toBe(403);
  });

  it("404 when the event isn't in this org", async () => {
    state.event = null;
    const res = await request(buildApp({ role: "admin" })).get("/api/events/evt-1/payments");
    expect(res.status).toBe(404);
  });

  it("happy path: returns event summary + registrations list", async () => {
    state.event        = { id: "evt-1", is_paid: true, price_paise: 5000 };
    state.paymentsList = [
      { id: "r-1", payment_status: "paid",      payment_ref: "A123", students: { name: "Alice", email: "a@x" } },
      { id: "r-2", payment_status: "submitted", payment_ref: "B456", students: { name: "Bob",   email: "b@x" } },
    ];
    const res = await request(buildApp({ role: "admin" })).get("/api/events/evt-1/payments");
    expect(res.status).toBe(200);
    expect(res.body.event.price_paise).toBe(5000);
    expect(res.body.registrations).toHaveLength(2);
  });
});

// ════════════════════════════════════════════════════════════
// EVENT VALIDATOR — paid-event sanity checks (migration 19 fields)
// ════════════════════════════════════════════════════════════

describe("validators/events.js — paid-event fields", () => {
  it("rejects a QR data URL for an unsupported image type", async () => {
    const { createEventSchema } = await import("../../backend/validators/events.js");
    const res = createEventSchema.safeParse({
      title: "x",
      is_paid: true,
      price_paise: 5000,
      payment_qr_base64: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
    });
    expect(res.success).toBe(false);
  });

  it("rejects a UPI ID without a @handle", async () => {
    const { createEventSchema } = await import("../../backend/validators/events.js");
    const res = createEventSchema.safeParse({
      title: "x",
      is_paid: true,
      price_paise: 5000,
      payment_upi_id: "notavalidupi",
    });
    expect(res.success).toBe(false);
  });

  it("accepts a well-formed paid event", async () => {
    const { createEventSchema } = await import("../../backend/validators/events.js");
    const res = createEventSchema.safeParse({
      title: "Hackathon",
      is_paid: true,
      price_paise: 25000,
      payment_upi_id: "mathclub@okhdfcbank",
      payment_instructions: "Include your USN in the transaction note",
    });
    expect(res.success).toBe(true);
  });
});
