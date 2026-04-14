/**
 * Auth-flow integration tests.
 *
 * These REPLACE the previous static-string-matching tests (which
 * checked for substrings like "req.session.user" inside the source
 * code). That style told us about the literal characters in the file;
 * it told us nothing about behaviour, broke on trivial renames, and
 * would have happily passed a controller that did the right grep-
 * matching strings but the wrong logic.
 *
 * The new tests boot a minimal Express app with a memory session and
 * the real authController / auth middlewares, mock Supabase at the
 * module level with mutable per-test state, and exercise the actual
 * request/response contract with supertest. A regression in the
 * auth flow now shows up as a failing assertion on a real HTTP
 * response, not a string mismatch.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";

// ────────────────────────────────────────────────────────────
// Mock supabase — per-test mutable state controls responses
// ────────────────────────────────────────────────────────────

const state = {
  // supabase.auth.signInWithPassword response
  signIn:   { data: { user: null }, error: null },
  // supabase.from("students")....maybeSingle() response for the LOGIN
  // controller's profile fetch
  student:  { data: null, error: null },
  // Generic pass-through for any other writes we don't care about
  generic:  { data: null, error: null },
};

vi.mock("../../backend/config/supabase.js", () => {
  const builder = () => {
    const chain = {
      select:  () => chain,
      update:  () => chain,
      insert:  () => chain,
      upsert:  () => chain,
      delete:  () => chain,
      eq:      () => chain,
      gt:      () => chain,
      maybeSingle: async () => state.student,
      single:      async () => state.student,
      // awaiting the chain (e.g. after .update().eq()) resolves generic.
      then: (r) => Promise.resolve(state.generic).then(r),
    };
    return chain;
  };
  return {
    default: {
      from: () => builder(),
      auth: {
        signInWithPassword: async () => state.signIn,
        signUp:             async () => ({ data: { user: null }, error: null }),
        resend:             async () => ({ error: null }),
        resetPasswordForEmail: async () => ({ error: null }),
        getUser:            async () => ({ data: { user: null }, error: null }),
        admin:              { updateUserById: async () => ({ error: null }) },
      },
    },
  };
});

// Import AFTER mocks
const authController = (await import("../../backend/controllers/authController.js")).default;
const {
  requireAuth,
  requireAdmin,
  requireTeacher,
  requireSuperAdmin,
  requireSameOrg,
} = await import("../../backend/middleware/authMiddleware.js");

// ────────────────────────────────────────────────────────────
// App factory — minimal, uses memory session
// ────────────────────────────────────────────────────────────

function buildApp(opts = {}) {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: "test-secret",
    resave: false,
    saveUninitialized: false,
  }));

  // Preload a session for tests that simulate an already-logged-in user
  if (opts.presetSession) {
    app.use((req, _res, next) => {
      req.session.user = opts.presetSession;
      next();
    });
  }

  app.post("/api/auth/login",   authController.login);
  app.post("/api/auth/logout",  authController.logout);
  app.get ("/api/auth/session", authController.getSession);

  // Route gated by requireAuth — echoes back the injected req.* props.
  app.get("/api/protected", requireAuth, (req, res) => {
    res.json({ userId: req.userId, userRole: req.userRole, orgId: req.orgId });
  });

  app.get("/api/admin-only",       requireAdmin,      (req, res) => res.json({ role: req.userRole, orgId: req.orgId }));
  app.get("/api/teacher-only",     requireTeacher,    (req, res) => res.json({ role: req.userRole }));
  app.get("/api/super-only",       requireSuperAdmin, (req, res) => res.json({ role: req.userRole }));
  app.get("/api/org/:orgId/thing", requireSameOrg,    (_req, res) => res.json({ ok: true }));
  app.post("/api/scoped",          requireSameOrg,    (_req, res) => res.json({ ok: true }));
  return app;
}

beforeEach(() => {
  state.signIn  = { data: { user: null }, error: null };
  state.student = { data: null, error: null };
  state.generic = { data: null, error: null };
});

// ════════════════════════════════════════════════════════════
// POST /api/auth/login
// ════════════════════════════════════════════════════════════

describe("POST /api/auth/login", () => {
  it("400s when email/password missing", async () => {
    const res = await request(buildApp()).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/);
  });

  it("200s and sets session on happy path; returns role-based redirect", async () => {
    state.signIn = {
      data: { user: { id: "u1", email: "alice@x.co", email_confirmed_at: "2026-01-01T00:00:00Z" } },
      error: null,
    };
    state.student = {
      data: {
        name: "Alice", role: "admin", xp: 10, title: "Champ",
        org_id: "org-A", is_active: true,
        organisations: { id: "org-A", name: "Orghaus", slug: "orghaus", status: "active", plan_name: "pro" },
      },
      error: null,
    };

    const res = await request(buildApp())
      .post("/api/auth/login")
      .send({ email: "alice@x.co", password: "x" });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: "u1", role: "admin", org_id: "org-A", org_name: "Orghaus" });
    // admin → /admin
    expect(res.body.redirectTo).toBe("/admin");
    // session cookie must be set — proves session persistence, not just response shape.
    expect(res.headers["set-cookie"]?.join(";")).toMatch(/connect\.sid/);
  });

  it("401s with EMAIL_NOT_VERIFIED when supabase reports unconfirmed email", async () => {
    state.signIn = {
      data: { user: null },
      error: { message: "Email not confirmed" },
    };
    const res = await request(buildApp())
      .post("/api/auth/login")
      .send({ email: "bob@x.co", password: "x" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("EMAIL_NOT_VERIFIED");
  });

  it("401s with EMAIL_NOT_VERIFIED when user exists but email_confirmed_at is null", async () => {
    state.signIn = {
      data: { user: { id: "u2", email: "bob@x.co", email_confirmed_at: null } },
      error: null,
    };
    const res = await request(buildApp())
      .post("/api/auth/login")
      .send({ email: "bob@x.co", password: "x" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("EMAIL_NOT_VERIFIED");
  });

  it("403s when the user's account is suspended (is_active=false)", async () => {
    state.signIn = {
      data: { user: { id: "u3", email: "c@x.co", email_confirmed_at: "2026-01-01T00:00:00Z" } },
      error: null,
    };
    state.student = {
      data: { role: "student", org_id: "org-A", is_active: false, organisations: { status: "active" } },
      error: null,
    };
    const res = await request(buildApp())
      .post("/api/auth/login")
      .send({ email: "c@x.co", password: "x" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/suspended/i);
  });

  it("403s when the user's organisation is suspended", async () => {
    state.signIn = {
      data: { user: { id: "u4", email: "d@x.co", email_confirmed_at: "2026-01-01T00:00:00Z" } },
      error: null,
    };
    state.student = {
      data: { role: "admin", org_id: "org-Z", is_active: true, organisations: { status: "suspended" } },
      error: null,
    };
    const res = await request(buildApp())
      .post("/api/auth/login")
      .send({ email: "d@x.co", password: "x" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/organisation/i);
  });

  it("401s with a generic message on any other sign-in failure (no info leak)", async () => {
    state.signIn = { data: { user: null }, error: { message: "anything at all" } };
    const res = await request(buildApp())
      .post("/api/auth/login")
      .send({ email: "e@x.co", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
    // MUST NOT echo the underlying supabase message — that could leak info.
    expect(JSON.stringify(res.body)).not.toContain("anything at all");
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/auth/session + logout
// ════════════════════════════════════════════════════════════

describe("session endpoints", () => {
  it("GET /api/auth/session 401s when not logged in", async () => {
    const res = await request(buildApp()).get("/api/auth/session");
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/session returns the session user after login", async () => {
    state.signIn = {
      data: { user: { id: "u1", email: "a@x.co", email_confirmed_at: "2026-01-01T00:00:00Z" } },
      error: null,
    };
    state.student = {
      data: { role: "student", org_id: "org-A", is_active: true, organisations: { status: "active", name: "X" } },
      error: null,
    };

    const agent = request.agent(buildApp());
    await agent.post("/api/auth/login").send({ email: "a@x.co", password: "x" }).expect(200);
    const res = await agent.get("/api/auth/session");
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("u1");
  });

  it("POST /api/auth/logout destroys the session", async () => {
    state.signIn = {
      data: { user: { id: "u1", email: "a@x.co", email_confirmed_at: "2026-01-01T00:00:00Z" } },
      error: null,
    };
    state.student = {
      data: { role: "student", org_id: "org-A", is_active: true, organisations: { status: "active" } },
      error: null,
    };

    const agent = request.agent(buildApp());
    await agent.post("/api/auth/login").send({ email: "a@x.co", password: "x" }).expect(200);
    await agent.post("/api/auth/logout").expect(200);
    // Session is gone — the next /session call must 401.
    await agent.get("/api/auth/session").expect(401);
  });
});

// ════════════════════════════════════════════════════════════
// requireAuth
// ════════════════════════════════════════════════════════════

describe("requireAuth middleware", () => {
  it("401s when no session is present", async () => {
    const res = await request(buildApp()).get("/api/protected");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/login required/i);
  });

  it("passes through and injects userId/userRole/orgId when session is valid", async () => {
    const app = buildApp({
      presetSession: { id: "u9", role: "admin", org_id: "org-A", is_active: true },
    });
    const res = await request(app).get("/api/protected");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: "u9", userRole: "admin", orgId: "org-A" });
  });

  it("403s and destroys session when is_active=false", async () => {
    const app = buildApp({
      presetSession: { id: "u9", role: "student", org_id: "org-A", is_active: false },
    });
    const res = await request(app).get("/api/protected");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/suspended/i);
  });
});

// ════════════════════════════════════════════════════════════
// Role guards
// ════════════════════════════════════════════════════════════

describe("role guards", () => {
  it("requireAdmin: student → 403", async () => {
    const app = buildApp({ presetSession: { id: "u", role: "student", org_id: "org-A", is_active: true } });
    // If the in-session role is 'student', the middleware also calls
    // refreshSession which will hit our mocked student: { data: null }.
    state.student = { data: { role: "student", org_id: "org-A" }, error: null };
    const res = await request(app).get("/api/admin-only");
    expect(res.status).toBe(403);
  });

  it("requireAdmin: admin → 200 with role=admin + orgId from session", async () => {
    const app = buildApp({ presetSession: { id: "u", role: "admin", org_id: "org-A", is_active: true } });
    const res = await request(app).get("/api/admin-only");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ role: "admin", orgId: "org-A" });
  });

  it("requireAdmin: super_admin → 200 with orgId=null (no org scope)", async () => {
    const app = buildApp({ presetSession: { id: "u", role: "super_admin", is_active: true } });
    const res = await request(app).get("/api/admin-only");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ role: "super_admin", orgId: null });
  });

  it("requireTeacher: teacher/admin/super_admin all pass; student gets 403", async () => {
    for (const role of ["teacher", "admin", "super_admin"]) {
      const app = buildApp({ presetSession: { id: "u", role, org_id: "org-A", is_active: true } });
      const res = await request(app).get("/api/teacher-only");
      expect(res.status).toBe(200);
      expect(res.body.role).toBe(role);
    }
    // Negative case.
    state.student = { data: { role: "student" }, error: null };
    const appStu = buildApp({ presetSession: { id: "u", role: "student", org_id: "org-A", is_active: true } });
    const res = await request(appStu).get("/api/teacher-only");
    expect(res.status).toBe(403);
  });

  it("requireSuperAdmin: only super_admin passes", async () => {
    state.student = { data: { role: "admin" }, error: null };
    const appAdm = buildApp({ presetSession: { id: "u", role: "admin", is_active: true } });
    expect((await request(appAdm).get("/api/super-only")).status).toBe(403);

    const appSA  = buildApp({ presetSession: { id: "u", role: "super_admin", is_active: true } });
    expect((await request(appSA).get("/api/super-only")).status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════
// requireSameOrg — cross-org URL/body check
// ════════════════════════════════════════════════════════════

describe("requireSameOrg middleware", () => {
  it("403s when URL :orgId doesn't match user's org_id", async () => {
    const app = buildApp({ presetSession: { id: "u", role: "admin", org_id: "org-A", is_active: true } });
    const res = await request(app).get("/api/org/org-B/thing");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Cross-organisation/i);
  });

  it("passes when URL :orgId matches user's org_id", async () => {
    const app = buildApp({ presetSession: { id: "u", role: "admin", org_id: "org-A", is_active: true } });
    const res = await request(app).get("/api/org/org-A/thing");
    expect(res.status).toBe(200);
  });

  it("super_admin bypasses the check regardless of :orgId", async () => {
    const app = buildApp({ presetSession: { id: "u", role: "super_admin", is_active: true } });
    const res = await request(app).get("/api/org/org-Z/thing");
    expect(res.status).toBe(200);
  });

  it("403s when body.org_id points to a different org than the session", async () => {
    const app = buildApp({ presetSession: { id: "u", role: "admin", org_id: "org-A", is_active: true } });
    const res = await request(app).post("/api/scoped").send({ org_id: "org-X" });
    expect(res.status).toBe(403);
  });

  it("passes when no org_id is specified (tenantMiddleware handles scoping downstream)", async () => {
    const app = buildApp({ presetSession: { id: "u", role: "admin", org_id: "org-A", is_active: true } });
    const res = await request(app).post("/api/scoped").send({});
    expect(res.status).toBe(200);
  });
});
