/**
 * Feature Flag Tests — verify plan-based feature resolution logic.
 *
 * Tests the feature matching logic from config/features.js
 * and the middleware resolution pattern from authMiddleware.js
 */
import { describe, it, expect } from "vitest";
import { getFeaturesForPlan, isPlanFeature, FEATURE_DEFINITIONS, FEATURES_BY_KEY } from "../../frontend/src/config/features.js";

describe("Feature Definitions", () => {
  it("has 18 features defined", () => {
    expect(FEATURE_DEFINITIONS.length).toBe(18);
  });

  it("every feature has required properties", () => {
    FEATURE_DEFINITIONS.forEach((f) => {
      expect(f.key).toBeTruthy();
      expect(f.label).toBeTruthy();
      expect(f.description).toBeTruthy();
      expect(f.icon).toBeTruthy();
      expect(f.category).toBeTruthy();
      expect(Array.isArray(f.plans)).toBe(true);
      expect(f.plans.length).toBeGreaterThan(0);
    });
  });

  it("all feature keys are unique", () => {
    const keys = FEATURE_DEFINITIONS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("FEATURES_BY_KEY lookup works", () => {
    expect(FEATURES_BY_KEY["arena"].label).toBe("Challenge Arena");
    expect(FEATURES_BY_KEY["messaging"].label).toBe("E2EE Messaging");
    expect(FEATURES_BY_KEY["nonexistent"]).toBeUndefined();
  });
});

describe("Plan Feature Mapping", () => {
  it("starter plan has 4 core features", () => {
    const features = getFeaturesForPlan("starter");
    expect(features.length).toBe(4);
    expect(features.map((f) => f.key)).toEqual(
      expect.arrayContaining(["arena", "leaderboard", "events", "notifications"])
    );
  });

  it("professional plan has 12 features", () => {
    const features = getFeaturesForPlan("professional");
    expect(features.length).toBe(12);
    expect(features.map((f) => f.key)).toEqual(
      expect.arrayContaining(["arena", "ai_tools", "certificates", "quiz", "achievements"])
    );
  });

  it("enterprise plan has all 18 features", () => {
    const features = getFeaturesForPlan("enterprise");
    expect(features.length).toBe(18);
  });

  it("isPlanFeature checks correctly", () => {
    expect(isPlanFeature("arena", "starter")).toBe(true);
    expect(isPlanFeature("ai_tools", "starter")).toBe(false);
    expect(isPlanFeature("ai_tools", "professional")).toBe(true);
    expect(isPlanFeature("messaging", "professional")).toBe(false);
    expect(isPlanFeature("messaging", "enterprise")).toBe(true);
  });

  it("defaults to starter when plan name is missing", () => {
    const features = getFeaturesForPlan(null);
    expect(features.length).toBe(4);
  });
});

describe("Feature Flag Resolution (middleware logic)", () => {
  // Simulates the checkFeatureFlag middleware logic
  function resolveFeature(featureName, planFeatures, orgOverrides) {
    const allowed =
      featureName in orgOverrides
        ? orgOverrides[featureName]
        : planFeatures[featureName] ?? false;
    return allowed;
  }

  it("allows feature included in plan", () => {
    expect(resolveFeature("arena", { arena: true }, {})).toBe(true);
  });

  it("denies feature not in plan", () => {
    expect(resolveFeature("messaging", { arena: true }, {})).toBe(false);
  });

  it("org override enables feature not in plan", () => {
    expect(resolveFeature("messaging", { arena: true }, { messaging: true })).toBe(true);
  });

  it("org override disables feature that IS in plan", () => {
    expect(resolveFeature("arena", { arena: true }, { arena: false })).toBe(false);
  });

  it("org override takes precedence over plan", () => {
    expect(resolveFeature("ai_tools", { ai_tools: true }, { ai_tools: false })).toBe(false);
    expect(resolveFeature("ai_tools", { ai_tools: false }, { ai_tools: true })).toBe(true);
  });
});
