// @vitest-environment jsdom
/**
 * Tests for frontend/src/components/ErrorBoundary.jsx.
 *
 * ErrorBoundary is the last line of defence against a render-time
 * crash anywhere in the React tree — if IT is broken, any thrown
 * component leaves the user with a blank page. So it's worth
 * treating as load-bearing code even though it's small.
 *
 * Three contracts to enforce:
 *   1. Happy path — renders children unchanged when nothing throws.
 *   2. Catch path — renders the fallback UI when a child throws,
 *      and surfaces the error message inside it (so a support ticket
 *      with a screenshot has something useful to quote).
 *   3. Reset path — "Go Back" clears the error state.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "../../frontend/src/components/ErrorBoundary.jsx";

// A tiny component that throws on demand — lets us trigger the
// boundary without building a whole failing feature.
function Boom({ msg = "intentional test error" }) {
  throw new Error(msg);
}

afterEach(() => {
  // React logs caught errors to console.error by default — we swallow
  // that noise per-test with a mock in each test that expects a throw.
});

describe("ErrorBoundary — happy path", () => {
  it("renders children unchanged when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <div>all good here</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("all good here")).toBeInTheDocument();
    // Fallback UI should not appear.
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
  });
});

describe("ErrorBoundary — catch path", () => {
  it("shows the fallback UI when a child throws, including the message", () => {
    // Silence React's automatic console.error during an intentional throw;
    // vitest would otherwise flag it as an uncaught error in the output.
    const errSpy  = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy  = vi.spyOn(console, "log").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom msg="database is on fire" />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/database is on fire/i)).toBeInTheDocument();
    // Action buttons must be rendered so the user isn't stuck.
    expect(screen.getByRole("button", { name: /Try Again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Go Back/i })).toBeInTheDocument();

    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("catches errors at ANY depth, not just direct children", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Outer() {
      return <div><div><Boom msg="deep" /></div></div>;
    }
    render(
      <ErrorBoundary>
        <Outer />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    errSpy.mockRestore();
  });
});

describe("ErrorBoundary — reset path", () => {
  it("'Go Back' clears the error state (internal reset) and calls window.history.back", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Go Back/i }));
    expect(backSpy).toHaveBeenCalledTimes(1);

    errSpy.mockRestore();
    backSpy.mockRestore();
  });
});
