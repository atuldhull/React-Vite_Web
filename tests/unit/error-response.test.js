/**
 * Tests for backend/lib/errorResponse.sendInternalError.
 *
 * Two contracts we pin:
 *   1. In production, the response body NEVER carries err.message.
 *      Only { error: "Internal server error", requestId } goes on the
 *      wire. Browser tabs / hostile clients see nothing about the
 *      backend internals.
 *   2. In development, err.message is included under `detail` so
 *      curl-debugging stays useful.
 *
 * The logger is mocked so we can assert the helper still logs the
 * full error regardless of which environment branch is taken.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../backend/config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let sendInternalError;
let logger;
let originalEnv;

beforeEach(async () => {
  vi.resetModules();
  ({ sendInternalError } = await import("../../backend/lib/errorResponse.js"));
  ({ logger } = await import("../../backend/config/logger.js"));
  vi.clearAllMocks();
  originalEnv = process.env.NODE_ENV;
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnv;
});

function makeRes({ headersSent = false } = {}) {
  const res = {
    headersSent,
    statusCode: 200,
    body:       null,
    status(c)   { this.statusCode = c; return this; },
    json(payload) { this.body = payload; return this; },
    // Helper resolves request id + url from res.req.
    req: { id: "req-abc-123", method: "POST", originalUrl: "/api/x/y" },
  };
  return res;
}

describe("sendInternalError — production", () => {
  beforeEach(() => { process.env.NODE_ENV = "production"; });

  it("returns the scrubbed payload — no err.message anywhere", () => {
    const res = makeRes();
    sendInternalError(res, new Error("duplicate key constraint students_email_key"));
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("Internal server error");
    expect(res.body.requestId).toBe("req-abc-123");
    expect(res.body).not.toHaveProperty("detail");
    expect(JSON.stringify(res.body)).not.toMatch(/duplicate key|constraint|students_email_key/i);
  });

  it("still logs the full error with the request id", () => {
    const res = makeRes();
    const err = new Error("real reason");
    sendInternalError(res, err);
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [ctx] = logger.error.mock.calls[0];
    expect(ctx.err).toBe(err);
    expect(ctx.requestId).toBe("req-abc-123");
  });

  it("uses the supplied label in the log when one is given", () => {
    const res = makeRes();
    sendInternalError(res, new Error("x"), "send message");
    expect(logger.error).toHaveBeenCalledWith(expect.any(Object), "send message");
  });

  it("falls back to METHOD URL when no label is given", () => {
    const res = makeRes();
    sendInternalError(res, new Error("x"));
    expect(logger.error).toHaveBeenCalledWith(
      expect.any(Object),
      expect.stringContaining("POST /api/x/y"),
    );
  });
});

describe("sendInternalError — development", () => {
  beforeEach(() => { process.env.NODE_ENV = "development"; });

  it("includes err.message under detail so curl debugging is not blind", () => {
    const res = makeRes();
    sendInternalError(res, new Error("real reason for dev"));
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("Internal server error");
    expect(res.body.detail).toBe("real reason for dev");
  });

  it("stringifies non-Error throws", () => {
    const res = makeRes();
    sendInternalError(res, "plain string");
    expect(res.body.detail).toBe("plain string");
  });
});

describe("sendInternalError — headers already sent", () => {
  beforeEach(() => { process.env.NODE_ENV = "production"; });

  it("does not call res.status / res.json when the response is already streaming", () => {
    // Realistic case: archive.on('error') fires after we've started
    // writing a zip. status()/json() would no-op or throw; the helper
    // skips them. The LOG must still fire so an operator sees the bug.
    const res = makeRes({ headersSent: true });
    const statusSpy = vi.spyOn(res, "status");
    const jsonSpy   = vi.spyOn(res, "json");
    sendInternalError(res, new Error("stream broke"));
    expect(statusSpy).not.toHaveBeenCalled();
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
