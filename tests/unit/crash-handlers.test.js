/**
 * Tests for backend/config/crash.js (installCrashHandlers).
 *
 * The thing we want to prove: when an uncaughtException or
 * unhandledRejection fires, it reaches the pino logger at level
 * "fatal" with structured fields (err + event), and the process
 * calls process.exit(1) after a short flush delay.
 *
 * Approach: stub `logger.fatal` and `process.exit`, install the
 * handlers, then emit the events manually. This exercises the
 * handler code paths without actually crashing the test runner.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("installCrashHandlers", () => {
  let fatalSpy;
  let exitSpy;
  let setTimeoutSpy;
  let installed;

  beforeEach(async () => {
    vi.resetModules();
    // Stub logger.fatal AT THE MODULE LEVEL so crash.js's import
    // resolves to our spy.
    vi.doMock("../../backend/config/logger.js", () => ({
      logger: {
        fatal: vi.fn(),
        info:  vi.fn(),
        error: vi.fn(),
        warn:  vi.fn(),
      },
    }));

    const { installCrashHandlers } = await import("../../backend/config/crash.js");
    const { logger } = await import("../../backend/config/logger.js");

    fatalSpy = logger.fatal;
    // Stub process.exit so the test process stays alive.
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    // setTimeout unref() — just confirm it's called; don't actually run the callback.
    setTimeoutSpy = vi.spyOn(global, "setTimeout");

    installCrashHandlers();
    installed = true;
  });

  afterEach(() => {
    // Remove our listeners so the test process's handlers don't
    // accumulate across tests (they'd fire on each resetModules cycle).
    process.removeAllListeners("uncaughtException");
    process.removeAllListeners("unhandledRejection");
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    exitSpy.mockRestore();
    setTimeoutSpy.mockRestore();
    vi.doUnmock("../../backend/config/logger.js");
  });

  it("routes uncaughtException through logger.fatal with structured fields", () => {
    expect(installed).toBe(true);
    const err = new Error("boom");
    process.emit("uncaughtException", err, "uncaughtException");

    expect(fatalSpy).toHaveBeenCalledTimes(1);
    const [fields, msg] = fatalSpy.mock.calls[0];
    expect(fields.err).toBe(err);
    expect(fields.event).toBe("uncaughtException");
    expect(msg).toMatch(/exiting/i);
  });

  it("schedules process.exit(1) with a short flush timeout", () => {
    process.emit("uncaughtException", new Error("boom"), "uncaughtException");
    // setTimeout called with some ms ≤ 1s for the flush delay.
    expect(setTimeoutSpy).toHaveBeenCalled();
    const delay = setTimeoutSpy.mock.calls.at(-1)[1];
    expect(typeof delay).toBe("number");
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(1000);
  });

  it("routes unhandledRejection with a non-Error reason through logger.fatal", () => {
    // Reason can be any thrown value (e.g. a bare string). The handler
    // wraps it in an Error so pino's serialiser produces a stack.
    process.emit("unhandledRejection", "plain-string-reason", Promise.resolve());
    expect(fatalSpy).toHaveBeenCalledTimes(1);
    const [fields] = fatalSpy.mock.calls[0];
    expect(fields.err).toBeInstanceOf(Error);
    expect(fields.err.message).toBe("plain-string-reason");
    expect(fields.event).toBe("unhandledRejection");
  });

  it("routes unhandledRejection with a real Error reason as-is", () => {
    const err = new Error("rejected");
    process.emit("unhandledRejection", err, Promise.resolve());
    const [fields] = fatalSpy.mock.calls[0];
    expect(fields.err).toBe(err);           // not wrapped — same ref
  });

  it("logs SIGINT / SIGTERM at info level (graceful shutdown, not fatal)", async () => {
    const { logger } = await import("../../backend/config/logger.js");
    const infoSpy = logger.info;
    process.emit("SIGINT");
    process.emit("SIGTERM");
    expect(infoSpy).toHaveBeenCalledTimes(2);
    expect(infoSpy.mock.calls[0][0].signal).toBe("SIGINT");
    expect(infoSpy.mock.calls[1][0].signal).toBe("SIGTERM");
    // Shutdown should NOT call exit — we let the HTTP server close first.
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
