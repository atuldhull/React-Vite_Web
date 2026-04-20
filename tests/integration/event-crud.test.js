/**
 * Integration tests — event/eventCrudController.js (was 0 % in the gate).
 *
 * Six handlers:
 *   GET    /api/events              — getEvents (list + counts + user reg)
 *   GET    /api/events/:id          — getEvent (UUID guard, 404, enriched)
 *   POST   /api/events              — createEvent (paid-event sanity)
 *   PATCH  /api/events/:id          — updateEvent (partial merge + paid sanity)
 *   DELETE /api/events/:id          — deleteEvent (soft)
 *   PATCH  /api/events/:id/toggle-reg — toggleRegistration
 *
 * Key invariants:
 *   - getEvent rejects non-UUID ids at 400 (diagnostics for /events/undefined)
 *   - createEvent requires title; is_paid=true requires price + a UPI or QR
 *   - updateEvent allow-list (no rogue fields persist)
 *   - toggleRegistration flips the registration_open bool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const state = {
  eventRow:       null,
  eventList:      [],
  eventListErr:   null,
  eventUpdateReturn: null,
  eventUpdateError:  null,
  eventInsertReturn: null,
  eventInsertError:  null,
  count:          0,
  userReg:        null,
  regs:           [],
  userRegs:       [],
  students:       [],
  lastInsert:     null,
  lastUpdate:     null,
};

beforeEach(() => {
  state.eventRow          = null;
  state.eventList         = [];
  state.eventListErr      = null;
  state.eventUpdateReturn = null;
  state.eventUpdateError  = null;
  state.eventInsertReturn = null;
  state.eventInsertError  = null;
  state.count             = 0;
  state.userReg           = null;
  state.regs              = [];
  state.userRegs          = [];
  state.students          = [];
  state.lastInsert        = null;
  state.lastUpdate        = null;
  vi.clearAllMocks();
});

vi.mock("../../backend/middleware/authMiddleware.js", () => ({
  requireAuth:       (_req, _res, next) => next(),
  requireTeacher:    (_req, _res, next) => next(),
  requireAdmin:      (_req, _res, next) => next(),
  requireSuperAdmin: (_req, _res, next) => next(),
  requireSameOrg:    (_req, _res, next) => next(),
  checkFeatureFlag:  () => (_req, _res, next) => next(),
}));

// No-op the notification fan-out so createEvent doesn't try to talk
// to the real sendNotification.
vi.mock("../../backend/controllers/notificationController.js", () => ({
  sendNotification: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      const chain = {
        _table: table,
        _filters: {},
        _isCount: false,
        _hasIn: false,
        select: (_cols, opts) => { if (opts?.count) chain._isCount = true; return chain; },
        insert: (payload) => {
          if (table === "events") state.lastInsert = payload;
          return {
            select: () => ({
              single: async () => {
                if (state.eventInsertError) return { data: null, error: state.eventInsertError };
                return { data: state.eventInsertReturn ?? { id: "evt-new", ...payload }, error: null };
              },
            }),
          };
        },
        update: (payload) => {
          if (table === "events") state.lastUpdate = payload;
          return {
            eq: () => ({
              select: () => ({
                single: async () => {
                  if (state.eventUpdateError) return { data: null, error: state.eventUpdateError };
                  return { data: state.eventUpdateReturn ?? { id: "evt-upd", ...payload }, error: null };
                },
              }),
              then: (r) => Promise.resolve({ data: null, error: null }).then(r),
              catch: () => {},
            }),
          };
        },
        eq: (col, val) => { chain._filters[col] = val; return chain; },
        in: () => { chain._hasIn = true; return chain; },
        or: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          if (table === "events")              return { data: state.eventRow, error: null };
          if (table === "event_registrations") return { data: state.userReg,  error: null };
          return { data: null, error: null };
        },
        single: async () => ({ data: null, error: null }),
        then: (r) => {
          if (chain._isCount && table === "event_registrations") {
            return Promise.resolve({ count: state.count, error: null }).then(r);
          }
          if (table === "events") {
            return Promise.resolve({ data: state.eventList, error: state.eventListErr }).then(r);
          }
          if (table === "event_registrations") {
            if (chain._hasIn && !chain._filters.user_id) {
              return Promise.resolve({ data: state.regs, error: null }).then(r);
            }
            return Promise.resolve({ data: state.userRegs, error: null }).then(r);
          }
          if (table === "students") {
            return Promise.resolve({ data: state.students, error: null }).then(r);
          }
          return Promise.resolve({ data: [], error: null }).then(r);
        },
      };
      return chain;
    },
  }),
}));

const routes = (await import("../../backend/routes/eventRoutes.js")).default;
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient();

function buildApp({ userId = "u-1", role = "teacher", hasSession = true } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = userId; req.userRole = role; req.orgId = "org-A";
    req.session = hasSession ? { user: { id: userId, role, org_id: "org-A", is_active: true } } : {};
    req.db = { from: (t) => sb.from(t), audit: async () => {} };
    next();
  });
  app.use("/api/events", routes);
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

// ════════════════════════════════════════════════════════════
// GET /api/events
// ════════════════════════════════════════════════════════════

describe("GET /api/events — getEvents", () => {
  it("returns the enriched list for a logged-out caller", async () => {
    state.eventList = [
      { id: "evt-1", title: "Hack",    is_active: true, capacity: 10 },
      { id: "evt-2", title: "Lecture", is_active: true },
    ];
    state.regs = [
      { event_id: "evt-1" }, { event_id: "evt-1" }, { event_id: "evt-2" },
    ];
    const res = await request(buildApp({ hasSession: false })).get("/api/events");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].registration_count).toBe(2);
    expect(res.body[1].registration_count).toBe(1);
  });

  it("includes user_registration for a logged-in caller", async () => {
    state.eventList = [{ id: "evt-1", title: "Hack", is_active: true }];
    state.regs = [{ event_id: "evt-1" }];
    state.userRegs = [{ event_id: "evt-1", status: "registered", qr_token: "x" }];
    const res = await request(buildApp()).get("/api/events");
    expect(res.status).toBe(200);
    expect(res.body[0].user_registration).toBeTruthy();
    expect(res.body[0].user_registration.status).toBe("registered");
  });

  it("flips is_full when registration_count >= capacity", async () => {
    state.eventList = [{ id: "evt-1", title: "Hack", is_active: true, capacity: 2 }];
    state.regs = [{ event_id: "evt-1" }, { event_id: "evt-1" }];
    const res = await request(buildApp({ hasSession: false })).get("/api/events");
    expect(res.body[0].is_full).toBe(true);
  });

  it("500 when the events query errors", async () => {
    state.eventListErr = { message: "events boom" };
    const res = await request(buildApp()).get("/api/events");
    expect(res.status).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/events/:id — UUID guard + 404 + enriched single
// ════════════════════════════════════════════════════════════

describe("GET /api/events/:id — getEvent", () => {
  it("400 when id is not a UUID (defence against /events/undefined)", async () => {
    const res = await request(buildApp()).get("/api/events/undefined");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid event ID/i);
  });

  it("404 when the UUID doesn't resolve to an event in the caller's org", async () => {
    state.eventRow = null;
    const res = await request(buildApp()).get("/api/events/00000000-0000-4000-8000-000000000000");
    expect(res.status).toBe(404);
  });

  it("200 returns the event enriched with registration_count + user_registration", async () => {
    state.eventRow = { id: "00000000-0000-4000-8000-000000000000", title: "Hack", capacity: 10 };
    state.count    = 3;
    state.userReg  = { id: "r-1", status: "registered" };
    const res = await request(buildApp()).get("/api/events/00000000-0000-4000-8000-000000000000");
    expect(res.status).toBe(200);
    expect(res.body.registration_count).toBe(3);
    expect(res.body.user_registration.status).toBe("registered");
    expect(res.body.is_full).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/events — createEvent
// ════════════════════════════════════════════════════════════

describe("POST /api/events — createEvent", () => {
  it("400 when title is missing", async () => {
    const res = await request(buildApp()).post("/api/events").send({ description: "d" });
    expect(res.status).toBe(400);
  });

  it("400 when is_paid=true but price_paise is missing", async () => {
    const res = await request(buildApp()).post("/api/events")
      .send({ title: "Hack", is_paid: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-zero price/i);
  });

  it("400 when is_paid=true but neither UPI nor QR is provided", async () => {
    const res = await request(buildApp()).post("/api/events")
      .send({ title: "Hack", is_paid: true, price_paise: 5000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/payment_upi_id or a payment_qr/i);
  });

  it("201 happy path — paid event with UPI + fans notifications out to students", async () => {
    state.students = [{ user_id: "s-1" }, { user_id: "s-2" }];
    const res = await request(buildApp()).post("/api/events")
      .send({
        title: "Hack",
        is_paid: true,
        price_paise: 5000,
        payment_upi_id: "mathclub@okhdfcbank",
      });
    expect(res.status).toBe(201);
    expect(state.lastInsert.is_paid).toBe(true);
    expect(state.lastInsert.price_paise).toBe(5000);
    expect(state.lastInsert.payment_upi_id).toBe("mathclub@okhdfcbank");
  });

  it("defaults banner_color and event_type when not provided", async () => {
    const res = await request(buildApp()).post("/api/events").send({ title: "Plain event" });
    expect(res.status).toBe(201);
    expect(state.lastInsert.banner_color).toBe("#7c3aed");
    expect(state.lastInsert.event_type).toBe("general");
  });
});

// ════════════════════════════════════════════════════════════
// PATCH /api/events/:id — updateEvent
// ════════════════════════════════════════════════════════════

describe("PATCH /api/events/:id — updateEvent", () => {
  it("strips unknown fields via allow-list (security)", async () => {
    state.eventUpdateReturn = { id: "evt-1" };
    const res = await request(buildApp()).patch("/api/events/evt-1")
      .send({ title: "New", rogue_field: "should not land" });
    expect(res.status).toBe(200);
    expect(state.lastUpdate.title).toBe("New");
    expect(state.lastUpdate.rogue_field).toBeUndefined();
  });

  it("400 when flipping to is_paid=true without a positive price", async () => {
    const res = await request(buildApp()).patch("/api/events/evt-1")
      .send({ is_paid: true, price_paise: 0 });
    expect(res.status).toBe(400);
  });

  it("400 when flipping to is_paid=true and explicitly nulling both UPI + QR", async () => {
    const res = await request(buildApp()).patch("/api/events/evt-1")
      .send({ is_paid: true, price_paise: 5000, payment_upi_id: null, payment_qr_base64: null });
    expect(res.status).toBe(400);
  });

  it("200 happy path partial update", async () => {
    state.eventUpdateReturn = { id: "evt-1", title: "Updated" };
    const res = await request(buildApp()).patch("/api/events/evt-1").send({ title: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.event.title).toBe("Updated");
  });

  it("500 when the update query errors", async () => {
    state.eventUpdateError = { message: "update boom" };
    const res = await request(buildApp()).patch("/api/events/evt-1").send({ title: "x" });
    expect(res.status).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════
// DELETE /api/events/:id — soft delete
// ════════════════════════════════════════════════════════════

describe("DELETE /api/events/:id — deleteEvent (soft)", () => {
  it("flips is_active=false and returns success", async () => {
    const res = await request(buildApp()).delete("/api/events/evt-1");
    expect(res.status).toBe(200);
    expect(state.lastUpdate.is_active).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// PATCH /api/events/:id/toggle-reg
// ════════════════════════════════════════════════════════════

describe("PATCH /api/events/:id/toggle-reg — toggleRegistration", () => {
  it("404 when event doesn't exist", async () => {
    state.eventRow = null;
    const res = await request(buildApp()).patch("/api/events/evt-1/toggle-reg");
    expect(res.status).toBe(404);
  });

  it("flips registration_open from true → false", async () => {
    state.eventRow = { registration_open: true };
    state.eventUpdateReturn = { registration_open: false };
    const res = await request(buildApp()).patch("/api/events/evt-1/toggle-reg");
    expect(res.status).toBe(200);
    expect(res.body.registration_open).toBe(false);
  });

  it("500 when the update errors", async () => {
    state.eventRow = { registration_open: false };
    state.eventUpdateError = { message: "toggle boom" };
    const res = await request(buildApp()).patch("/api/events/evt-1/toggle-reg");
    expect(res.status).toBe(500);
  });
});
