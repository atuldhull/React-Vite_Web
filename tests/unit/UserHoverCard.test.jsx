// @vitest-environment jsdom
/**
 * Unit tests for UserHoverCard wrapper.
 *
 * Focus:
 *   - Pass-through when disabled or no userId
 *   - Mouse-enter fires show() after the configured delay
 *   - Mouse-leave cancels a pending show + calls hide()
 *   - Touch long-press fires show({ pinned: true })
 *   - Short taps DON'T fire show() (cancel on move)
 *
 * We use fake timers to control the enter/leave/long-press delays
 * without sleeping the test suite.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { useHovercardStore } from "@/store/hovercard-store";
import UserHoverCard from "@/components/social/UserHoverCard";

beforeEach(() => {
  useHovercardStore.setState({ open: false, userId: null, anchorRect: null, pinned: false });
  vi.useFakeTimers();
});

function advance(ms) {
  // Wrap timer advancement + state flush.
  vi.advanceTimersByTime(ms);
}

// ════════════════════════════════════════════════════════════
// Pass-through
// ════════════════════════════════════════════════════════════

describe("UserHoverCard — pass-through", () => {
  it("renders children unchanged when disabled", () => {
    render(
      <UserHoverCard userId="u-1" disabled>
        <span data-testid="child">Alice</span>
      </UserHoverCard>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    // No event handlers should have been attached
    fireEvent.mouseEnter(screen.getByTestId("child"));
    advance(500);
    expect(useHovercardStore.getState().open).toBe(false);
  });

  it("renders children unchanged when userId is empty", () => {
    render(
      <UserHoverCard userId="">
        <span data-testid="child">Alice</span>
      </UserHoverCard>,
    );
    fireEvent.mouseEnter(screen.getByTestId("child"));
    advance(500);
    expect(useHovercardStore.getState().open).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// Desktop hover
// ════════════════════════════════════════════════════════════

describe("UserHoverCard — desktop hover", () => {
  it("mouseenter fires show() after the enter delay (~250ms)", () => {
    render(
      <UserHoverCard userId="u-42">
        <span data-testid="trigger">Alice</span>
      </UserHoverCard>,
    );
    const wrapper = screen.getByTestId("trigger").parentElement;
    fireEvent.mouseEnter(wrapper);
    // Before delay fires — still closed.
    advance(100);
    expect(useHovercardStore.getState().open).toBe(false);
    // After the full 250ms.
    advance(200);
    expect(useHovercardStore.getState().open).toBe(true);
    expect(useHovercardStore.getState().userId).toBe("u-42");
  });

  it("mouseleave during the enter delay cancels the show()", () => {
    render(
      <UserHoverCard userId="u-42">
        <span data-testid="trigger">Alice</span>
      </UserHoverCard>,
    );
    const wrapper = screen.getByTestId("trigger").parentElement;
    fireEvent.mouseEnter(wrapper);
    advance(100);
    fireEvent.mouseLeave(wrapper);
    advance(500);
    expect(useHovercardStore.getState().open).toBe(false);
  });

  it("mouseleave after the show fires hide() after its grace delay (~150ms)", () => {
    render(
      <UserHoverCard userId="u-42">
        <span data-testid="trigger">Alice</span>
      </UserHoverCard>,
    );
    const wrapper = screen.getByTestId("trigger").parentElement;
    fireEvent.mouseEnter(wrapper);
    advance(300);
    expect(useHovercardStore.getState().open).toBe(true);
    fireEvent.mouseLeave(wrapper);
    // During grace period, still open.
    advance(50);
    expect(useHovercardStore.getState().open).toBe(true);
    advance(150);
    expect(useHovercardStore.getState().open).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// Mobile long-press
// ════════════════════════════════════════════════════════════

describe("UserHoverCard — mobile long-press", () => {
  it("touch held for 500ms fires show() with pinned=true", () => {
    render(
      <UserHoverCard userId="u-42">
        <span data-testid="trigger">Alice</span>
      </UserHoverCard>,
    );
    const wrapper = screen.getByTestId("trigger").parentElement;
    fireEvent.touchStart(wrapper, { touches: [{ clientX: 100, clientY: 100 }] });
    advance(400);
    expect(useHovercardStore.getState().open).toBe(false);
    advance(200); // crosses 500ms total
    expect(useHovercardStore.getState().open).toBe(true);
    expect(useHovercardStore.getState().pinned).toBe(true);
  });

  it("short tap (touchend before 500ms) does NOT fire show()", () => {
    render(
      <UserHoverCard userId="u-42">
        <span data-testid="trigger">Alice</span>
      </UserHoverCard>,
    );
    const wrapper = screen.getByTestId("trigger").parentElement;
    fireEvent.touchStart(wrapper, { touches: [{ clientX: 100, clientY: 100 }] });
    advance(200);
    fireEvent.touchEnd(wrapper);
    advance(1000);
    expect(useHovercardStore.getState().open).toBe(false);
  });

  it("scrolling (touchmove beyond 8px) cancels the long-press", () => {
    render(
      <UserHoverCard userId="u-42">
        <span data-testid="trigger">Alice</span>
      </UserHoverCard>,
    );
    const wrapper = screen.getByTestId("trigger").parentElement;
    fireEvent.touchStart(wrapper, { touches: [{ clientX: 100, clientY: 100 }] });
    advance(300);
    fireEvent.touchMove(wrapper, { touches: [{ clientX: 100, clientY: 120 }] });
    advance(500);
    expect(useHovercardStore.getState().open).toBe(false);
  });
});
