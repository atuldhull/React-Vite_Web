/**
 * Tests for backend/middleware/requestId.js.
 *
 * We boot a tiny Express app that mounts JUST the request-id middleware
 * plus a couple of probe routes. This isolates the middleware contract
 * from the rest of the application so a regression here is unambiguous.
 */

import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";

import {
  requestIdMiddleware,
  currentRequestId,
} from "../../backend/middleware/requestId.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildApp() {
  const app = express();
  app.use(requestIdMiddleware);

  // Echoes back what the middleware attached.
  app.get("/probe", (req, res) => {
    res.json({ id: req.id, fromAls: currentRequestId() });
  });

  // Throws so we can verify the error handler can still see req.id.
  app.get("/boom", (_req, _res) => {
    throw new Error("kaboom");
  });
  app.use((err, req, res, _next) => {
    res.status(500).json({ error: err.message, requestId: req.id });
  });

  return app;
}

// ════════════════════════════════════════════════════════════
// ID generation
// ════════════════════════════════════════════════════════════

describe("requestIdMiddleware — id generation", () => {
  it("generates a UUIDv4 when no x-request-id header is present", async () => {
    const res = await request(buildApp()).get("/probe");
    expect(res.status).toBe(200);
    expect(res.body.id).toMatch(UUID_RE);
    // Echoed in the response header too.
    expect(res.headers["x-request-id"]).toBe(res.body.id);
  });

  it("generates a fresh id per request (no leakage across calls)", async () => {
    const app = buildApp();
    const a = await request(app).get("/probe");
    const b = await request(app).get("/probe");
    expect(a.body.id).not.toBe(b.body.id);
  });

  it("AsyncLocalStorage returns the same id as req.id mid-request", async () => {
    const res = await request(buildApp()).get("/probe");
    expect(res.body.fromAls).toBe(res.body.id);
  });
});

// ════════════════════════════════════════════════════════════
// Adopting upstream IDs
// ════════════════════════════════════════════════════════════

describe("requestIdMiddleware — adopting upstream x-request-id", () => {
  it("adopts a clean upstream id verbatim", async () => {
    const upstream = "abc-123_DEF-456";
    const res = await request(buildApp())
      .get("/probe")
      .set("x-request-id", upstream);
    expect(res.body.id).toBe(upstream);
    expect(res.headers["x-request-id"]).toBe(upstream);
  });

  it("strips characters that aren't [A-Za-z0-9_-]", async () => {
    // Note: Node's HTTP client itself rejects CRLF in outgoing headers, so
    // we can't simulate a literal header-injection payload from supertest.
    // But the SAFE_CHARS regex is the same defence regardless of what slips
    // through — exercise it with characters the client *will* transmit but
    // that we still want stripped (dots, slashes, semicolons, equals).
    const res = await request(buildApp())
      .get("/probe")
      .set("x-request-id", "abc.def/ghi;jkl=mno");
    expect(res.body.id).toBe("abcdefghijklmno");
    expect(res.headers["x-request-id"]).toBe("abcdefghijklmno");
  });

  it("caps absurdly long upstream ids to a sane length", async () => {
    const huge = "a".repeat(10_000);
    const res = await request(buildApp())
      .get("/probe")
      .set("x-request-id", huge);
    expect(res.body.id.length).toBeLessThanOrEqual(128);
    expect(res.body.id).toMatch(/^a+$/);
  });

  it("falls through to a fresh UUID when upstream id is pure garbage", async () => {
    const res = await request(buildApp())
      .get("/probe")
      .set("x-request-id", "!!!@@@###"); // every char gets stripped
    expect(res.body.id).toMatch(UUID_RE);
  });
});

// ════════════════════════════════════════════════════════════
// Error handler integration
// ════════════════════════════════════════════════════════════

describe("requestIdMiddleware — error path", () => {
  it("error handler can still access req.id when a downstream route throws", async () => {
    const res = await request(buildApp()).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body.requestId).toMatch(UUID_RE);
    expect(res.headers["x-request-id"]).toBe(res.body.requestId);
  });
});

// ════════════════════════════════════════════════════════════
// Outside an HTTP request
// ════════════════════════════════════════════════════════════

describe("currentRequestId() outside a request", () => {
  it("returns undefined when called with no active ALS context", () => {
    // Direct call, no middleware in scope.
    expect(currentRequestId()).toBeUndefined();
  });
});
