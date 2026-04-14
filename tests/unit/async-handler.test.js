/**
 * Tests for backend/lib/asyncHandler.js — catchAsync() wrapper.
 *
 * Three invariants:
 *   1. A resolved async handler runs as normal (res.json etc. fire).
 *   2. A rejected async handler forwards the error to next().
 *   3. A SYNC throw (e.g. JSON.parse on a bad input BEFORE any await)
 *      also forwards to next() — important because Express's default
 *      async handling only catches returned-Promise rejections.
 */

import { describe, it, expect, vi } from "vitest";
import { catchAsync, catchAsyncWithStatus } from "../../backend/lib/asyncHandler.js";

function mkReqRes() {
  const req = { id: "req-1" };
  const res = {
    _status: 200, _body: null,
    status(c) { this._status = c; return this; },
    json(b)   { this._body = b; return this; },
  };
  return { req, res };
}

describe("catchAsync", () => {
  it("runs a resolving handler normally (no next() call)", async () => {
    const { req, res } = mkReqRes();
    const next = vi.fn();
    const handler = catchAsync(async (_req, r) => {
      r.json({ ok: true });
    });
    await handler(req, res, next);
    expect(res._body).toEqual({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards a rejection to next()", async () => {
    const { req, res } = mkReqRes();
    const next = vi.fn();
    const err = new Error("kaboom");
    const handler = catchAsync(async () => { throw err; });
    await handler(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(err);
    expect(res._body).toBeNull();   // handler did NOT send a response
  });

  it("forwards a SYNC throw (pre-await) to next()", async () => {
    const { req, res } = mkReqRes();
    const next = vi.fn();
    const err = new Error("sync-throw");
    // Note: not even `async` — a pure sync function that throws.
    // Promise.resolve() around the fn call captures it.
    const handler = catchAsync(() => { throw err; });
    await handler(req, res, next);
    expect(next).toHaveBeenCalledWith(err);
  });

  it("forwards non-Error throws (string, undefined) without crashing", async () => {
    const { req, res } = mkReqRes();
    const next = vi.fn();
    const handler = catchAsync(async () => { throw "just-a-string"; });
    await handler(req, res, next);
    expect(next).toHaveBeenCalledWith("just-a-string");
  });
});

describe("catchAsyncWithStatus", () => {
  it("attaches err.status when the error doesn't already have one", async () => {
    const { req, res } = mkReqRes();
    const next = vi.fn();
    const handler = catchAsyncWithStatus(async () => {
      throw new Error("not allowed");
    }, 403);
    await handler(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].status).toBe(403);
  });

  it("respects a pre-existing err.status", async () => {
    const { req, res } = mkReqRes();
    const next = vi.fn();
    const err = Object.assign(new Error("x"), { status: 418 });
    const handler = catchAsyncWithStatus(async () => { throw err; }, 500);
    await handler(req, res, next);
    expect(next.mock.calls[0][0].status).toBe(418);
  });
});
