/**
 * Unit tests for frontend/src/store/hovercard-store.js.
 *
 * The store is tiny but sits in the hot path — every hover over a
 * wrapped name dispatches through here. Pin the basic state
 * transitions so a regression would fail CI before the visual UX
 * breaks in the browser.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useHovercardStore } from "@/store/hovercard-store";

const ANCHOR = { top: 100, left: 50, width: 120, height: 24 };

beforeEach(() => {
  useHovercardStore.setState({ open: false, userId: null, anchorRect: null, pinned: false });
});

describe("hovercard-store: show", () => {
  it("opens the card with the given userId + anchor", () => {
    useHovercardStore.getState().show("u-1", ANCHOR);
    const s = useHovercardStore.getState();
    expect(s.open).toBe(true);
    expect(s.userId).toBe("u-1");
    expect(s.anchorRect).toEqual(ANCHOR);
    expect(s.pinned).toBe(false);
  });

  it("accepts a pinned option (mobile tap-hold case)", () => {
    useHovercardStore.getState().show("u-1", ANCHOR, { pinned: true });
    expect(useHovercardStore.getState().pinned).toBe(true);
  });

  it("switching targets replaces in place (no close-reopen flicker)", () => {
    useHovercardStore.getState().show("u-1", ANCHOR);
    const anchor2 = { top: 200, left: 300, width: 100, height: 20 };
    useHovercardStore.getState().show("u-2", anchor2);
    const s = useHovercardStore.getState();
    expect(s.userId).toBe("u-2");
    expect(s.anchorRect).toEqual(anchor2);
    expect(s.open).toBe(true);
  });

  it("defensively ignores show() without userId or anchor", () => {
    useHovercardStore.getState().show("", ANCHOR);
    expect(useHovercardStore.getState().open).toBe(false);
    useHovercardStore.getState().show("u-1", null);
    expect(useHovercardStore.getState().open).toBe(false);
  });
});

describe("hovercard-store: hide", () => {
  it("closes an open card", () => {
    useHovercardStore.setState({ open: true, userId: "u-1", anchorRect: ANCHOR, pinned: false });
    useHovercardStore.getState().hide();
    expect(useHovercardStore.getState().open).toBe(false);
  });

  it("is a no-op when already closed", () => {
    // No error, no state change that breaks anything.
    useHovercardStore.getState().hide();
    expect(useHovercardStore.getState().open).toBe(false);
  });

  it("resets pinned to false on hide", () => {
    useHovercardStore.setState({ open: true, userId: "u-1", anchorRect: ANCHOR, pinned: true });
    useHovercardStore.getState().hide();
    expect(useHovercardStore.getState().pinned).toBe(false);
  });
});

describe("hovercard-store: pin/unpin", () => {
  it("pin sets pinned=true", () => {
    useHovercardStore.setState({ open: true, userId: "u-1", anchorRect: ANCHOR, pinned: false });
    useHovercardStore.getState().pin();
    expect(useHovercardStore.getState().pinned).toBe(true);
  });

  it("unpin sets pinned=false", () => {
    useHovercardStore.setState({ open: true, userId: "u-1", anchorRect: ANCHOR, pinned: true });
    useHovercardStore.getState().unpin();
    expect(useHovercardStore.getState().pinned).toBe(false);
  });
});
