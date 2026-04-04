/**
 * Arena Scoring Tests — verify XP rewards and penalty calculations.
 *
 * Tests the pure scoring logic extracted from arenaController.js
 */
import { describe, it, expect } from "vitest";

// Extract the scoring logic from the controller
function calculateXP(correct, points) {
  const penaltyMap = { 20: -5, 50: -10, 100: -20 };
  const penalty = penaltyMap[points] || Math.round(-points * 0.2);
  return correct ? points : penalty;
}

function clampXP(currentXP, xpChange) {
  return Math.max(0, currentXP + xpChange);
}

describe("Arena Scoring", () => {
  describe("XP rewards for correct answers", () => {
    it("awards 20 XP for easy (20pt) correct answer", () => {
      expect(calculateXP(true, 20)).toBe(20);
    });

    it("awards 50 XP for medium (50pt) correct answer", () => {
      expect(calculateXP(true, 50)).toBe(50);
    });

    it("awards 100 XP for hard (100pt) correct answer", () => {
      expect(calculateXP(true, 100)).toBe(100);
    });
  });

  describe("XP penalties for wrong answers", () => {
    it("deducts 5 XP for easy (20pt) wrong answer", () => {
      expect(calculateXP(false, 20)).toBe(-5);
    });

    it("deducts 10 XP for medium (50pt) wrong answer", () => {
      expect(calculateXP(false, 50)).toBe(-10);
    });

    it("deducts 20 XP for hard (100pt) wrong answer", () => {
      expect(calculateXP(false, 100)).toBe(-20);
    });

    it("calculates 20% penalty for non-standard points", () => {
      expect(calculateXP(false, 75)).toBe(-15);
      expect(calculateXP(false, 200)).toBe(-40);
    });
  });

  describe("XP floor (never goes negative total)", () => {
    it("floors XP at 0 when penalty exceeds current XP", () => {
      expect(clampXP(3, -5)).toBe(0);
      expect(clampXP(0, -10)).toBe(0);
    });

    it("allows XP to decrease but not below 0", () => {
      expect(clampXP(50, -10)).toBe(40);
      expect(clampXP(100, -20)).toBe(80);
    });

    it("increases XP normally for correct answers", () => {
      expect(clampXP(100, 50)).toBe(150);
      expect(clampXP(0, 20)).toBe(20);
    });
  });
});
