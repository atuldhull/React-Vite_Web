/**
 * Integration tests — paymentReconciliationController.js, extras.
 *
 * paid-events.test.js covers the happy paths + validator failures for
 * submitPaymentRef / markPaid / rejectPayment / getPaymentsForEvent.
 * The uncovered surface left over from that file is:
 *
 *   1. markPaid's early-bird XP re-award branch (migration 19 defers XP
 *      for paid events; this block awards it on verification). The
 *      existing test seeds state.event WITHOUT xp_bonus_first so the
 *      branch never fires. This file gives it dedicated state + three
 *      focused cases (awarded / not-in-earliest / throws-but-swallowed).
 *
 *   2. submitPaymentRef's cancelled-registration branch — rejects
 *      payment attempts after cancellation.
 *
 *   3. getPaymentsForEvent's supabase-error path (500 on the list query)
 *      and the event-not-found 404 (defence-in-depth org check).
 *
 * Why a separate file instead of extending paid-events.test.js:
 *   The existing mock's `.then()` terminal on event_registrations returns
 *   state.paymentsList, and its `maybeSingle()` returns state.registration
 *   regardless of which query called it. The XP branch needs DIFFERENT
 *   returns per chain — a different students row, a list of earliest
 *   registrants, a distinct event row with xp_bonus_first. Stretching the
 *   existing mock to cover both shapes would invite flakiness across the
 *   tests already there. A fresh mock scoped to this narrow surface is
 *   cleaner.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── State per test ────────────────────────────────────────────────────
const state = {
  // event_registrations rows
  reg:            null, // returned by the initial .select(...).eq(id).eq(event_id).maybeSingle()
  regFetchError:  null, // force the initial reg lookup to return an error
  earliest:       [],   // returned by .select().in().order().limit() (awaited)
  listForRecon:   [],   // returned by the reconciliation .select().eq().order() (awaited, no .in/.limit)
  listError:      null, // force the reconciliation list to error out
  updateReturn:   null, // value from .update().eq().select().single()
  updateError:    null, // force update to error
  // events rows
  event:          null, // xp_bonus_first lookup
  eventForOrg:    null, // getPaymentsForEvent's event-in-org check
  // students rows
  student:        null,
  studentError:   null, // force .select(xp,weekly_xp).maybeSingle() to fail
  // Observation
  studentUpdates: [],   // every patch written to students
  lastUpdate:     null, // most-recent event_registrations update payload
};

beforeEach(() => {
  state.reg            = null;
  state.regFetchError  = null;
  state.earliest       = [];
  state.listForRecon   = [];
  state.listError      = null;
  state.updateReturn   = null;
  state.updateError    = null;
  state.event          = null;
  state.eventForOrg    = { id: "evt-1", is_paid: true, price_paise: 5000 };
  state.student        = null;
  state.studentError   = null;
  state.studentUpdates = [];
  state.lastUpdate     = null;
  vi.clearAllMocks();
});

// Supabase mock with chain-level flag tracking so different callers on
// the same table resolve to different payloads:
//   .from("event_registrations").select().eq().eq().maybeSingle() → state.reg
//   .from("event_registrations").select().in().order().limit()    → state.earliest (via .then)
//   .from("event_registrations").select().eq().order()            → state.listForRecon (via .then)
//   .from("event_registrations").update().eq().select().single()  → state.updateReturn
//   .from("events").select(xp_bonus_first).eq().maybeSingle()     → state.event
//   .from("events").select(id,is_paid,price).eq().maybeSingle()   → state.eventForOrg
//   .from("students").select(xp,weekly_xp).eq().maybeSingle()     → state.student
//   .from("students").update().eq()                               → recorded in state.studentUpdates
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      const chain = {
        _table:     table,
        _hasIn:     false,
        _hasLimit:  false,
        _hasOrder:  false,
        _selectCols: "",
        select: (cols) => { chain._selectCols = cols || ""; return chain; },
        insert: () => ({
          select: () => ({ single: async () => ({ data: null, error: null }) }),
        }),
        update: (payload) => {
          if (table === "students") state.studentUpdates.push(payload);
          else state.lastUpdate = payload;
          return {
            eq: () => {
              const err = (table === "event_registrations" && state.updateError) ? state.updateError : null;
              const updated = err ? null : (state.updateReturn ?? { id: "row-upd", ...payload });
              return {
                select: () => ({
                  single: async () => ({ data: updated, error: err }),
                }),
                then:  (r) => Promise.resolve({ data: updated, error: err }).then(r),
                catch: () => {},
              };
            },
          };
        },
        eq:    () => chain,
        in:    () => { chain._hasIn = true; return chain; },
        order: () => { chain._hasOrder = true; return chain; },
        limit: () => { chain._hasLimit = true; return chain; },
        maybeSingle: async () => {
          if (table === "event_registrations") {
            if (state.regFetchError) return { data: null, error: state.regFetchError };
            return { data: state.reg, error: null };
          }
          if (table === "events") {
            // xp_bonus_first lookup (markPaid) vs the org-scoped event
            // lookup (getPaymentsForEvent). Distinguished by the
            // select column list the controller passes.
            if (chain._selectCols.includes("xp_bonus_first")) {
              return { data: state.event, error: null };
            }
            return { data: state.eventForOrg, error: null };
          }
          if (table === "students") {
            if (state.studentError) return { data: null, error: state.studentError };
            return { data: state.student, error: null };
          }
          return { data: null, error: null };
        },
        // .single() is used after .update().eq().select() — unused here
        // as a standalone terminal, so keep it defensive.
        single: async () => {
          if (table === "event_registrations") return { data: state.reg, error: null };
          return { data: null, error: null };
        },
        then: (r) => {
          if (table === "event_registrations") {
            // The early-bird query uses .in().order().limit(), the
            // reconciliation list uses .order() alone. That's enough
            // to tell them apart without also filtering by the
            // selected column list.
            if (chain._hasIn && chain._hasLimit) {
              return Promise.resolve({ data: state.earliest, error: null }).then(r);
            }
            if (chain._hasOrder) {
              return Promise.resolve({ data: state.listForRecon, error: state.listError }).then(r);
            }
          }
          return Promise.resolve({ data: [], error: null }).then(r);
        },
      };
      return chain;
    },
  }),
}));

// Notifications are fire-and-forget — keep silent for deterministic tests.
vi.mock("../../backend/controllers/notificationController.js", () => ({
  sendNotification: vi.fn(async () => ({ ok: true })),
}));

const eventRoutes = (await import("../../backend/routes/eventRoutes.js")).default;
const { createClient: mockedCreateClient } = await import("@supabase/supabase-js");
const mockedSupabase = mockedCreateClient();

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

// ════════════════════════════════════════════════════════════
// markPaid — early-bird XP re-award branch
// ════════════════════════════════════════════════════════════

describe("POST mark-paid — early-bird XP re-award branch", () => {
  it("awards xp_bonus_first when verified student is in the earliest N", async () => {
    state.reg          = { id: "reg-1", event_id: "evt-1", user_id: "u-student", payment_status: "submitted" };
    state.event        = { xp_bonus_first: 50 };
    state.earliest     = [
      { user_id: "u-first" },
      { user_id: "u-student" }, // ← our student, ranks 2nd — still early-bird
    ];
    state.student      = { xp: 100, weekly_xp: 10 };

    const res = await request(buildApp({ userId: "admin-1", role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-1/mark-paid").send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Exactly one XP award write (plus any last_seen_at write the auth
    // middleware fires — those go to the students table too, but
    // requireAuth's payload is {last_seen_at:...}, and ours is
    // {xp, weekly_xp}. Find the XP patch specifically.)
    const xpPatch = state.studentUpdates.find(p => "xp" in p);
    expect(xpPatch).toBeDefined();
    expect(xpPatch.xp).toBe(150);        // 100 + 50
    expect(xpPatch.weekly_xp).toBe(60);  // 10 + 50
  });

  it("does NOT award XP when the event has xp_bonus_first = 0", async () => {
    state.reg       = { id: "reg-1", event_id: "evt-1", user_id: "u-student", payment_status: "submitted" };
    state.event     = { xp_bonus_first: 0 };
    state.earliest  = [{ user_id: "u-student" }];
    state.student   = { xp: 100, weekly_xp: 10 };

    const res = await request(buildApp({ userId: "admin-1", role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-1/mark-paid").send({});

    expect(res.status).toBe(200);
    expect(state.studentUpdates.find(p => "xp" in p)).toBeUndefined();
  });

  it("does NOT award XP when verified student is past the early-bird window", async () => {
    state.reg       = { id: "reg-late", event_id: "evt-1", user_id: "u-late", payment_status: "submitted" };
    state.event     = { xp_bonus_first: 50 };
    // 10 earlier registrations, "u-late" isn't among them.
    state.earliest  = Array.from({ length: 10 }, (_, i) => ({ user_id: `u-early-${i}` }));
    state.student   = { xp: 100, weekly_xp: 10 };

    const res = await request(buildApp({ userId: "admin-1", role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-late/mark-paid").send({});

    expect(res.status).toBe(200);
    expect(state.studentUpdates.find(p => "xp" in p)).toBeUndefined();
  });

  it("swallows XP-award failure — main mark-paid still succeeds", async () => {
    state.reg      = { id: "reg-1", event_id: "evt-1", user_id: "u-student", payment_status: "submitted" };
    state.event    = { xp_bonus_first: 50 };
    state.earliest = [{ user_id: "u-student" }];
    // The student-row fetch inside the try{} throws — the block has a
    // catch() that logs and moves on. The caller must still see 200.
    state.studentError = { message: "student read boom" };

    const res = await request(buildApp({ userId: "admin-1", role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-1/mark-paid").send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(state.studentUpdates.find(p => "xp" in p)).toBeUndefined();
  });

  it("does NOT award XP when the student row is missing (first-time user safety)", async () => {
    state.reg      = { id: "reg-1", event_id: "evt-1", user_id: "u-student", payment_status: "submitted" };
    state.event    = { xp_bonus_first: 50 };
    state.earliest = [{ user_id: "u-student" }];
    state.student  = null; // maybeSingle returns null → skip the update

    const res = await request(buildApp({ userId: "admin-1", role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-1/mark-paid").send({});

    expect(res.status).toBe(200);
    expect(state.studentUpdates.find(p => "xp" in p)).toBeUndefined();
  });

  it("500 when the mark-paid update itself fails", async () => {
    state.reg         = { id: "reg-1", event_id: "evt-1", user_id: "u-student", payment_status: "submitted" };
    state.updateError = { message: "update boom" };

    const res = await request(buildApp({ userId: "admin-1", role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-1/mark-paid").send({});

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/update failed/i);
  });
});

// ════════════════════════════════════════════════════════════
// submitPaymentRef — cancelled-registration branch
// ════════════════════════════════════════════════════════════

describe("POST pay — cancelled-registration branch", () => {
  it("400 when trying to submit a UPI ref for a cancelled registration", async () => {
    state.reg = { id: "reg-1", event_id: "evt-1", user_id: "u-student", status: "cancelled", payment_status: "pending" };
    const res = await request(buildApp())
      .post("/api/events/evt-1/registrations/reg-1/pay")
      .send({ paymentRef: "1234567890AB" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cancelled/i);
  });
});

// ════════════════════════════════════════════════════════════
// getPaymentsForEvent — error paths
// ════════════════════════════════════════════════════════════

describe("GET payments — error paths", () => {
  it("500 when the registrations list query errors", async () => {
    state.listError = { message: "list boom" };
    const res = await request(buildApp({ role: "admin" }))
      .get("/api/events/evt-1/payments");
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/list boom/);
  });

  it("404 when the event isn't in the caller's org (defence-in-depth)", async () => {
    state.listForRecon = []; // select() succeeds but the org-check misses
    state.eventForOrg  = null;
    const res = await request(buildApp({ role: "admin" }))
      .get("/api/events/evt-1/payments");
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════
// Fetch-error 500 paths — each handler has a .maybeSingle() whose
// error branch logs and returns 500. These three tests close them.
// ════════════════════════════════════════════════════════════

describe("Fetch-error 500 paths", () => {
  it("submitPaymentRef returns 500 when the registration lookup errors", async () => {
    state.regFetchError = { message: "reg read boom" };
    const res = await request(buildApp())
      .post("/api/events/evt-1/registrations/reg-1/pay")
      .send({ paymentRef: "1234567890AB" });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/lookup failed/i);
  });

  it("markPaid returns 500 when the registration lookup errors", async () => {
    state.regFetchError = { message: "reg read boom" };
    const res = await request(buildApp({ role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-1/mark-paid").send({});
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/lookup failed/i);
  });

  it("rejectPayment returns 500 when the registration lookup errors", async () => {
    state.regFetchError = { message: "reg read boom" };
    const res = await request(buildApp({ role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-1/reject")
      .send({ reason: "wrong UPI ref" });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/lookup failed/i);
  });
});

// ════════════════════════════════════════════════════════════
// submitPaymentRef + rejectPayment — update-error 500 paths
// ════════════════════════════════════════════════════════════

describe("Update-error 500 paths", () => {
  it("submitPaymentRef returns 500 when the status update errors", async () => {
    state.reg         = { id: "reg-1", event_id: "evt-1", user_id: "u-student", status: "registered", payment_status: "pending" };
    state.updateError = { message: "update boom" };
    const res = await request(buildApp())
      .post("/api/events/evt-1/registrations/reg-1/pay")
      .send({ paymentRef: "1234567890AB" });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/update failed/i);
  });

  it("rejectPayment returns 500 when the reject update errors", async () => {
    state.reg         = { id: "reg-1", event_id: "evt-1", user_id: "u-student", payment_status: "submitted" };
    state.updateError = { message: "reject boom" };
    const res = await request(buildApp({ role: "admin" }))
      .post("/api/events/evt-1/registrations/reg-1/reject")
      .send({ reason: "ref not in bank app" });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/update failed/i);
  });
});
