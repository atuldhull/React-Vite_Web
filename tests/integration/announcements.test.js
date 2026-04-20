/**
 * Integration tests — announcementController.js (was 0 % in coverage gate).
 *
 * All three handlers are wrapped by catchAsync, so the error-path
 * branches throw and land on the global error handler — we don't
 * assert 500 shapes here beyond "not a 2xx".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const state = {
  list:      [],
  listError: null,
  insertReturn: null,
  insertError:  null,
  lastInsert:   null,
  lastUpdate:   null,
};

beforeEach(() => {
  state.list         = [];
  state.listError    = null;
  state.insertReturn = null;
  state.insertError  = null;
  state.lastInsert   = null;
  state.lastUpdate   = null;
  vi.clearAllMocks();
});

// Pass-through middleware — the session is seeded by buildApp so the
// handler's created_by / org_id reads stay deterministic.
vi.mock("../../backend/middleware/authMiddleware.js", () => ({
  requireAuth:       (_req, _res, next) => next(),
  requireTeacher:    (_req, _res, next) => next(),
  requireAdmin:      (_req, _res, next) => next(),
  requireSuperAdmin: (_req, _res, next) => next(),
  requireSameOrg:    (_req, _res, next) => next(),
  checkFeatureFlag:  () => (_req, _res, next) => next(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      const chain = {
        select: () => chain,
        insert: (payload) => {
          if (table === "announcements") state.lastInsert = payload;
          return {
            select: () => ({
              single: async () => {
                if (state.insertError) return { data: null, error: state.insertError };
                return { data: state.insertReturn ?? { id: "ann-new", ...payload }, error: null };
              },
            }),
          };
        },
        update: (payload) => {
          if (table === "announcements") state.lastUpdate = payload;
          return {
            eq: () => ({
              then: (r) => Promise.resolve({ data: null, error: null }).then(r),
              catch: () => {},
            }),
          };
        },
        eq: () => chain,
        or: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (r) => Promise.resolve({ data: state.list, error: state.listError }).then(r),
      };
      return chain;
    },
  }),
}));

const routes = (await import("../../backend/routes/announcementRoutes.js")).default;
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient();

function buildApp(role = "student") {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = "u-1"; req.userRole = role; req.orgId = "org-A";
    req.session = { user: { id: "u-1", role, org_id: "org-A", is_active: true } };
    req.db = { from: (t) => sb.from(t), audit: async () => {} };
    next();
  });
  app.use("/api/announcements", routes);
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

describe("GET /api/announcements — getAnnouncements", () => {
  it("returns active announcements for the caller's role", async () => {
    state.list = [
      { id: "a1", title: "Hello",  body: "body",  is_active: true, target_role: "all",     created_at: "t1" },
      { id: "a2", title: "Teacher news", body: "...",  is_active: true, target_role: "teacher", created_at: "t2" },
    ];
    const res = await request(buildApp("student")).get("/api/announcements");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("returns [] when no announcements match", async () => {
    state.list = [];
    const res = await request(buildApp("student")).get("/api/announcements");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("POST /api/announcements — createAnnouncement", () => {
  it("400 (validator) when title is missing", async () => {
    const res = await request(buildApp("teacher"))
      .post("/api/announcements").send({ body: "b" });
    expect(res.status).toBe(400);
  });

  it("201 happy path — inserts with created_by from session", async () => {
    const res = await request(buildApp("teacher"))
      .post("/api/announcements").send({ title: "Hi", body: "All good", target_role: "all" });
    expect(res.status).toBe(201);
    expect(state.lastInsert.created_by).toBe("u-1");
    expect(state.lastInsert.is_active).toBe(true);
  });

  it("defaults target_role to 'all' when omitted", async () => {
    const res = await request(buildApp("teacher"))
      .post("/api/announcements").send({ title: "T", body: "B" });
    expect(res.status).toBe(201);
    expect(state.lastInsert.target_role).toBe("all");
  });
});

describe("DELETE /api/announcements/:id — deleteAnnouncement", () => {
  it("soft-deletes by flipping is_active=false", async () => {
    const res = await request(buildApp("teacher")).delete("/api/announcements/ann-1");
    expect(res.status).toBe(200);
    expect(state.lastUpdate.is_active).toBe(false);
  });
});
