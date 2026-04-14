/**
 * Tests for selectSessionStoreType in backend/middleware/sessionConfig.js.
 *
 * Pure-function selector — exists separately from buildSessionStore so
 * we can test the decision tree without spinning up a real Redis or
 * Postgres connection. The actual store construction has side effects
 * (network connect) and is exercised by the live boot smoke instead.
 */

import { describe, it, expect } from "vitest";
import { selectSessionStoreType } from "../../backend/middleware/sessionConfig.js";

describe("selectSessionStoreType", () => {
  it("returns 'redis' when REDIS_URL is set", () => {
    expect(selectSessionStoreType({ REDIS_URL: "redis://x" })).toBe("redis");
  });

  it("returns 'postgres' when SESSION_DB_URL is set", () => {
    expect(selectSessionStoreType({ SESSION_DB_URL: "postgres://x" })).toBe("postgres");
  });

  it("prefers Redis when both are set (Redis is faster + designed for this)", () => {
    expect(selectSessionStoreType({
      REDIS_URL: "redis://x",
      SESSION_DB_URL: "postgres://x",
    })).toBe("redis");
  });

  it("returns 'memory' in development when neither store is set", () => {
    expect(selectSessionStoreType({ NODE_ENV: "development" })).toBe("memory");
  });

  it("returns 'memory' in test when neither store is set", () => {
    expect(selectSessionStoreType({ NODE_ENV: "test" })).toBe("memory");
  });

  it("returns 'memory' when NODE_ENV is undefined (local dev default)", () => {
    expect(selectSessionStoreType({})).toBe("memory");
  });

  it("THROWS in production when neither store is configured", () => {
    expect(() => selectSessionStoreType({ NODE_ENV: "production" })).toThrow(
      /Session store missing in production/
    );
  });

  it("error message names both env vars so the operator knows the fix", () => {
    try {
      selectSessionStoreType({ NODE_ENV: "production" });
    } catch (e) {
      expect(e.message).toMatch(/REDIS_URL/);
      expect(e.message).toMatch(/SESSION_DB_URL/);
      // And explicitly explains why MemoryStore is not the answer.
      expect(e.message).toMatch(/MemoryStore/);
    }
  });
});
