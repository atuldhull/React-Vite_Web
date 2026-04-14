/**
 * Tests for backend/middleware/requestLogger.js — the per-request
 * structured logger that fires on res.on("finish").
 *
 * Contract:
 *   - Exactly ONE log line per non-skipped request, at end-of-cycle.
 *   - Fields: method, url, status, latencyMs, userId, orgId,
 *     plus requestId (auto-attached by the logger's ALS mixin).
 *   - Skipped paths (/api/health, /api/ready) emit NOTHING — their
 *     traffic volume from uptime monitors would drown real signal.
 *   - Status reflects the FINAL status, even if a controller flips
 *     it late (e.g. catches an error and returns 500).
 *   - latencyMs is non-negative and represents the actual round-trip.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

import { requestIdMiddleware } from "../../backend/middleware/requestId.js";
import { requestLoggerMiddleware } from "../../backend/middleware/requestLogger.js";
import { logger } from "../../backend/config/logger.js";

let infoSpy;

beforeEach(() => {
  infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
});

afterEach(() => {
  infoSpy.mockRestore();
});

function buildApp({ presetUser, presetOrg } = {}) {
  const app = express();
  app.use(requestIdMiddleware);
  // Stub session-style fields so we can assert userId/orgId pickup
  // without booting the whole session middleware stack.
  app.use((req, _res, next) => {
    if (presetUser !== undefined) req.userId = presetUser;
    if (presetOrg  !== undefined) req.orgId  = presetOrg;
    next();
  });
  app.use(requestLoggerMiddleware);

  app.get("/api/echo",   (_req, res) => res.json({ ok: true }));
  app.post("/api/login", (_req, res) => res.status(401).json({ error: "nope" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/ready",  (_req, res) => res.json({ ok: true }));
  app.get("/api/late-status", (_req, res) => {
    // Set status late — the log line should still capture 500, not 200.
    res.status(500);
    res.json({ error: "boom" });
  });

  return app;
}

describe("requestLoggerMiddleware — happy path", () => {
  it("emits exactly one log line per request with the documented fields", async () => {
    await request(buildApp({ presetUser: "u1", presetOrg: "org-A" }))
      .get("/api/echo");
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const [fields, msg] = infoSpy.mock.calls[0];
    expect(msg).toBe("request");
    expect(fields.method).toBe("GET");
    expect(fields.url).toBe("/api/echo");
    expect(fields.status).toBe(200);
    expect(typeof fields.latencyMs).toBe("number");
    expect(fields.latencyMs).toBeGreaterThanOrEqual(0);
    expect(fields.userId).toBe("u1");
    expect(fields.orgId).toBe("org-A");
  });

  it("captures the final status (not an early 200 default)", async () => {
    await request(buildApp()).post("/api/login").send({});
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0][0].status).toBe(401);
  });

  it("captures status set LATE in the handler (not the default 200)", async () => {
    await request(buildApp()).get("/api/late-status");
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0][0].status).toBe(500);
  });
});

describe("requestLoggerMiddleware — anonymous callers", () => {
  it("logs userId=null and orgId=null when there's no session", async () => {
    await request(buildApp()).get("/api/echo");
    const [fields] = infoSpy.mock.calls[0];
    expect(fields.userId).toBeNull();
    expect(fields.orgId).toBeNull();
  });
});

describe("requestLoggerMiddleware — skip list", () => {
  it("/api/health emits NO log line (uptime monitor noise)", async () => {
    await request(buildApp()).get("/api/health");
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("/api/ready emits NO log line", async () => {
    await request(buildApp()).get("/api/ready");
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("query strings on health are still skipped", async () => {
    await request(buildApp()).get("/api/health?ping=1");
    expect(infoSpy).not.toHaveBeenCalled();
  });
});
