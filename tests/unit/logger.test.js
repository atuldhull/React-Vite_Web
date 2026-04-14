/**
 * Tests for backend/config/logger.js.
 *
 * The thing we MOST care about: log lines emitted from inside an
 * HTTP request automatically pick up that request's id from the
 * AsyncLocalStorage store set by requestIdMiddleware. That's the
 * whole point of the structured logger — without it, log lines from
 * different concurrent requests interleave in stdout and become
 * impossible to attribute.
 *
 * We capture pino's output by passing a custom destination stream so
 * we don't have to read stdout in the test runner.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import pino from "pino";

// We import the live currentRequestId implementation so the tests
// exercise the real ALS plumbing, not a stub.
import { requestIdMiddleware, currentRequestId } from "../../backend/middleware/requestId.js";

// ════════════════════════════════════════════════════════════
// Helper: build a logger instance with the same mixin the real
// module uses, but writing into an in-memory buffer.
// ════════════════════════════════════════════════════════════

function makeCapturingLogger() {
  const lines = [];
  const stream = {
    write(chunk) { lines.push(chunk); },
  };
  const log = pino(
    {
      level: "trace",
      mixin() {
        const id = currentRequestId();
        return id ? { requestId: id } : {};
      },
    },
    stream
  );
  return { log, lines };
}

function parseLines(lines) {
  return lines.map((l) => JSON.parse(l));
}

// ════════════════════════════════════════════════════════════
// Mixin behaviour
// ════════════════════════════════════════════════════════════

describe("logger mixin — request-id propagation", () => {
  it("attaches requestId when called inside the ALS scope", () => {
    const { log, lines } = makeCapturingLogger();
    const req = { headers: {} };
    const res = { setHeader: vi.fn() };

    requestIdMiddleware(req, res, () => {
      log.info("inside request");
    });

    const events = parseLines(lines);
    expect(events).toHaveLength(1);
    expect(events[0].msg).toBe("inside request");
    expect(events[0].requestId).toBe(req.id);
    expect(typeof req.id).toBe("string");
    expect(req.id.length).toBeGreaterThan(0);
  });

  it("OMITS requestId when called outside any request scope", () => {
    const { log, lines } = makeCapturingLogger();
    log.info("startup line");
    const events = parseLines(lines);
    expect(events).toHaveLength(1);
    // Crucially: never an `undefined` field, the key just isn't there.
    expect("requestId" in events[0]).toBe(false);
  });

  it("isolates requestId across two simulated concurrent requests", async () => {
    const { log, lines } = makeCapturingLogger();

    // Two simulated requests running 'concurrently' (interleaved
    // promises). The mixin must read the right id for each.
    const promises = [0, 1].map((n) => new Promise((resolve) => {
      const req = { headers: { "x-request-id": `req-${n}` } };
      const res = { setHeader: () => {} };
      requestIdMiddleware(req, res, async () => {
        await new Promise((r) => setImmediate(r));
        log.info(`event from ${n}`);
        resolve(req.id);
      });
    }));
    const ids = await Promise.all(promises);

    const events = parseLines(lines);
    // Each event's requestId must match the request that emitted it.
    for (const ev of events) {
      const n = ev.msg.split(" ").pop();
      expect(ev.requestId).toBe(`req-${n}`);
    }
    // And no cross-contamination.
    expect(new Set(ids).size).toBe(2);
  });
});

// ════════════════════════════════════════════════════════════
// Smoke-test the real exported logger module
// ════════════════════════════════════════════════════════════

describe("real logger module", () => {
  beforeEach(() => {
    // Force test profile (silent) so we don't spam stdout while running.
    process.env.NODE_ENV = "test";
  });

  it("exports a logger with the standard pino API", async () => {
    const mod = await import("../../backend/config/logger.js");
    expect(typeof mod.logger.info).toBe("function");
    expect(typeof mod.logger.error).toBe("function");
    expect(typeof mod.logger.warn).toBe("function");
    expect(typeof mod.logger.child).toBe("function");
  });

  it("childLogger() returns a logger that inherits bindings", async () => {
    const { childLogger } = await import("../../backend/config/logger.js");
    const child = childLogger({ module: "test" });
    expect(typeof child.info).toBe("function");
    // .bindings() reflects the static fields attached to the child.
    expect(child.bindings()).toMatchObject({ module: "test" });
  });
});
