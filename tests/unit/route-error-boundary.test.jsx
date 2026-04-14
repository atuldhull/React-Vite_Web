// @vitest-environment jsdom
/**
 * Tests for frontend/src/components/RouteErrorBoundary.jsx.
 *
 * The route boundary's job is to ISOLATE a crashing page so the app
 * shell (navigation, theme, layout) stays usable. Three contracts:
 *   1. Renders children when no error.
 *   2. Renders a CONTAINED fallback (not full-screen) when a child
 *      throws, surfaces the error message, and offers a reset.
 *   3. Clicking "Try again" clears the error state so a transient
 *      bug (e.g. a failed fetch that succeeds on retry) recovers.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RouteErrorBoundary from "../../frontend/src/components/RouteErrorBoundary.jsx";

function Boom({ msg = "page-level crash" }) {
  throw new Error(msg);
}

// A component that throws on first render but stops throwing after
// its prop `shouldThrow` flips — used to test the reset path.
function Flaky({ shouldThrow }) {
  if (shouldThrow) throw new Error("flaky");
  return <div>recovered content</div>;
}

describe("RouteErrorBoundary — happy path", () => {
  it("renders children unchanged when no throw", () => {
    render(
      <RouteErrorBoundary>
        <div>page is fine</div>
      </RouteErrorBoundary>
    );
    expect(screen.getByText("page is fine")).toBeInTheDocument();
    expect(screen.queryByText(/page hit a snag/i)).not.toBeInTheDocument();
  });
});

describe("RouteErrorBoundary — catch path", () => {
  it("renders the contained fallback + error message + reset button", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <RouteErrorBoundary>
        <Boom msg="the arena is on fire" />
      </RouteErrorBoundary>
    );

    expect(screen.getByText(/page hit a snag/i)).toBeInTheDocument();
    expect(screen.getByText(/the arena is on fire/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try Again/i })).toBeInTheDocument();
    // Explicitly NOT "Go Back" — that's the app-level boundary's
    // pattern. This one is contained, so reset-in-place is enough.
    expect(screen.queryByRole("button", { name: /Go Back/i })).not.toBeInTheDocument();

    errSpy.mockRestore();
  });
});

describe("RouteErrorBoundary — reset path", () => {
  it("clicking 'Try Again' re-renders children (recovers from transient errors)", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Start with the error; re-render after clicking reset with the
    // throw-flag flipped off. This mirrors what a real flaky scenario
    // looks like: a network error that resolves on retry because the
    // parent's state (or a retry queue) has moved on.
    const { rerender } = render(
      <RouteErrorBoundary>
        <Flaky shouldThrow={true} />
      </RouteErrorBoundary>
    );
    expect(screen.getByText(/page hit a snag/i)).toBeInTheDocument();

    // Flip the underlying failure off, then click reset. The child
    // tree re-mounts — because the boundary cleared its hasError flag —
    // and the new render path doesn't throw.
    rerender(
      <RouteErrorBoundary>
        <Flaky shouldThrow={false} />
      </RouteErrorBoundary>
    );
    fireEvent.click(screen.getByRole("button", { name: /Try Again/i }));
    expect(screen.getByText("recovered content")).toBeInTheDocument();
    expect(screen.queryByText(/page hit a snag/i)).not.toBeInTheDocument();

    errSpy.mockRestore();
  });
});
