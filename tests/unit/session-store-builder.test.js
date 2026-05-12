/**
 * Tests for buildSessionStore in backend/middleware/sessionConfig.js.
 *
 * Complementary to session-store-selection.test.js — the selector is
 * pure and already covered there. This file exercises the constructor
 * paths (lines 61-83 in the source) that the pure tests can't reach
 * because they spin up real network clients.
 *
 * Strategy: vi.mock replaces `redis`, `connect-redis`, and
 * `connect-pg-simple` with stubs so we can assert on the
 * configuration passed in without ever opening a real connection.
 *
 * IMPORTANT: vi.mock factories are hoisted ABOVE the import statements
 * (and above any `const` at the top of the file). Anything a factory
 * references must live inside `vi.hoisted(() => ({...}))` so it's
 * hoisted alongside. The factories below intentionally reference
 * `mocks.xxx` — everything you see there was created inside hoisted().
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const redisClientStub = {
    on:      vi.fn(),
    connect: vi.fn(() => Promise.resolve()),
  };

  // Tracking arrays so we can assert constructor args without relying
  // on `vi.fn().mock.calls` (which doesn't capture `new` invocations
  // cleanly).
  const redisStoreCalls = [];
  const pgStoreCalls    = [];

  const TrackedRedisStore = vi.fn(function (opts) {
    redisStoreCalls.push(opts);
    this.opts = opts;
    this.kind = "redis";
  });

  const TrackedPgStore = vi.fn(function (opts) {
    pgStoreCalls.push(opts);
    this.opts = opts;
    this.kind = "pg";
    this.on   = vi.fn();
  });

  const loggerStub = {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
  };

  return {
    redisClientStub,
    redisStoreCalls,
    pgStoreCalls,
    TrackedRedisStore,
    TrackedPgStore,
    loggerStub,
  };
});

vi.mock("redis", () => ({
  createClient: vi.fn(() => mocks.redisClientStub),
}));

vi.mock("connect-redis", () => ({
  RedisStore: mocks.TrackedRedisStore,
}));

vi.mock("connect-pg-simple", () => ({
  // connect-pg-simple's default export is `connectPgSimple(session)`
  // which returns a Store class. The real lib calls our factory with
  // express-session; we just hand back the tracked constructor.
  default: vi.fn(() => mocks.TrackedPgStore),
}));

vi.mock("../../backend/config/logger.js", () => ({
  logger: mocks.loggerStub,
}));

// Now safe to import the SUT — its module-level work runs once here
// (under whatever NODE_ENV the test runner has — "test" in vitest).
import { buildSessionStore } from "../../backend/middleware/sessionConfig.js";

beforeEach(() => {
  mocks.redisClientStub.on.mockClear();
  mocks.redisClientStub.connect.mockClear();
  mocks.redisClientStub.connect.mockImplementation(() => Promise.resolve());
  mocks.loggerStub.info.mockClear();
  mocks.loggerStub.warn.mockClear();
  mocks.loggerStub.error.mockClear();
  mocks.TrackedRedisStore.mockClear();
  mocks.TrackedPgStore.mockClear();
  mocks.redisStoreCalls.length = 0;
  mocks.pgStoreCalls.length    = 0;
});

// ════════════════════════════════════════════════════════════
// Redis path
// ════════════════════════════════════════════════════════════

describe("buildSessionStore — Redis path", () => {
  it("constructs a RedisStore when REDIS_URL is set", () => {
    const store = buildSessionStore({ REDIS_URL: "redis://example:6379" });
    expect(store).toBeDefined();
    expect(store.kind).toBe("redis");
  });

  it("passes the configured URL through to createClient", async () => {
    const { createClient } = await import("redis");
    buildSessionStore({ REDIS_URL: "redis://example:6379" });
    expect(createClient).toHaveBeenCalledWith({ url: "redis://example:6379" });
  });

  it("namespaces session keys with the 'sess:' prefix", () => {
    buildSessionStore({ REDIS_URL: "redis://example:6379" });
    expect(mocks.redisStoreCalls[0]).toMatchObject({ prefix: "sess:" });
  });

  it("attaches an error listener on the Redis client", () => {
    buildSessionStore({ REDIS_URL: "redis://example:6379" });
    expect(mocks.redisClientStub.on).toHaveBeenCalledWith(
      "error", expect.any(Function),
    );
  });

  it("kicks off the initial connect", () => {
    buildSessionStore({ REDIS_URL: "redis://example:6379" });
    expect(mocks.redisClientStub.connect).toHaveBeenCalled();
  });

  it("logs that it's using the Redis store", () => {
    buildSessionStore({ REDIS_URL: "redis://example:6379" });
    expect(mocks.loggerStub.info).toHaveBeenCalledWith(
      expect.stringMatching(/redis/i),
    );
  });

  it("error listener routes failures into the structured logger", () => {
    buildSessionStore({ REDIS_URL: "redis://example:6379" });
    const [, handler] = mocks.redisClientStub.on.mock.calls.find(
      ([ev]) => ev === "error",
    );
    handler(new Error("simulated redis outage"));
    expect(mocks.loggerStub.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringMatching(/redis/i),
    );
  });

  it("initial connect rejection is logged, not allowed to crash the process", async () => {
    mocks.redisClientStub.connect.mockReturnValueOnce(
      Promise.reject(new Error("ECONNREFUSED")),
    );
    buildSessionStore({ REDIS_URL: "redis://example:6379" });
    // Yield twice so the .catch() callback has run by the time we assert.
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.loggerStub.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringMatching(/redis initial connect failed/),
    );
  });
});

// ════════════════════════════════════════════════════════════
// Postgres path
// ════════════════════════════════════════════════════════════

describe("buildSessionStore — Postgres path", () => {
  it("constructs a PG-backed store when only SESSION_DB_URL is set", () => {
    const store = buildSessionStore({ SESSION_DB_URL: "postgres://x:5432/y" });
    expect(store).toBeDefined();
    expect(store.kind).toBe("pg");
  });

  it("uses the user_sessions table (matches migration 16)", () => {
    buildSessionStore({ SESSION_DB_URL: "postgres://x:5432/y" });
    expect(mocks.pgStoreCalls[0]).toMatchObject({ tableName: "user_sessions" });
  });

  it("never creates the table — migration owns the schema", () => {
    buildSessionStore({ SESSION_DB_URL: "postgres://x:5432/y" });
    expect(mocks.pgStoreCalls[0]).toMatchObject({ createTableIfMissing: false });
  });

  it("configures SSL with rejectUnauthorized:false (Supabase pool requirement)", () => {
    buildSessionStore({ SESSION_DB_URL: "postgres://x:5432/y" });
    expect(mocks.pgStoreCalls[0]).toMatchObject({
      ssl: { rejectUnauthorized: false },
    });
  });

  it("sets a 15-minute pruning interval", () => {
    buildSessionStore({ SESSION_DB_URL: "postgres://x:5432/y" });
    expect(mocks.pgStoreCalls[0]).toMatchObject({
      pruneSessionInterval: 60 * 15,
    });
  });

  it("threads the connection string through unchanged", () => {
    const url = "postgres://user:pw@host:5432/db";
    buildSessionStore({ SESSION_DB_URL: url });
    expect(mocks.pgStoreCalls[0]).toMatchObject({ conString: url });
  });

  it("logs that it's using the Postgres store", () => {
    buildSessionStore({ SESSION_DB_URL: "postgres://x:5432/y" });
    expect(mocks.loggerStub.info).toHaveBeenCalledWith(
      expect.stringMatching(/postgres/i),
    );
  });

  it("error events on the PG store route through the structured logger", () => {
    const store = buildSessionStore({ SESSION_DB_URL: "postgres://x:5432/y" });
    expect(store.on).toHaveBeenCalledWith("error", expect.any(Function));
    const [, handler] = store.on.mock.calls.find(([ev]) => ev === "error");
    handler(new Error("pool exhausted"));
    expect(mocks.loggerStub.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringMatching(/pg store/i),
    );
  });
});

// ════════════════════════════════════════════════════════════
// Memory path (dev fallback)
// ════════════════════════════════════════════════════════════

describe("buildSessionStore — memory fallback", () => {
  it("returns undefined in dev with no store env vars (lets express-session use MemoryStore)", () => {
    const store = buildSessionStore({ NODE_ENV: "development" });
    expect(store).toBeUndefined();
  });

  it("emits a loud warning so the operator knows MemoryStore is in use", () => {
    buildSessionStore({ NODE_ENV: "development" });
    expect(mocks.loggerStub.warn).toHaveBeenCalledWith(
      expect.stringMatching(/MemoryStore/),
    );
  });

  it("does NOT construct a Redis or Postgres store", () => {
    buildSessionStore({ NODE_ENV: "development" });
    expect(mocks.TrackedRedisStore).not.toHaveBeenCalled();
    expect(mocks.TrackedPgStore).not.toHaveBeenCalled();
  });

  it("THROWS in production with no stores (production safety net)", () => {
    expect(() => buildSessionStore({ NODE_ENV: "production" })).toThrow(
      /Session store missing in production/,
    );
  });
});
