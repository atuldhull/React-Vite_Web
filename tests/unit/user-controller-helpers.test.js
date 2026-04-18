/**
 * Unit tests for pure helpers in backend/controllers/userController.js.
 *
 * getTitleForXP + getNextTitle drive the "level title" shown next to
 * a student's name everywhere in the app. Bugs here silently mis-rank
 * every user. These are pure functions — no DB, no req — so they can
 * be exercised directly.
 */

import { describe, it, expect } from "vitest";
import { XP_TITLES, getTitleForXP, getNextTitle } from "../../backend/controllers/userController.js";

// ═══════════════════════════════════════════════════════════
// XP_TITLES — structural invariants
// ═══════════════════════════════════════════════════════════

describe("XP_TITLES", () => {
  it("has 9 tiers", () => {
    expect(XP_TITLES).toHaveLength(9);
  });

  it("is sorted strictly ascending by min", () => {
    for (let i = 1; i < XP_TITLES.length; i++) {
      expect(XP_TITLES[i].min).toBeGreaterThan(XP_TITLES[i - 1].min);
    }
  });

  it("starts at 0 XP (new users get a title immediately)", () => {
    expect(XP_TITLES[0].min).toBe(0);
  });

  it("every tier has a non-empty title string", () => {
    for (const t of XP_TITLES) expect(t.title.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
// getTitleForXP
// ═══════════════════════════════════════════════════════════

describe("getTitleForXP", () => {
  it("returns 'Axiom Scout' at exactly 0 XP", () => {
    expect(getTitleForXP(0)).toBe("Axiom Scout");
  });

  it("stays on 'Axiom Scout' just below the next threshold", () => {
    expect(getTitleForXP(199)).toBe("Axiom Scout");
  });

  it("promotes to 'Proof Reader' at exactly 200 XP", () => {
    expect(getTitleForXP(200)).toBe("Proof Reader");
  });

  it("promotes to 'Theorem Hunter' at 500 XP", () => {
    expect(getTitleForXP(500)).toBe("Theorem Hunter");
  });

  it("returns 'Math Collective Legend' at 10_000+ XP", () => {
    expect(getTitleForXP(10_000)).toBe("Math Collective Legend");
    expect(getTitleForXP(100_000)).toBe("Math Collective Legend");
  });

  it("is monotonic — title of N+1 XP is the same as title of N or a later one", () => {
    // Exercise the boundaries of every tier.
    const ORDER = XP_TITLES.map((t) => t.title);
    let lastIdx = 0;
    for (let xp = 0; xp <= 12_000; xp += 50) {
      const idx = ORDER.indexOf(getTitleForXP(xp));
      expect(idx).toBeGreaterThanOrEqual(lastIdx);
      lastIdx = idx;
    }
  });
});

// ═══════════════════════════════════════════════════════════
// getNextTitle
// ═══════════════════════════════════════════════════════════

describe("getNextTitle", () => {
  it("at 0 XP, next is 'Proof Reader' needing 200 more", () => {
    const r = getNextTitle(0);
    expect(r.title).toBe("Proof Reader");
    expect(r.xpNeeded).toBe(200);
    expect(r.xpRequired).toBe(200);
  });

  it("at 150 XP, still Proof Reader next, needs 50 more", () => {
    const r = getNextTitle(150);
    expect(r.title).toBe("Proof Reader");
    expect(r.xpNeeded).toBe(50);
  });

  it("at exactly 200 XP (just earned it), next is Theorem Hunter (500)", () => {
    const r = getNextTitle(200);
    expect(r.title).toBe("Theorem Hunter");
    expect(r.xpNeeded).toBe(300);
  });

  it("returns null at 10_000+ XP (already at max title)", () => {
    expect(getNextTitle(10_000)).toBeNull();
    expect(getNextTitle(50_000)).toBeNull();
  });

  it("xpNeeded is always positive (never zero or negative at a valid input)", () => {
    for (const xp of [0, 50, 199, 200, 499, 1000, 7499]) {
      const r = getNextTitle(xp);
      if (r) expect(r.xpNeeded).toBeGreaterThan(0);
    }
  });
});
