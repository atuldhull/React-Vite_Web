/**
 * Integration tests — userController.js hot handlers.
 *
 * Pre-existing coverage: the pure helpers (getTitleForXP / getNextTitle)
 * have tests/unit/user-controller-helpers.test.js, but the actual HTTP
 * handlers (getProfile, updateProfile, getUserStats, getTestHistory,
 * changePassword) were 0 %, pulling the file's total to 15 % stmts.
 *
 * This file drives every handler through supertest with a mocked
 * supabase + a fake session. Focus:
 *   - getProfile: rich-profile happy path + fallback-when-no-row
 *     (super_admin case) + 401 unauth + 500 on DB error.
 *   - updateProfile: field validation (empty name rejected) + only
 *     requested fields written.
 *   - getUserStats: the rank-within-org + title-auto-sync branch.
 *   - getTestHistory: shape translation.
 *   - changePassword: sign-in verification + admin update flow.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mutable mock state ────────────────────────────────────────────────
const state = {
  studentRow:      null,
  studentErr:      null,
  updateErr:       null,
  stats: {
    total:   0,
    correct: 0,
    above:   0,
  },
  historyRows:     [],
  historyErr:      null,
  lastUpdate:      null,

  // supabase.auth
  signInErr:       null,
  adminUpdateErr:  null,
};

beforeEach(() => {
  state.studentRow     = null;
  state.studentErr     = null;
  state.updateErr      = null;
  state.stats          = { total: 0, correct: 0, above: 0 };
  state.historyRows    = [];
  state.historyErr     = null;
  state.lastUpdate     = null;
  state.signInErr      = null;
  state.adminUpdateErr = null;
  vi.clearAllMocks();
});

// ── Bypass auth middleware ────────────────────────────────────────────
// The handlers pull userId from req.session?.user?.id, so we set the
// session AND the middleware-style fields. Tests opt into "logged out"
// by mutating session to undefined in buildApp.
vi.mock("../../backend/middleware/authMiddleware.js", () => ({
  // Respect the session buildApp placed on the request — if it's empty,
  // match real requireAuth's 401 so the "noSession" tests can observe
  // the unauth path instead of silently bypassing it.
  requireAuth: (req, res, next) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Login required" });
    }
    req.userId   = req.session.user.id;
    req.userRole = req.session.user.role;
    req.orgId    = req.session.user.org_id || null;
    next();
  },
  requireAdmin:      (_req, _res, next) => next(),
  requireTeacher:    (_req, _res, next) => next(),
  requireSuperAdmin: (_req, _res, next) => next(),
  requireSameOrg:    (_req, _res, next) => next(),
  checkFeatureFlag:  () => (_req, _res, next) => next(),
}));

// ── Supabase mock (both req.db.from and supabase.auth) ───────────────
vi.mock("../../backend/config/supabase.js", () => {
  const fakeSupabase = {
    from: (table) => buildChain(table),
    auth: {
      signInWithPassword: async () => ({ error: state.signInErr }),
      admin: { updateUserById: async () => ({ error: state.adminUpdateErr }) },
    },
  };
  function buildChain(table) {
    const chain = {
      _table: table,
      _isCount: false,
      _filters: {},
      select: (_cols, opts) => { if (opts?.count) chain._isCount = true; return chain; },
      update: (payload) => {
        if (table === "students" && Object.keys(payload).length > 1) {
          // Skip trivial last_seen_at writes (they're single-field).
          state.lastUpdate = payload;
        } else if (table === "students" && !("last_seen_at" in payload)) {
          state.lastUpdate = payload;
        }
        return {
          eq: () => ({
            then: (r) => Promise.resolve({ data: null, error: state.updateErr }).then(r),
            catch: () => {},
          }),
        };
      },
      upsert: () => ({ then: (r) => Promise.resolve({ data: null, error: null }).then(r) }),
      eq: (col, val) => { chain._filters[col] = val; return chain; },
      gt: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (table === "students") {
          if (state.studentErr) return { data: null, error: state.studentErr };
          return { data: state.studentRow, error: null };
        }
        return { data: null, error: null };
      },
      single: async () => ({ data: null, error: null }),
      then: (r) => {
        if (chain._isCount && table === "arena_attempts") {
          const n = chain._filters.correct === true ? state.stats.correct : state.stats.total;
          return Promise.resolve({ count: n, error: null }).then(r);
        }
        if (chain._isCount && table === "students") {
          return Promise.resolve({ count: state.stats.above, error: null }).then(r);
        }
        if (table === "test_attempts") {
          return Promise.resolve({ data: state.historyRows, error: state.historyErr }).then(r);
        }
        return Promise.resolve({ data: [], error: null }).then(r);
      },
    };
    return chain;
  }
  return { default: fakeSupabase };
});

const userRoutes = (await import("../../backend/routes/userRoutes.js")).default;
const supabaseMock = (await import("../../backend/config/supabase.js")).default;

function buildApp({ noSession = false, role = "student" } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId   = "u-1";
    req.userRole = role;
    req.orgId    = "org-A";
    req.session  = noSession ? {} : {
      user: {
        id: "u-1",
        email: "student@x.edu",
        name: "Test Student",
        role,
        org_id: "org-A",
        is_active: true,
      },
    };
    req.db = { from: (t) => supabaseMock.from(t), audit: async () => {} };
    next();
  });
  app.use("/api/user", userRoutes);
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

// ════════════════════════════════════════════════════════════
// GET /api/user/profile — getProfile
// ════════════════════════════════════════════════════════════

describe("GET /profile — getProfile", () => {
  it("returns the enriched profile when a student row exists", async () => {
    state.studentRow = {
      name: "Alice", email: "alice@x", xp: 250, title: "Proof Reader",
      role: "student", bio: "I love topology", avatar_letter: "A",
      avatar_emoji: "🧮", avatar_color: "#f00", avatar_config: { bg: "dark" },
    };
    const res = await request(buildApp()).get("/api/user/profile");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Alice");
    // getTitleForXP(250) = "Proof Reader" — title is always computed from
    // XP, not read from the DB column, so a stale row can't over-grant.
    expect(res.body.title).toBe("Proof Reader");
    // level = floor(sqrt(xp/50)) + 1 — level(250) = floor(sqrt(5))+1 = 3
    expect(res.body.level).toBe(3);
    expect(res.body.nextTitle.title).toBe("Theorem Hunter");
    expect(res.body.xpTitles).toBeDefined();
  });

  it("falls back to a minimal session-derived profile when no students row exists (super_admin path)", async () => {
    state.studentRow = null;
    // override the buildApp to a super_admin session
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.session = { user: { id: "sa-1", email: "op@x.edu", name: null, role: "super_admin", is_active: true } };
      req.db = { from: (t) => supabaseMock.from(t), audit: async () => {} };
      next();
    });
    app.use("/api/user", userRoutes);
    const res = await request(app).get("/api/user/profile");
    expect(res.status).toBe(200);
    expect(res.body.minimal).toBe(true);
    expect(res.body.avatar_emoji).toBe("👑"); // crown for super_admin
    expect(res.body.title).toBe("Platform Operator");
    expect(res.body.role).toBe("super_admin");
  });

  it("500 when the students lookup errors", async () => {
    state.studentErr = { message: "profile boom" };
    const res = await request(buildApp()).get("/api/user/profile");
    expect(res.status).toBe(500);
  });

  it("401 when the session has no user", async () => {
    const res = await request(buildApp({ noSession: true })).get("/api/user/profile");
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════
// PATCH /api/user/profile — updateProfile
// ════════════════════════════════════════════════════════════

describe("PATCH /profile — updateProfile", () => {
  it("accepts name + bio + avatar_emoji and persists them", async () => {
    const res = await request(buildApp()).patch("/api/user/profile")
      .send({ name: "  Alice  ", bio: "short bio", avatar_emoji: "🧮", avatar_color: "#f00" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(state.lastUpdate.name).toBe("Alice"); // trimmed
    // avatar_letter is derived from the NEW trimmed name's first letter.
    expect(state.lastUpdate.avatar_letter).toBe("A");
    expect(state.lastUpdate.bio).toBe("short bio");
  });

  it("400 when name is an empty string", async () => {
    const res = await request(buildApp()).patch("/api/user/profile").send({ name: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/empty/i);
  });

  it("caps name length at 60 chars (silent trim, not an error)", async () => {
    const long = "X".repeat(100);
    const res = await request(buildApp()).patch("/api/user/profile").send({ name: long });
    expect(res.status).toBe(200);
    expect(state.lastUpdate.name.length).toBe(60);
  });

  it("500 when the update errors", async () => {
    state.updateErr = { message: "update boom" };
    const res = await request(buildApp()).patch("/api/user/profile").send({ bio: "x" });
    expect(res.status).toBe(500);
  });

  it("401 when session has no user", async () => {
    const res = await request(buildApp({ noSession: true })).patch("/api/user/profile").send({ name: "x" });
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/user/stats — getUserStats
// ════════════════════════════════════════════════════════════

describe("GET /stats — getUserStats", () => {
  it("returns xp / solved / total / accuracy / rank / title tuple", async () => {
    state.studentRow = { xp: 500, title: "Proof Reader", role: "student" };
    state.stats = { total: 40, correct: 30, above: 4 };
    const res = await request(buildApp()).get("/api/user/stats");
    expect(res.status).toBe(200);
    expect(res.body.xp).toBe(500);
    expect(res.body.solved).toBe(30);
    expect(res.body.total).toBe(40);
    expect(res.body.accuracy).toBe(75);
    expect(res.body.rank).toBe(5); // 4 above + 1
    // Title auto-sync: getTitleForXP(500) = Theorem Hunter; the stored
    // title was stale ("Proof Reader") and should be rewritten.
    expect(res.body.title).toBe("Theorem Hunter");
    expect(state.lastUpdate?.title).toBe("Theorem Hunter");
  });

  it("accuracy is 0 when there are no attempts (no divide-by-zero)", async () => {
    state.studentRow = { xp: 0, title: "Axiom Scout", role: "student" };
    state.stats = { total: 0, correct: 0, above: 10 };
    const res = await request(buildApp()).get("/api/user/stats");
    expect(res.status).toBe(200);
    expect(res.body.accuracy).toBe(0);
    expect(res.body.rank).toBe(11); // 10 above + 1
  });

  it("handles missing student row (first-login edge case)", async () => {
    state.studentRow = null;
    state.stats = { total: 0, correct: 0, above: 0 };
    const res = await request(buildApp()).get("/api/user/stats");
    expect(res.status).toBe(200);
    expect(res.body.xp).toBe(0);
    expect(res.body.title).toBe("Axiom Scout");
    expect(res.body.role).toBe("student");
  });

  it("401 when session has no user", async () => {
    const res = await request(buildApp({ noSession: true })).get("/api/user/stats");
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/user/test-history — getTestHistory
// ════════════════════════════════════════════════════════════

describe("GET /test-history — getTestHistory", () => {
  it("translates test_attempts rows into UI-friendly shape with percentage + nested test", async () => {
    state.historyRows = [
      {
        id: "att-1", score: 8, max_score: 10,
        submitted_at: "2026-04-01T12:00:00Z", started_at: "2026-04-01T11:00:00Z",
        scheduled_tests: { title: "Midterm", description: "Ch 1-4", starts_at: "2026-04-01T10:00:00Z", ends_at: "2026-04-01T13:00:00Z" },
      },
    ];
    const res = await request(buildApp()).get("/api/user/test-history");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].percentage).toBe(80);
    expect(res.body[0].test.title).toBe("Midterm");
  });

  it("tolerates a null scheduled_tests fk (deleted test still shows in history)", async () => {
    state.historyRows = [
      { id: "a1", score: 5, max_score: 0, submitted_at: "t", started_at: "t", scheduled_tests: null },
    ];
    const res = await request(buildApp()).get("/api/user/test-history");
    expect(res.status).toBe(200);
    expect(res.body[0].test.title).toBe("Unknown Test");
    expect(res.body[0].percentage).toBe(0); // max_score=0 → no divide-by-zero
  });

  it("500 on query error", async () => {
    state.historyErr = { message: "history boom" };
    const res = await request(buildApp()).get("/api/user/test-history");
    expect(res.status).toBe(500);
  });

  it("401 when session has no user", async () => {
    const res = await request(buildApp({ noSession: true })).get("/api/user/test-history");
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/user/change-password — changePassword
// ════════════════════════════════════════════════════════════

describe("POST /change-password — changePassword", () => {
  it("400 when either password is missing", async () => {
    const r1 = await request(buildApp()).post("/api/user/change-password").send({});
    expect(r1.status).toBe(400);
    const r2 = await request(buildApp()).post("/api/user/change-password").send({ currentPassword: "old" });
    expect(r2.status).toBe(400);
  });

  it("400 when new password is under 8 chars", async () => {
    const res = await request(buildApp()).post("/api/user/change-password")
      .send({ currentPassword: "oldsecret1", newPassword: "short" });
    expect(res.status).toBe(400);
  });

  it("401 when the current password is wrong (sign-in verification fails)", async () => {
    state.signInErr = { message: "invalid" };
    const res = await request(buildApp()).post("/api/user/change-password")
      .send({ currentPassword: "wrong-pass", newPassword: "newsecret123" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/incorrect/i);
  });

  it("500 when the admin update fails", async () => {
    state.adminUpdateErr = { message: "admin boom" };
    const res = await request(buildApp()).post("/api/user/change-password")
      .send({ currentPassword: "oldsecret1", newPassword: "newsecret123" });
    expect(res.status).toBe(500);
  });

  it("200 happy path", async () => {
    const res = await request(buildApp()).post("/api/user/change-password")
      .send({ currentPassword: "oldsecret1", newPassword: "newsecret123" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("401 when session has no user", async () => {
    const res = await request(buildApp({ noSession: true })).post("/api/user/change-password")
      .send({ currentPassword: "x", newPassword: "newsecret123" });
    expect(res.status).toBe(401);
  });
});
