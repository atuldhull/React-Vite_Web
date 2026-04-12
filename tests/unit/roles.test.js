/**
 * Tests for frontend/src/lib/roles.js — the single source of truth for
 * role -> dashboard routing. Any regression here would break login redirects.
 */

import { describe, it, expect } from "vitest";
import { ROLES, dashboardForRole, hasRole } from "../../frontend/src/lib/roles.js";

describe("ROLES constant", () => {
  it("exposes exactly the four application roles", () => {
    expect(ROLES).toEqual({
      STUDENT: "student",
      TEACHER: "teacher",
      ADMIN: "admin",
      SUPER_ADMIN: "super_admin",
    });
  });

  it("is frozen so callers cannot mutate it at runtime", () => {
    expect(Object.isFrozen(ROLES)).toBe(true);
  });
});

describe("dashboardForRole", () => {
  it("maps super_admin -> /super-admin", () => {
    expect(dashboardForRole("super_admin")).toBe("/super-admin");
  });
  it("maps admin -> /admin", () => {
    expect(dashboardForRole("admin")).toBe("/admin");
  });
  it("maps teacher -> /teacher", () => {
    expect(dashboardForRole("teacher")).toBe("/teacher");
  });
  it("maps student -> /dashboard", () => {
    expect(dashboardForRole("student")).toBe("/dashboard");
  });
  it("falls back to /dashboard for unknown or missing roles", () => {
    expect(dashboardForRole(undefined)).toBe("/dashboard");
    expect(dashboardForRole(null)).toBe("/dashboard");
    expect(dashboardForRole("")).toBe("/dashboard");
    expect(dashboardForRole("bogus")).toBe("/dashboard");
  });
});

describe("hasRole", () => {
  const teacher = { role: "teacher" };
  const admin   = { role: "admin" };

  it("returns false when user is null/undefined", () => {
    expect(hasRole(null, ["teacher"])).toBe(false);
    expect(hasRole(undefined, ["teacher"])).toBe(false);
  });

  it("returns false when user has no role", () => {
    expect(hasRole({ id: "u1" }, ["teacher"])).toBe(false);
  });

  it("returns true when allowed list is empty (no role restriction)", () => {
    expect(hasRole(teacher, [])).toBe(true);
    expect(hasRole(teacher, null)).toBe(true);
    expect(hasRole(teacher, undefined)).toBe(true);
  });

  it("returns true when user's role is in the allowed list", () => {
    expect(hasRole(teacher, ["teacher", "admin"])).toBe(true);
    expect(hasRole(admin,   ["teacher", "admin"])).toBe(true);
  });

  it("returns false when user's role is NOT in the allowed list", () => {
    expect(hasRole(teacher, ["admin", "super_admin"])).toBe(false);
    expect(hasRole({ role: "student" }, ["teacher"])).toBe(false);
  });
});
