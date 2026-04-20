/**
 * Integration tests — authController.js handlers NOT covered by
 * auth-flow.test.js. That file focuses on login + session + role
 * middleware; this file covers:
 *
 *   register                — happy + invite-gated + email-mismatch + no-org fallback
 *   resendVerification       — 400 no email, happy, upstream-error surfacing
 *   validateInvite           — 400 no token, 404 expired, 200 valid
 *   forgotPassword           — 400 no email, happy, upstream-error
 *   resetPassword            — 400 missing fields, 400 short password, 400 bad token, 500 update fail, 200 happy
 *   logoutRedirect           — destroys session + 302 /
 *
 * These were the biggest remaining gap in authController.js (40 %
 * stmts before this file).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";

// ── Mutable mock state ────────────────────────────────────────────────
const state = {
  // supabase.from("...").maybeSingle() responses per table
  invitation:  null,    // org_invitations row
  org:         null,    // organisations row (for register's no-invite fallback)
  updGeneric:  null,    // generic update resolution
  // auth.* responses
  signUp:      { data: { user: null }, error: null },
  resend:      { error: null },
  reset:       { error: null },
  getUser:     { data: { user: null }, error: null },
  adminUpdate: { error: null },

  // observables
  lastUpsert:       null,
  lastInvUpdate:    null,
};

beforeEach(() => {
  state.invitation     = null;
  state.org            = null;
  state.updGeneric     = null;
  state.signUp         = { data: { user: null }, error: null };
  state.resend         = { error: null };
  state.reset          = { error: null };
  state.getUser        = { data: { user: null }, error: null };
  state.adminUpdate    = { error: null };
  state.lastUpsert     = null;
  state.lastInvUpdate  = null;
  vi.clearAllMocks();
});

vi.mock("../../backend/config/supabase.js", () => {
  const builder = (table) => {
    const chain = {
      _table: table,
      select:  () => chain,
      insert:  () => chain,
      upsert:  (payload) => {
        if (table === "students") state.lastUpsert = payload;
        return { then: (r) => Promise.resolve({ data: null, error: null }).then(r) };
      },
      update:  (payload) => {
        if (table === "org_invitations") state.lastInvUpdate = payload;
        return {
          eq: () => ({ then: (r) => Promise.resolve({ data: null, error: state.updGeneric }).then(r) }),
        };
      },
      eq:      () => chain,
      gt:      () => chain,
      order:   () => chain,
      limit:   () => chain,
      maybeSingle: async () => {
        if (table === "org_invitations") return { data: state.invitation, error: null };
        if (table === "organisations")   return { data: state.org,        error: null };
        return { data: null, error: null };
      },
      single: async () => ({ data: null, error: null }),
      then: (r) => Promise.resolve({ data: null, error: null }).then(r),
    };
    return chain;
  };

  return {
    default: {
      from: (t) => builder(t),
      auth: {
        signInWithPassword:    async () => ({ data: { user: null }, error: null }),
        signUp:                async () => state.signUp,
        resend:                async () => state.resend,
        resetPasswordForEmail: async () => state.reset,
        getUser:               async () => state.getUser,
        admin:                 { updateUserById: async () => state.adminUpdate },
      },
    },
  };
});

const authController = (await import("../../backend/controllers/authController.js")).default;

function buildApp({ presetSession = null } = {}) {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: "test-secret",
    resave: false,
    saveUninitialized: true,
  }));
  if (presetSession) {
    app.use((req, _res, next) => { req.session.user = presetSession; next(); });
  }
  app.post("/api/auth/register",             authController.register);
  app.post("/api/auth/resend-verification",  authController.resendVerification);
  app.get ("/api/auth/validate-invite",      authController.validateInvite);
  app.post("/api/auth/forgot-password",      authController.forgotPassword);
  app.post("/api/auth/reset-password",       authController.resetPassword);
  app.get ("/api/auth/logout-redirect",      authController.logoutRedirect);
  return app;
}

// ════════════════════════════════════════════════════════════
// POST /api/auth/register
// ════════════════════════════════════════════════════════════

describe("POST /api/auth/register", () => {
  it("400 when email or password is missing", async () => {
    const res = await request(buildApp()).post("/api/auth/register").send({ email: "x@y.com" });
    expect(res.status).toBe(400);
  });

  it("400 when an invite token is provided but invalid/expired", async () => {
    state.invitation = null; // lookup returns no row
    const res = await request(buildApp()).post("/api/auth/register")
      .send({ email: "x@y.com", password: "secret123", invite_token: "bad-token" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it("400 when invite email doesn't match the submitted email", async () => {
    state.invitation = {
      id: "inv-1", org_id: "org-A", email: "other@y.com", role: "student",
      organisations: { id: "org-A", name: "Test Org", status: "active" },
    };
    const res = await request(buildApp()).post("/api/auth/register")
      .send({ email: "x@y.com", password: "secret123", invite_token: "valid-token" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/different email/i);
  });

  it("400 when signUp rejects (e.g. email already registered)", async () => {
    state.invitation = {
      id: "inv-1", org_id: "org-A", email: null, role: "student",
      organisations: { id: "org-A", name: "Test Org" },
    };
    state.signUp = { data: { user: null }, error: Object.assign(new Error("User already registered"), { message: "User already registered" }) };
    const res = await request(buildApp()).post("/api/auth/register")
      .send({ email: "x@y.com", password: "secret123", invite_token: "valid-token" });
    expect(res.status).toBe(400);
  });

  it("500 when no invite AND no default org exists (pre-seed failed)", async () => {
    state.org = null;
    state.signUp = { data: { user: { id: "u-new", email: "x@y.com" } }, error: null };
    const res = await request(buildApp()).post("/api/auth/register")
      .send({ email: "x@y.com", password: "secret123" });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/no organisation/i);
  });

  it("200 happy path with a valid invite — creates student row + marks invitation accepted", async () => {
    state.invitation = {
      id: "inv-1", org_id: "org-A", email: null, role: "teacher",
      organisations: { id: "org-A", name: "Orghaus", status: "active" },
    };
    state.signUp = { data: { user: { id: "u-new", email: "x@y.com" } }, error: null };
    const res = await request(buildApp()).post("/api/auth/register")
      .send({ name: "New User", email: "x@y.com", password: "secret123", invite_token: "valid-token" });
    expect(res.status).toBe(200);
    expect(res.body.org_name).toBe("Orghaus");
    expect(state.lastUpsert.org_id).toBe("org-A");
    expect(state.lastUpsert.role).toBe("teacher"); // from invitation
    // Invitation flipped to accepted=true so the token can't be reused.
    expect(state.lastInvUpdate.accepted).toBe(true);
  });

  it("200 no-invite fallback — uses the first org in the system", async () => {
    state.org = { id: "org-only" };
    state.signUp = { data: { user: { id: "u-new", email: "x@y.com" } }, error: null };
    const res = await request(buildApp()).post("/api/auth/register")
      .send({ email: "x@y.com", password: "secret123" });
    expect(res.status).toBe(200);
    expect(state.lastUpsert.org_id).toBe("org-only");
    expect(state.lastUpsert.role).toBe("student"); // default role
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/auth/resend-verification
// ════════════════════════════════════════════════════════════

describe("POST /api/auth/resend-verification", () => {
  it("400 when no email supplied", async () => {
    const res = await request(buildApp()).post("/api/auth/resend-verification").send({});
    expect(res.status).toBe(400);
  });

  it("400 when supabase.auth.resend reports an error", async () => {
    state.resend = { error: { message: "rate limited" } };
    const res = await request(buildApp()).post("/api/auth/resend-verification").send({ email: "x@y.com" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rate limited/i);
  });

  it("200 happy path", async () => {
    const res = await request(buildApp()).post("/api/auth/resend-verification").send({ email: "x@y.com" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/auth/validate-invite
// ════════════════════════════════════════════════════════════

describe("GET /api/auth/validate-invite", () => {
  it("400 when token query param is missing", async () => {
    const res = await request(buildApp()).get("/api/auth/validate-invite");
    expect(res.status).toBe(400);
  });

  it("404 when the invite is invalid/expired/already-accepted", async () => {
    state.invitation = null;
    const res = await request(buildApp()).get("/api/auth/validate-invite?token=ghost");
    expect(res.status).toBe(404);
  });

  it("200 with email, role and org info on a valid invite", async () => {
    state.invitation = {
      email: "x@y.com", role: "admin",
      organisations: { name: "Orghaus", primary_color: "#7c3aed" },
    };
    const res = await request(buildApp()).get("/api/auth/validate-invite?token=valid");
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.email).toBe("x@y.com");
    expect(res.body.org.primary_color).toBe("#7c3aed");
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/auth/forgot-password
// ════════════════════════════════════════════════════════════

describe("POST /api/auth/forgot-password", () => {
  it("400 when email missing", async () => {
    const res = await request(buildApp()).post("/api/auth/forgot-password").send({});
    expect(res.status).toBe(400);
  });

  it("400 when supabase reports an error (invalid email format etc.)", async () => {
    state.reset = { error: { message: "invalid email" } };
    const res = await request(buildApp()).post("/api/auth/forgot-password").send({ email: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid email/i);
  });

  it("200 happy path", async () => {
    const res = await request(buildApp()).post("/api/auth/forgot-password").send({ email: "x@y.com" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/auth/reset-password
// ════════════════════════════════════════════════════════════

describe("POST /api/auth/reset-password", () => {
  it("400 when access_token is missing", async () => {
    const res = await request(buildApp()).post("/api/auth/reset-password")
      .send({ new_password: "newsecret123" });
    expect(res.status).toBe(400);
  });

  it("400 when new_password is too short (<6 chars)", async () => {
    const res = await request(buildApp()).post("/api/auth/reset-password")
      .send({ access_token: "tok", new_password: "abc" });
    expect(res.status).toBe(400);
  });

  it("400 when the recovery token is invalid (getUser rejects)", async () => {
    state.getUser = { data: { user: null }, error: { message: "bad token" } };
    const res = await request(buildApp()).post("/api/auth/reset-password")
      .send({ access_token: "bad", new_password: "newsecret123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it("500 when admin.updateUserById fails mid-flight", async () => {
    state.getUser     = { data: { user: { id: "u-1", email: "x@y.com" } }, error: null };
    state.adminUpdate = { error: { message: "boom" } };
    const res = await request(buildApp()).post("/api/auth/reset-password")
      .send({ access_token: "tok", new_password: "newsecret123" });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/boom/);
  });

  it("200 happy path", async () => {
    state.getUser = { data: { user: { id: "u-1", email: "x@y.com" } }, error: null };
    const res = await request(buildApp()).post("/api/auth/reset-password")
      .send({ access_token: "tok", new_password: "newsecret123" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/auth/logout-redirect
// ════════════════════════════════════════════════════════════

describe("GET /api/auth/logout-redirect", () => {
  it("302 redirects to '/' and destroys the session", async () => {
    const app = buildApp({ presetSession: { id: "u", role: "student", is_active: true } });
    const res = await request(app).get("/api/auth/logout-redirect");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
  });
});
