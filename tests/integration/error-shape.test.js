/**
 * Tests for the error-response shim (middleware/errorShape.js).
 *
 * Three contracts to enforce:
 *   1. Error responses (anything with `error` or `message`) get a
 *      `requestId` added automatically, so a user pasting "it said
 *      Invalid email or password" gives us a correlation id.
 *   2. Success responses are NOT decorated. The decoration is purely
 *      for surfacing the request id alongside error text; adding it
 *      to every successful payload would needlessly bulk up healthy
 *      traffic and break clients that hash response bodies.
 *   3. If a caller (e.g. the validation middleware) has already set
 *      requestId, the shim respects that — it doesn't overwrite.
 */

import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";

import { requestIdMiddleware } from "../../backend/middleware/requestId.js";
import { responseShapeMiddleware } from "../../backend/middleware/errorShape.js";

function buildApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(responseShapeMiddleware);

  // Error-style endpoints exercising different shapes.
  app.get("/error-string",  (_req, res) => res.status(400).json({ error: "bad thing" }));
  app.get("/error-object",  (_req, res) => res.status(500).json({ error: { code: "BOOM", details: "x" } }));
  app.get("/message-style", (_req, res) => res.status(401).json({ message: "not logged in" }));
  app.get("/forbidden",     (_req, res) => res.status(403).json({ error: "nope" }));
  app.get("/notfound",      (_req, res) => res.status(404).json({ error: "missing" }));
  app.get("/conflict",      (_req, res) => res.status(409).json({ error: "exists" }));
  app.get("/ratelimit",     (_req, res) => res.status(429).json({ error: "slow down" }));
  app.get("/internal",      (_req, res) => res.status(500).json({ error: "boom" }));
  app.get("/teapot",        (_req, res) => res.status(418).json({ error: "earl grey" })); // status NOT in CODE_BY_STATUS
  app.get("/preserved",     (_req, res) => res.status(400).json({
    error:     "Validation failed",
    requestId: "caller-set-this",
    code:      "VALIDATION_FAILED",
    issues:    [],
  }));

  // Success-style endpoints.
  app.get("/ok",          (_req, res) => res.json({ ok: true, value: 42 }));
  app.get("/ok-array",    (_req, res) => res.json([1, 2, 3]));
  app.get("/ok-mentions-error", (_req, res) =>
    res.json({ ok: true, error_rate: 0.01 }));  // non-error use of the word

  return app;
}

describe("errorShape — adds requestId to error responses", () => {
  it("adds requestId when body has { error: 'string' }", async () => {
    const res = await request(buildApp()).get("/error-string");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("bad thing");
    expect(typeof res.body.requestId).toBe("string");
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
  });

  it("adds requestId when error is an object (arbitrary error shape)", async () => {
    const res = await request(buildApp()).get("/error-object");
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: "BOOM", details: "x" });
    expect(typeof res.body.requestId).toBe("string");
  });

  it("also decorates `message`-style error bodies (historic shape)", async () => {
    const res = await request(buildApp()).get("/message-style");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("not logged in");
    expect(typeof res.body.requestId).toBe("string");
  });
});

describe("errorShape — preserves caller-provided requestId", () => {
  it("does NOT overwrite a requestId already in the body", async () => {
    const res = await request(buildApp()).get("/preserved");
    expect(res.body.requestId).toBe("caller-set-this");
  });

  it("does NOT overwrite a code already in the body (controller wins over default)", async () => {
    // The shim's status-derived default would be "BAD_REQUEST" for a
    // 400 — but the controller said "VALIDATION_FAILED" explicitly.
    // Caller's intent wins.
    const res = await request(buildApp()).get("/preserved");
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });
});

describe("errorShape — derives `code` from HTTP status when not provided", () => {
  const cases = [
    [400, "BAD_REQUEST",        "/error-string"],
    [401, "UNAUTHENTICATED",    "/message-style"],
    [403, "FORBIDDEN",          "/forbidden"],
    [404, "NOT_FOUND",          "/notfound"],
    [409, "CONFLICT",           "/conflict"],
    [429, "RATE_LIMITED",       "/ratelimit"],
    [500, "INTERNAL",           "/internal"],
  ];

  for (const [status, code, path] of cases) {
    it(`${status} → code: "${code}"`, async () => {
      const res = await request(buildApp()).get(path);
      expect(res.status).toBe(status);
      expect(res.body.code).toBe(code);
    });
  }

  it("status not in the CODE_BY_STATUS map → no code field added", async () => {
    // 418 is intentionally not in the table — no default to assume.
    // Caller can still set one explicitly if they want.
    const res = await request(buildApp()).get("/teapot");
    expect(res.status).toBe(418);
    expect("code" in res.body).toBe(false);
    // requestId still gets added — that's status-independent.
    expect(typeof res.body.requestId).toBe("string");
  });
});

describe("errorShape — success responses untouched", () => {
  it("leaves plain success objects alone", async () => {
    const res = await request(buildApp()).get("/ok");
    expect(res.body).toEqual({ ok: true, value: 42 });
    expect("requestId" in res.body).toBe(false);
  });

  it("leaves arrays alone (would break clients expecting a list)", async () => {
    const res = await request(buildApp()).get("/ok-array");
    expect(res.body).toEqual([1, 2, 3]);
  });

  it("doesn't false-positive on unrelated `error_rate`-style keys", async () => {
    const res = await request(buildApp()).get("/ok-mentions-error");
    expect(res.body).toEqual({ ok: true, error_rate: 0.01 });
    expect("requestId" in res.body).toBe(false);
  });
});
