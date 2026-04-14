/**
 * Tests for frontend/src/lib/cn.js — the 3-line class-name joiner used
 * in nearly every React component. Tiny, but the contract matters
 * (conditional-class renders break instantly if this stops filtering
 * falsy values correctly), and the test doubles as documentation.
 */

import { describe, it, expect } from "vitest";
import { cn } from "../../frontend/src/lib/cn.js";

describe("cn", () => {
  it("joins truthy string args with spaces", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters out falsy values (false, null, undefined, 0, empty string)", () => {
    expect(cn("a", false, "b", null, "c", undefined, "d", 0, "e", "")).toBe("a b c d e");
  });

  it("returns an empty string when called with no args", () => {
    expect(cn()).toBe("");
  });

  it("returns an empty string when all args are falsy", () => {
    expect(cn(false, null, undefined, 0, "")).toBe("");
  });

  it("supports the common 'conditional class' pattern", () => {
    const isActive = true;
    const isDisabled = false;
    expect(
      cn(
        "btn",
        isActive && "btn--active",
        isDisabled && "btn--disabled",
      )
    ).toBe("btn btn--active");
  });
});
