/**
 * Integration tests — registrationController.js
 *
 * Covers the three hot-path handlers:
 *   1. POST   /api/events/:id/register       (registerForEvent)
 *   2. DELETE /api/events/:id/register       (cancelRegistration)
 *   3. GET    /api/events/:id/registrations  (getRegistrations)
 *
 * Why this file exists:
 *   Before this test, registrationController.js was at 0% coverage in the
 *   coverage-gated list — yet it owns paid-event payment_status defaulting,
 *   team-event validation (migration 22), capacity→waitlist promotion, and
 *   the load-bearing-vs-best-effort error split between cancel + promote.
 *   The backlog memo flagged it as coverage target #1 for good reason.
 *
 * Strategy:
 *   Mirrors tests/integration/paid-events.test.js — mock the supabase client
 *   + the tenant-aware req.db proxy, build a minimal Express app that mounts
 *   only eventRoutes, supertest against it. No real DB.
 *
 *   Differences from paid-events' mock:
 *     - select() captures `{ count: "exact" }` so the capacity count path
 *       resolves via `.then()` to `{ count, error }` instead of a data list.
 *     - order() is flagged on the chain so the second maybeSingle on
 *       event_registrations (the waitlist lookup) returns state.waitlisted
 *       rather than state.regRow.
 *     - An update-error queue (state.updateErrorQueue) lets a single test
 *       fail the FIRST update and succeed the SECOND, which is how we
 *       exercise the "cancel ok, promote fails → still 200" branch.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mutable mock state ────────────────────────────────────────────────
const state = {
  event:           null, // events table maybeSingle()
  regRow:          null, // event_registrations maybeSingle() WITHOUT .order()
  waitlisted:      null, // event_registrations maybeSingle() AFTER .order()
  capacityCount:   0,    // count of registered/attended seats
  insertReturn:    null, // insert().select().single() result
  insertError:     null, // set to force insert to fail
  updateReturn:    null, // default update().select().single() payload
  updateErrorQueue: [],  // consumed in order per update on event_registrations
  studentRow:      null, // students table maybeSingle() (XP award branch)
  regsList:        [],   // getRegistrations .then() result
  regsError:       null, // force getRegistrations to return error
  lastInsert:      null, // most recent insert payload (for assertions)
  lastUpdate:      null, // most recent update payload (for assertions)
};

beforeEach(() => {
  state.event            = null;
  state.regRow           = null;
  state.waitlisted       = null;
  state.capacityCount    = 0;
  state.insertReturn     = { id: "reg-new" };
  state.insertError      = null;
  state.updateReturn     = null;
  state.updateErrorQueue = [];
  state.studentRow       = null;
  state.regsList         = [];
  state.regsError        = null;
  state.lastInsert       = null;
  state.lastUpdate       = null;
  vi.clearAllMocks();
});

// Supabase mock. Each .from(table) returns a fresh chain so the
// `_isCount` / `_hadOrder` flags on one request don't bleed into the
// next `.from()` call on the same table.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      const chain = {
        _table:     table,
        _isCount:   false,
        _hadOrder:  false,
        select: (_cols, opts) => {
          if (opts && opts.count) chain._isCount = true;
          return chain;
        },
        insert: (payload) => {
          if (table !== "students") state.lastInsert = payload;
          return {
            select: () => ({
              single: async () => {
                if (state.insertError) return { data: null, error: state.insertError };
                return { data: state.insertReturn, error: null };
              },
            }),
          };
        },
        update: (payload) => {
          // Skip recording the requireAuth last_seen_at writes on students,
          // else they'd stomp on the test's real assertion target.
          if (table !== "students") state.lastUpdate = payload;
          return {
            eq: () => {
              // Per-call error on event_registrations only; queue is
              // consumed in arrival order so tests can say
              // "first update ok, second update fails" for the
              // cancel + promote branch.
              let err = null;
              if (table === "event_registrations" && state.updateErrorQueue.length) {
                err = state.updateErrorQueue.shift();
              }
              const updated = err
                ? null
                : (state.updateReturn ?? { id: "row-upd", ...payload });
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
        neq:   () => chain,
        in:    () => chain,
        or:    () => chain,
        order: () => { chain._hadOrder = true; return chain; },
        range: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          if (table === "event_registrations") {
            // After .order() the controller is reading the next
            // waitlisted user to promote — a different row than the
            // "current user's registration" row used by the duplicate
            // check + cancel lookup.
            if (chain._hadOrder) return { data: state.waitlisted, error: null };
            return { data: state.regRow, error: null };
          }
          if (table === "events")   return { data: state.event,       error: null };
          if (table === "students") return { data: state.studentRow,  error: null };
          return { data: null, error: null };
        },
        single: async () => ({ data: null, error: null }),
        then: (r) => {
          // Capacity count: .select("*", {count:"exact"}).eq().in() awaited.
          if (chain._isCount && table === "event_registrations") {
            return Promise.resolve({ count: state.capacityCount, error: null }).then(r);
          }
          // getRegistrations: .select().eq().order() awaited.
          if (chain._hadOrder && table === "event_registrations") {
            return Promise.resolve({ data: state.regsList, error: state.regsError }).then(r);
          }
          return Promise.resolve({ data: [], error: null }).then(r);
        },
      };
      return chain;
    },
  }),
}));

// Notifications are fire-and-forget from cancel's waitlist promotion.
// Stub to silence and allow assertion if ever needed.
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

// Common helper — a "registering" event row: is_active=true +
// registration_open=true + no start/end/deadline → computeStatus
// returns "registering", so registerForEvent proceeds to validation.
function openEvent(extra = {}) {
  return {
    id: "evt-1",
    is_active: true,
    registration_open: true,
    is_paid: false,
    org_id: "org-A",
    capacity: null,
    xp_bonus_first: 0,
    is_team_event: false,
    ...extra,
  };
}

// ════════════════════════════════════════════════════════════
// POST /api/events/:id/register — registerForEvent
// ════════════════════════════════════════════════════════════

describe("POST /api/events/:id/register — event existence & status", () => {
  it("404 when event doesn't exist in this org", async () => {
    state.event = null;
    const res = await request(buildApp()).post("/api/events/evt-1/register").send({});
    expect(res.status).toBe(404);
  });

  it("400 when event has already ended (completed)", async () => {
    state.event = openEvent({ ends_at: new Date(Date.now() - 60_000).toISOString() });
    const res = await request(buildApp()).post("/api/events/evt-1/register").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ended/i);
  });

  it("400 when registration is closed (registration_open=false)", async () => {
    state.event = openEvent({ registration_open: false });
    const res = await request(buildApp()).post("/api/events/evt-1/register").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/closed/i);
  });
});

describe("POST /api/events/:id/register — team-event validation (migration 22)", () => {
  beforeEach(() => {
    state.event = openEvent({
      is_team_event: true,
      min_team_size: 2,
      max_team_size: 5,
    });
  });

  it("400 when team_name is missing", async () => {
    const res = await request(buildApp()).post("/api/events/evt-1/register")
      .send({ team_size: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/team_name/i);
  });

  it("400 when team_name exceeds 80 chars", async () => {
    const res = await request(buildApp()).post("/api/events/evt-1/register")
      .send({ team_name: "x".repeat(81), team_size: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too long/i);
  });

  it("400 when team_size is not an integer", async () => {
    const res = await request(buildApp()).post("/api/events/evt-1/register")
      .send({ team_name: "Alpha", team_size: "three" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/team_size required/i);
  });

  it("400 when team_size is below the event minimum", async () => {
    const res = await request(buildApp()).post("/api/events/evt-1/register")
      .send({ team_name: "Alpha", team_size: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/between 2 and 5/);
  });

  it("400 when team_size exceeds the event maximum", async () => {
    const res = await request(buildApp()).post("/api/events/evt-1/register")
      .send({ team_name: "Alpha", team_size: 6 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/between 2 and 5/);
  });

  it("201 happy path — stores team_name + team_size on the new row", async () => {
    state.regRow = null; // no duplicate
    state.insertReturn = {
      id: "reg-new",
      team_name: "Alpha Squad",
      team_size: 4,
    };
    const res = await request(buildApp()).post("/api/events/evt-1/register")
      .send({ team_name: "Alpha Squad", team_size: 4 });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(state.lastInsert.team_name).toBe("Alpha Squad");
    expect(state.lastInsert.team_size).toBe(4);
  });
});

describe("POST /api/events/:id/register — duplicate detection", () => {
  beforeEach(() => { state.event = openEvent(); });

  it("409 when already registered (status='registered')", async () => {
    state.regRow = { id: "reg-old", status: "registered" };
    const res = await request(buildApp()).post("/api/events/evt-1/register").send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it("201 re-activates when previous registration was cancelled", async () => {
    state.regRow = { id: "reg-old", status: "cancelled" };
    state.updateReturn = { id: "reg-old", status: "registered" };
    const res = await request(buildApp()).post("/api/events/evt-1/register").send({});
    expect(res.status).toBe(201);
    // Re-register path clears the prior payment fields.
    expect(state.lastUpdate.status).toBe("registered");
    expect(state.lastUpdate.rejection_reason).toBeNull();
    expect(state.lastUpdate.paid_at).toBeNull();
  });
});

describe("POST /api/events/:id/register — capacity + payment defaults", () => {
  it("201 free event → payment_status='not_required' on insert", async () => {
    state.event = openEvent({ is_paid: false });
    const res = await request(buildApp()).post("/api/events/evt-1/register").send({});
    expect(res.status).toBe(201);
    expect(state.lastInsert.payment_status).toBe("not_required");
  });

  it("201 paid event → payment_status='pending' on insert", async () => {
    state.event = openEvent({ is_paid: true, price_paise: 5000 });
    const res = await request(buildApp()).post("/api/events/evt-1/register").send({});
    expect(res.status).toBe(201);
    expect(state.lastInsert.payment_status).toBe("pending");
  });

  it("201 with waitlisted=true when capacity is full", async () => {
    state.event = openEvent({ capacity: 2 });
    state.capacityCount = 2;
    state.insertReturn = { id: "reg-wait", status: "waitlisted" };
    const res = await request(buildApp()).post("/api/events/evt-1/register").send({});
    expect(res.status).toBe(201);
    expect(res.body.waitlisted).toBe(true);
    expect(state.lastInsert.status).toBe("waitlisted");
  });

  it("500 when the insert fails", async () => {
    state.event = openEvent();
    state.insertError = { message: "unique constraint violation" };
    const res = await request(buildApp()).post("/api/events/evt-1/register").send({});
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/unique constraint/);
  });
});

// ════════════════════════════════════════════════════════════
// DELETE /api/events/:id/register — cancelRegistration
// ════════════════════════════════════════════════════════════

describe("DELETE /api/events/:id/register — cancelRegistration", () => {
  it("404 when the user isn't registered for this event", async () => {
    state.regRow = null;
    const res = await request(buildApp()).delete("/api/events/evt-1/register");
    expect(res.status).toBe(404);
  });

  it("400 when already cancelled", async () => {
    state.regRow = { id: "reg-1", status: "cancelled" };
    const res = await request(buildApp()).delete("/api/events/evt-1/register");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already cancelled/i);
  });

  it("400 when trying to cancel after attending", async () => {
    state.regRow = { id: "reg-1", status: "attended" };
    const res = await request(buildApp()).delete("/api/events/evt-1/register");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot cancel/i);
  });

  it("200 happy path — no waitlist, cancel succeeds", async () => {
    state.regRow     = { id: "reg-1", status: "registered" };
    state.waitlisted = null;
    const res = await request(buildApp()).delete("/api/events/evt-1/register");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(state.lastUpdate.status).toBe("cancelled");
  });

  it("200 happy path — cancel + promotes first waitlisted user", async () => {
    state.regRow     = { id: "reg-1", status: "registered" };
    state.waitlisted = { id: "wait-1", user_id: "u-next" };
    const res = await request(buildApp()).delete("/api/events/evt-1/register");
    expect(res.status).toBe(200);
    // The promote is the SECOND update on event_registrations, so the
    // last-recorded payload is { status: "registered" }.
    expect(state.lastUpdate.status).toBe("registered");
  });

  it("500 when the cancel update itself fails (load-bearing)", async () => {
    state.regRow = { id: "reg-1", status: "registered" };
    // First update on event_registrations fails → cancel is load-bearing,
    // controller must NOT proceed to the promotion block.
    state.updateErrorQueue = [{ message: "row locked" }];
    const res = await request(buildApp()).delete("/api/events/evt-1/register");
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/cancellation failed/i);
  });

  it("200 when cancel succeeds but promotion fails (best-effort)", async () => {
    state.regRow     = { id: "reg-1", status: "registered" };
    state.waitlisted = { id: "wait-1", user_id: "u-next" };
    // First update (cancel) → ok; second update (promote) → error.
    // The contract: the seat IS free, cancel is done, return 200.
    state.updateErrorQueue = [null, { message: "promote boom" }];
    const res = await request(buildApp()).delete("/api/events/evt-1/register");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/events/:id/registrations — getRegistrations (teacher)
// ════════════════════════════════════════════════════════════

describe("GET /api/events/:id/registrations — getRegistrations", () => {
  it("403 for a student (requireTeacher)", async () => {
    const res = await request(buildApp({ role: "student" }))
      .get("/api/events/evt-1/registrations");
    expect(res.status).toBe(403);
  });

  it("500 when supabase returns an error", async () => {
    state.regsError = { message: "select boom" };
    const res = await request(buildApp({ role: "teacher" }))
      .get("/api/events/evt-1/registrations");
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/select boom/);
  });

  it("200 happy path — returns the list (empty-safe)", async () => {
    state.regsList = [
      { id: "r-1", status: "registered", students: { name: "Alice" } },
      { id: "r-2", status: "waitlisted", students: { name: "Bob"   } },
    ];
    const res = await request(buildApp({ role: "teacher" }))
      .get("/api/events/evt-1/registrations");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].students.name).toBe("Alice");
  });
});
