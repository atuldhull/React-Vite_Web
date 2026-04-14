// @vitest-environment jsdom
/**
 * Smoke test for Phase 9 — verify LeaderboardPage wraps name cells
 * with UserHoverCard when a user_id is present, AND that it batch-
 * pre-warms the relationship store on load.
 *
 * This is a minimal "integration smoke" — we don't assert on the
 * render output of the hovercard itself (its own tests cover that),
 * just that the wrapper hook-in is wired correctly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/api", () => ({
  leaderboard: {
    weekly:   vi.fn(async () => ({ data: [
      { user_id: "u-1", name: "Alice", xp: 500, title: "Scholar" },
      { user_id: "u-2", name: "Bob",   xp: 300, title: "Noob"    },
    ] })),
    allTime:  vi.fn(async () => ({ data: [] })),
    winners:  vi.fn(async () => ({ data: [] })),
    weekInfo: vi.fn(async () => ({ data: null })),
  },
  events: { list: vi.fn(async () => ({ data: [] })) },
}));

// Intercept the relationship store to verify batch pre-warm fires.
const fetchBatchSpy = vi.fn(async () => {});
vi.mock("@/store/relationship-store", () => ({
  useRelationshipStore: {
    getState: () => ({ fetchBatch: fetchBatchSpy }),
    setState: () => {},
  },
}));

// Stub UserHoverCard so we can assert on its presence without mounting
// the full portal machinery.
vi.mock("@/components/social/UserHoverCard", () => ({
  default: ({ userId, children }) => (
    <span data-testid={`hc-${userId}`}>{children}</span>
  ),
}));

// Monument backgrounds load a bunch of 3D stuff — stub them out.
vi.mock("@/components/backgrounds/MonumentBackground", () => ({ default: () => null }));
vi.mock("@/components/monument/MonumentHero", () => ({ default: () => null }));
vi.mock("@/hooks/useMonument", () => ({ useMonument: () => {} }));

import LeaderboardPage from "@/features/public/pages/LeaderboardPage";

beforeEach(() => { fetchBatchSpy.mockClear(); });

describe("LeaderboardPage — Phase 15 hovercard integration", () => {
  it("wraps each name in a UserHoverCard with the right userId", async () => {
    const { findByTestId } = render(
      <MemoryRouter><LeaderboardPage /></MemoryRouter>,
    );
    // Both Alice and Bob should be wrapped with their user_ids.
    expect(await findByTestId("hc-u-1")).toBeInTheDocument();
    expect(await findByTestId("hc-u-2")).toBeInTheDocument();
  });

  it("batch pre-warms the relationship store with all visible user_ids", async () => {
    render(<MemoryRouter><LeaderboardPage /></MemoryRouter>);
    await waitFor(() => {
      expect(fetchBatchSpy).toHaveBeenCalled();
      const ids = fetchBatchSpy.mock.calls.at(-1)[0];
      expect(ids).toEqual(expect.arrayContaining(["u-1", "u-2"]));
    });
  });
});
