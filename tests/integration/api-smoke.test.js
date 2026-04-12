/**
 * API Smoke Tests — Real HTTP integration tests using supertest.
 *
 * These tests boot a minimal Express app (no socket.io, no port binding)
 * and hit real HTTP endpoints with supertest. Supabase is mocked at the
 * module level so no real DB connection is required.
 */

import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

// ── Mock supabase BEFORE any route/controller imports that import it ──
// config/supabase.js throws if SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are missing,
// so we intercept the entire module.
vi.mock("../../backend/config/supabase.js", () => {
  const buildQuery = () => {
    const q = {
      select: () => q,
      insert: () => q,
      update: () => q,
      upsert: () => q,
      delete: () => q,
      eq:     () => q,
      neq:    () => q,
      gt:     () => q,
      gte:    () => q,
      lt:     () => q,
      lte:    () => q,
      in:     () => q,
      is:     () => q,
      order:  () => q,
      limit:  () => q,
      single:     () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then:   (fn) => Promise.resolve({ data: [], error: null }).then(fn),
    };
    return q;
  };

  const mockSupabase = {
    from: () => buildQuery(),
    auth: {
      signUp:     () => Promise.resolve({ data: { user: null }, error: null }),
      signInWithPassword: () =>
        Promise.resolve({ data: { session: null, user: null }, error: { message: "Invalid login credentials" } }),
    },
  };

  return { default: mockSupabase };
});

// ── Now import routes (they'll get the mocked supabase) ──
import botRoutes  from "../../backend/routes/botRoutes.js";
import authRoutes from "../../backend/routes/authRoutes.js";
import eventRoutes from "../../backend/routes/eventRoutes.js";
import sessionMiddleware from "../../backend/middleware/sessionConfig.js";

// ── Build a minimal test Express app ──
function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(sessionMiddleware);

  app.use("/api/bot",    botRoutes);
  app.use("/api/auth",   authRoutes);
  app.use("/api/events", eventRoutes);

  // 404 catch-all
  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}

// ════════════════════════════════════════════════════════════
// 1. BOT — auth guard
// ════════════════════════════════════════════════════════════

describe("POST /api/bot/chat — auth guard", () => {
  it("returns 401 when request has no session (regression for requireAuth fix)", async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post("/api/bot/chat")
      .send({ messages: [{ role: "user", content: "hello" }] });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  it("returns 401 even when a valid messages payload is sent without auth", async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post("/api/bot/chat")
      .set("Content-Type", "application/json")
      .send({ messages: [{ role: "user", content: "What is d/dx of x^2?" }] });

    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════
// 2. EVENTS/SETTINGS — public endpoint
// ════════════════════════════════════════════════════════════

describe("GET /api/events/settings — public endpoint", () => {
  it("returns 200 with a settings object (empty if DB returns no rows)", async () => {
    const app = buildTestApp();
    const res = await request(app).get("/api/events/settings");

    // getSiteSettings returns an object (may be empty {}), never 4xx/5xx for a working DB mock
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe("object");
  });

  it("does not require authentication", async () => {
    const app = buildTestApp();
    // No cookies/session set
    const res = await request(app).get("/api/events/settings");
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ════════════════════════════════════════════════════════════
// 3. AUTH — input validation
// ════════════════════════════════════════════════════════════

describe("POST /api/auth/login — input validation", () => {
  it("returns 400 when password is missing", async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com" }); // no password

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  it("returns 400 when email is missing", async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ password: "somepassword" }); // no email

    expect(res.status).toBe(400);
  });

  it("returns 400 when body is completely empty", async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post("/api/auth/login")
      .send({});

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/register — input validation", () => {
  it("returns 400 when email is missing", async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post("/api/auth/register")
      .send({ password: "secret123" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "test@example.com" });

    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════
// 4. SESSION — /api/auth/me
// ════════════════════════════════════════════════════════════

describe("GET /api/auth/me — session check", () => {
  it("returns loggedIn: false when no session exists", async () => {
    const app = buildTestApp();
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ loggedIn: false });
  });
});

// ════════════════════════════════════════════════════════════
// 5. 404 fallthrough
// ════════════════════════════════════════════════════════════

describe("Route 404 fallthrough", () => {
  it("GET /api/does-not-exist returns 404", async () => {
    const app = buildTestApp();
    const res = await request(app).get("/api/does-not-exist");

    expect(res.status).toBe(404);
  });

  it("POST /api/totally/unknown/path returns 404", async () => {
    const app = buildTestApp();
    const res = await request(app).post("/api/totally/unknown/path").send({});

    expect(res.status).toBe(404);
  });
});
