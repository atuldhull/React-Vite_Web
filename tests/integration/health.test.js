/**
 * Health + readiness endpoint tests.
 *
 * Boots a minimal Express app with the health routes mounted (no
 * Supabase, no full server) and asserts the contract documented in
 * controllers/healthController.js.
 *
 * Supabase is mocked at module-load so the readiness probe can be
 * tested against fake "DB up" / "DB down" / "row error" scenarios
 * without touching a real database.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mutable mock state — flipped per test to simulate Supabase health ──
const supabaseState = {
  // What the chained .head:true count call resolves to.
  // Default: healthy, zero rows in students.
  studentsResult: { count: 0, error: null },
};

vi.mock("../../backend/config/supabase.js", () => {
  const buildQuery = () => ({
    select: () => ({
      // The readiness probe calls .from("students").select("*", {count:'exact', head:true})
      // and awaits the chain. Returning a then-able lets `await` resolve to our stubbed result.
      then: (resolve) => Promise.resolve(supabaseState.studentsResult).then(resolve),
      eq: () => ({ then: (r) => Promise.resolve(supabaseState.studentsResult).then(r) }),
    }),
  });
  return { default: { from: () => buildQuery() } };
});

// Import AFTER mocks
const healthRoutes = (await import("../../backend/routes/healthRoutes.js")).default;

function buildApp() {
  const app = express();
  app.use("/api", healthRoutes);
  return app;
}

beforeEach(() => {
  // Default each test back to the healthy baseline.
  supabaseState.studentsResult = { count: 0, error: null };
  // Restore env between tests; some tests scrub these to prove the probe catches it.
  process.env.SUPABASE_URL              = process.env.SUPABASE_URL              || "http://test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-key";
  process.env.SESSION_SECRET            = process.env.SESSION_SECRET            || "test-secret";
});

// ════════════════════════════════════════════════════════════
// /api/health — liveness
// ════════════════════════════════════════════════════════════

describe("GET /api/health", () => {
  it("returns 200 with status:'ok' and an uptime value", async () => {
    const res = await request(buildApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptimeSec).toBe("number");
    expect(res.body.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(typeof res.body.startedAt).toBe("string");
  });

  it("does NOT touch Supabase (proves it's pure liveness)", async () => {
    // Make Supabase reject — health should still pass since it shouldn't be called.
    supabaseState.studentsResult = { count: null, error: { message: "DB exploded" } };
    const res = await request(buildApp()).get("/api/health");
    expect(res.status).toBe(200);
  });

  it("never leaks the env-var values themselves", async () => {
    const res = await request(buildApp()).get("/api/health");
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY);
    expect(body).not.toContain(process.env.SESSION_SECRET);
  });
});

// ════════════════════════════════════════════════════════════
// /api/ready — readiness
// ════════════════════════════════════════════════════════════

describe("GET /api/ready", () => {
  it("returns 200 + 'ready' when Supabase responds and env is complete", async () => {
    const res = await request(buildApp()).get("/api/ready");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.checks.env.ok).toBe(true);
    expect(res.body.checks.supabase.ok).toBe(true);
  });

  it("returns 503 when a critical env var is missing", async () => {
    delete process.env.SESSION_SECRET;
    const res = await request(buildApp()).get("/api/ready");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("not_ready");
    expect(res.body.checks.env.ok).toBe(false);
    expect(res.body.checks.env.missing).toContain("SESSION_SECRET");
  });

  it("returns 503 + supabase failure reason when the DB returns an error", async () => {
    supabaseState.studentsResult = { count: null, error: { message: "permission denied" } };
    const res = await request(buildApp()).get("/api/ready");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("not_ready");
    expect(res.body.checks.supabase.ok).toBe(false);
    expect(res.body.checks.supabase.reason).toMatch(/permission denied/);
  });

  it("never leaks env var VALUES — only the names of missing ones", async () => {
    delete process.env.SESSION_SECRET;
    const res = await request(buildApp()).get("/api/ready");
    const body = JSON.stringify(res.body);
    // Names of missing keys are fine and useful for operators.
    expect(body).toContain("SESSION_SECRET");
    // But the actual values of any env var must never appear.
    expect(body).not.toContain(process.env.SUPABASE_URL);
    expect(body).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY);
  });
});
