// @vitest-environment jsdom
/**
 * Unit tests for small presentational UI primitives.
 *
 * These components are tiny, used on nearly every page, and have
 * exactly the kind of prop-driven branching that regresses quietly.
 * Bundled one file per component-family to keep boilerplate low.
 *
 * Intentionally not testing visual/styling — we'd need chromatic /
 * snapshot infra for that. These tests pin behavioural output:
 * correct label for given status, disabled state on loading,
 * full-vs-warn visual-flag data attributes on CapacityBar.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Button from "@/components/ui/Button";
import CapacityBar from "@/components/ui/CapacityBar";
import EventStatusBadge from "@/components/ui/EventStatusBadge";

// ═══════════════════════════════════════════════════════════
// Button
// ═══════════════════════════════════════════════════════════

describe("<Button />", () => {
  it("renders its children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
  });

  it("fires onClick when clicked (default enabled state)", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onClick when disabled", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} disabled>Go</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does NOT fire onClick when loading (loading implies disabled)", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} loading>Go</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("sets HTML disabled attribute when disabled prop is true", () => {
    render(<Button disabled>Off</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("sets HTML disabled attribute when loading", () => {
    render(<Button loading>Wait</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("forwards arbitrary props (aria-label, data-*, type)", () => {
    render(<Button aria-label="submit form" type="submit" data-testid="go">Go</Button>);
    const btn = screen.getByTestId("go");
    expect(btn).toHaveAttribute("aria-label", "submit form");
    expect(btn).toHaveAttribute("type", "submit");
  });

  it("applies custom className", () => {
    render(<Button className="extra-class">X</Button>);
    expect(screen.getByRole("button").className).toMatch(/extra-class/);
  });
});

// ═══════════════════════════════════════════════════════════
// CapacityBar
// ═══════════════════════════════════════════════════════════

describe("<CapacityBar />", () => {
  it("renders 'Unlimited' mode when max is null", () => {
    render(<CapacityBar current={10} max={null} />);
    expect(screen.getByText(/10 registered · Unlimited/i)).toBeInTheDocument();
  });

  it("renders 'Unlimited' mode when max is undefined", () => {
    render(<CapacityBar current={5} />);
    expect(screen.getByText(/5 registered · Unlimited/i)).toBeInTheDocument();
  });

  it("renders 'current / max registered' + computed %", () => {
    render(<CapacityBar current={25} max={100} />);
    expect(screen.getByText(/25 \/ 100 registered/i)).toBeInTheDocument();
    expect(screen.getByText(/25%/i)).toBeInTheDocument();
  });

  it("clamps % at 100 when current exceeds max (overbooking)", () => {
    const { container } = render(<CapacityBar current={150} max={100} />);
    const fill = container.querySelector(".event-capacity-bar-fill");
    expect(fill.style.width).toBe("100%");
  });

  it("sets data-full when at 100%", () => {
    const { container } = render(<CapacityBar current={100} max={100} />);
    const fill = container.querySelector(".event-capacity-bar-fill");
    expect(fill.getAttribute("data-full")).toBe("true");
  });

  it("sets data-warn at exactly 80% (threshold inclusive)", () => {
    const { container } = render(<CapacityBar current={80} max={100} />);
    const fill = container.querySelector(".event-capacity-bar-fill");
    expect(fill.getAttribute("data-warn")).toBe("true");
    expect(fill.getAttribute("data-full")).toBe("false");
  });

  it("does NOT set data-warn below 80%", () => {
    const { container } = render(<CapacityBar current={79} max={100} />);
    const fill = container.querySelector(".event-capacity-bar-fill");
    expect(fill.getAttribute("data-warn")).toBe("false");
  });
});

// ═══════════════════════════════════════════════════════════
// EventStatusBadge
// ═══════════════════════════════════════════════════════════

describe("<EventStatusBadge />", () => {
  it.each([
    ["registering", "Registering"],
    ["active",      "Live Now"],
    ["completed",   "Completed"],
    ["closed",      "Closed"],
    ["cancelled",   "Cancelled"],
    ["waitlisted",  "Waitlisted"],
    ["upcoming",    "Upcoming"],
    ["past",        "Past"],
  ])("renders '%s' as label '%s'", (status, expectedLabel) => {
    render(<EventStatusBadge status={status} />);
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });

  it("falls back to 'Upcoming' on unknown status", () => {
    render(<EventStatusBadge status="not-a-real-status" />);
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
  });

  it("falls back to 'Upcoming' when status is undefined", () => {
    render(<EventStatusBadge />);
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
  });

  it("merges custom className onto the root span", () => {
    const { container } = render(<EventStatusBadge status="active" className="my-class" />);
    expect(container.firstChild.className).toMatch(/my-class/);
  });
});
