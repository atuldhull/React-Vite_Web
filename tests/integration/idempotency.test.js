/**
 * Tests for backend/middleware/idempotency.js.
 *
 * Five contracts:
 *   1. No `Idempotency-Key` header → middleware passes through;
 *      handler runs every time. (Backwards compatibility — callers
 *      that don't opt in keep the previous behaviour.)
 *   2. With a key, the FIRST request runs the handler + caches the
 *      response.
 *   3. With the SAME key, the SECOND request returns the cached
 *      response WITHOUT re-running the handler. Status + body match
 *      the first call exactly.
 *   4. Cached 4xx is replayed (404 stays a 404 on retry — same
 *      answer, instantly).
 *   5. 5xx is NOT cached (transient errors should be retryable
 *      against a fresh handler invocation).
 *   6. Header without orgId (pre-session route) → middleware passes
 *      through (org-scoped cache requires a tenant).
 *   7. Bad header (too long / too short) → 400.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// In-memory mock supabase that simulates the idempotency_keys table.
// Per-test reset.
const cache = new Map();   // key: `${key}|${scope}|${orgId}` → { status_code, response_body }

vi.mock("../../backend/config/supabase.js", () => ({
  default: {
    from: (table) => {
      if (table !== "idempotency_keys") {
        // Other tables aren't relevant here.
        return {
          select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
          insert: () => ({ then: (r) => Promise.resolve({ data: null, error: null }).then(r) }),
        };
      }
      // For idempotency_keys: chainable .eq().eq().eq().maybeSingle()
      // builds up a lookup key, then returns from the in-memory cache.
      const buildLookup = () => {
        const filters = {};
        const chain = {
          select: () => chain,
          eq: (col, val) => { filters[col] = val; return chain; },
          maybeSingle: async () => {
            const k = `${filters.key}|${filters.scope}|${filters.org_id}`;
            return { data: cache.get(k) || null, error: null };
          },
        };
        return chain;
      };
      return {
        select: () => buildLookup(),
        insert: (row) => ({
          then: (resolve) => {
            const k = `${row.key}|${row.scope}|${row.org_id}`;
            cache.set(k, { status_code: row.status_code, response_body: row.response_body });
            return Promise.resolve({ data: row, error: null }).then(resolve);
          },
        }),
      };
    },
  },
}));

const { idempotencyMiddleware } = await import("../../backend/middleware/idempotency.js");

beforeEach(() => {
  cache.clear();
});

function buildApp(opts = {}) {
  // NB: don't use destructuring default for orgId — `{ orgId: undefined }`
  // would silently re-apply the default. We want to be able to call
  // `buildApp({ orgId: undefined })` to test the no-org pass-through.
  const orgId = "orgId" in opts ? opts.orgId : "org-A";
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.orgId = orgId; next(); });

  // Track how many times the handler runs.
  const handler = vi.fn((req, res) => {
    res.status(200).json({ ok: true, n: handler.mock.calls.length });
  });
  app.post("/api/payment/create-order",
    idempotencyMiddleware(),
    handler,
  );

  // Endpoint that always errors (for the 5xx-no-cache test).
  const erroringHandler = vi.fn((req, res) => {
    res.status(500).json({ error: "boom" });
  });
  app.post("/api/payment/error",
    idempotencyMiddleware(),
    erroringHandler,
  );

  // Endpoint that returns a stable 4xx (for the cache-4xx test).
  const fourFour = vi.fn((req, res) => {
    res.status(404).json({ error: "missing" });
  });
  app.post("/api/payment/missing",
    idempotencyMiddleware(),
    fourFour,
  );

  return { app, handler, erroringHandler, fourFour };
}

// ════════════════════════════════════════════════════════════
// No header — pass-through
// ════════════════════════════════════════════════════════════

describe("idempotencyMiddleware — no header", () => {
  it("passes through; handler runs on every call", async () => {
    const { app, handler } = buildApp();
    await request(app).post("/api/payment/create-order").send({});
    await request(app).post("/api/payment/create-order").send({});
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

// ════════════════════════════════════════════════════════════
// With header — first call runs, second is cached
// ════════════════════════════════════════════════════════════

describe("idempotencyMiddleware — with header", () => {
  it("first call runs the handler + caches; second call is replayed", async () => {
    const { app, handler } = buildApp();
    const key = "client-key-12345678";

    const r1 = await request(app)
      .post("/api/payment/create-order")
      .set("Idempotency-Key", key)
      .send({});
    expect(r1.status).toBe(200);
    expect(r1.body.n).toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);

    // res.on("finish") fires asynchronously — give the cache write
    // a tick to complete.
    await new Promise(r => setTimeout(r, 10));

    const r2 = await request(app)
      .post("/api/payment/create-order")
      .set("Idempotency-Key", key)
      .send({});
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual(r1.body);   // same body — n is still 1
    // Handler did NOT run again.
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("DIFFERENT keys → handler runs both times (cache is per-key)", async () => {
    const { app, handler } = buildApp();
    await request(app).post("/api/payment/create-order").set("Idempotency-Key", "key-aaaaaaaa").send({});
    await new Promise(r => setTimeout(r, 10));
    await request(app).post("/api/payment/create-order").set("Idempotency-Key", "key-bbbbbbbb").send({});
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("4xx response IS cached and replayed", async () => {
    const { app, fourFour } = buildApp();
    const key = "key-44444444";
    const r1 = await request(app).post("/api/payment/missing").set("Idempotency-Key", key).send({});
    expect(r1.status).toBe(404);
    await new Promise(r => setTimeout(r, 10));

    const r2 = await request(app).post("/api/payment/missing").set("Idempotency-Key", key).send({});
    expect(r2.status).toBe(404);
    expect(r2.body).toEqual(r1.body);
    // Handler ran ONCE (the second 404 came from cache).
    expect(fourFour).toHaveBeenCalledTimes(1);
  });

  it("5xx response is NOT cached (transient — retry should hit a fresh handler)", async () => {
    const { app, erroringHandler } = buildApp();
    const key = "key-55555555";
    await request(app).post("/api/payment/error").set("Idempotency-Key", key).send({});
    await new Promise(r => setTimeout(r, 10));
    await request(app).post("/api/payment/error").set("Idempotency-Key", key).send({});
    // Both calls ran the handler — the 500 was NOT cached.
    expect(erroringHandler).toHaveBeenCalledTimes(2);
  });
});

// ════════════════════════════════════════════════════════════
// Edge cases
// ════════════════════════════════════════════════════════════

describe("idempotencyMiddleware — edge cases", () => {
  it("no orgId on request (pre-session route) → passes through", async () => {
    const { app, handler } = buildApp({ orgId: undefined });
    await request(app).post("/api/payment/create-order").set("Idempotency-Key", "key-12345678").send({});
    await request(app).post("/api/payment/create-order").set("Idempotency-Key", "key-12345678").send({});
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("key shorter than 8 chars → 400", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post("/api/payment/create-order")
      .set("Idempotency-Key", "short")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Idempotency-Key/);
  });

  it("key longer than 200 chars → 400", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post("/api/payment/create-order")
      .set("Idempotency-Key", "x".repeat(201))
      .send({});
    expect(res.status).toBe(400);
  });
});
