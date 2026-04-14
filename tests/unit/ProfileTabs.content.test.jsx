// @vitest-environment jsdom
/**
 * Unit tests for the four profile-tab content components:
 *   OverviewTab, AchievementsTab, FriendsTab, ActivityTab.
 *
 * Focus: branch coverage (loading, hidden, empty, data) + that the
 * right API is called with the right args. The underlying rendering
 * delegates to ActivityTimelineItem / MutualFriendsStrip which have
 * their own tests — we don't re-assert their internal shape here.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/api", () => ({
  users: {
    profile:       vi.fn(),
    friends:       vi.fn(),
    activity:      vi.fn(),
    mutualFriends: vi.fn(),
  },
  achievements: {
    user: vi.fn(),
  },
  chat: {
    unfriend: vi.fn(async () => ({ data: { ok: true } })),
  },
}));

import { users, achievements as achApi } from "@/lib/api";
import OverviewTab from "@/features/profile/components/OverviewTab";
import AchievementsTab from "@/features/profile/components/AchievementsTab";
import FriendsTab from "@/features/profile/components/FriendsTab";
import ActivityTab from "@/features/profile/components/ActivityTab";

const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// OverviewTab
// ════════════════════════════════════════════════════════════

describe("OverviewTab", () => {
  it("renders mutual friends strip + recent activity when both have data", async () => {
    users.mutualFriends.mockResolvedValueOnce({
      data: { mutual: [{ id: "u-m1", name: "Alice", avatar_emoji: "🦊" }], count: 1 },
    });
    users.activity.mockResolvedValueOnce({
      data: { items: [{ kind: "event", at: "2026-04-01T00:00:00Z", data: { title: "Hack Day" } }] },
    });

    wrap(<OverviewTab userId="u-1" access={{ isSelf: false, canViewActivityFeed: true }} />);

    await waitFor(() => {
      expect(screen.getByText(/mutual friends/i)).toBeInTheDocument();
      expect(screen.getByText(/recent activity/i)).toBeInTheDocument();
      expect(screen.getByText(/hack day/i)).toBeInTheDocument();
    });
    expect(users.mutualFriends).toHaveBeenCalledWith("u-1");
  });

  it("hides mutual friends section on self-view (users don't see mutuals of their own profile)", async () => {
    users.mutualFriends.mockResolvedValueOnce({ data: { mutual: [], count: 0 } });
    users.activity.mockResolvedValueOnce({
      data: { items: [{ kind: "achievement", at: "2026-04-01T00:00:00Z", data: { title: "First Steps" } }] },
    });
    wrap(<OverviewTab userId="u-self" access={{ isSelf: true, canViewActivityFeed: true }} />);
    await waitFor(() => {
      expect(screen.queryByText(/mutual friends/i)).not.toBeInTheDocument();
      expect(screen.getByText(/first steps/i)).toBeInTheDocument();
    });
  });

  it("shows 'Nothing to show' fallback when both sources are empty", async () => {
    users.mutualFriends.mockResolvedValueOnce({ data: { mutual: [], count: 0 } });
    users.activity.mockResolvedValueOnce({ data: { items: [] } });
    wrap(<OverviewTab userId="u-1" access={{ isSelf: false, canViewActivityFeed: true }} />);
    await waitFor(() => {
      expect(screen.getByText(/nothing to show/i)).toBeInTheDocument();
    });
  });
});

// ════════════════════════════════════════════════════════════
// AchievementsTab
// ════════════════════════════════════════════════════════════

describe("AchievementsTab", () => {
  it("renders achievements grid with title + icon + description", async () => {
    achApi.user.mockResolvedValueOnce({
      data: [
        { id: "ua-1", unlocked_at: "2026-04-01", achievements: { slug: "first_event", title: "First Steps", description: "Attend 1 event", icon: "🎯", rarity: "common" } },
        { id: "ua-2", unlocked_at: "2026-04-02", achievements: { slug: "event_regular", title: "Regular", description: "Attend 5 events", icon: "📅", rarity: "uncommon" } },
      ],
    });
    wrap(<AchievementsTab userId="u-1" />);
    await waitFor(() => {
      expect(screen.getByText(/first steps/i)).toBeInTheDocument();
      expect(screen.getByText(/^regular$/i)).toBeInTheDocument();
    });
  });

  it("renders empty state with badge emoji when no achievements", async () => {
    achApi.user.mockResolvedValueOnce({ data: [] });
    wrap(<AchievementsTab userId="u-1" />);
    await waitFor(() => {
      expect(screen.getByText(/no achievements unlocked yet/i)).toBeInTheDocument();
    });
  });

  it("renders error state on fetch failure", async () => {
    achApi.user.mockRejectedValueOnce(new Error("boom"));
    wrap(<AchievementsTab userId="u-1" />);
    await waitFor(() => {
      expect(screen.getByText(/couldn't load achievements/i)).toBeInTheDocument();
    });
  });
});

// ════════════════════════════════════════════════════════════
// FriendsTab
// ════════════════════════════════════════════════════════════

describe("FriendsTab", () => {
  it("renders 'hidden' state when backend sets hiddenByUser=true", async () => {
    users.friends.mockResolvedValueOnce({ data: { friends: [], total: 0, hiddenByUser: true } });
    wrap(<FriendsTab userId="u-1" access={{ isSelf: false }} />);
    await waitFor(() => {
      expect(screen.getByText(/hidden their friends list/i)).toBeInTheDocument();
    });
  });

  it("renders empty state when total=0", async () => {
    users.friends.mockResolvedValueOnce({ data: { friends: [], total: 0, hiddenByUser: false } });
    wrap(<FriendsTab userId="u-1" access={{ isSelf: false }} />);
    await waitFor(() => {
      expect(screen.getByText(/no friends yet/i)).toBeInTheDocument();
    });
  });

  it("renders friend rows with mutual badges when applicable", async () => {
    users.friends.mockResolvedValueOnce({
      data: {
        friends: [
          { id: "f-1", name: "Alice", title: "Scholar", xp: 100, avatar_emoji: "🦊", isMutual: true },
          { id: "f-2", name: "Bob",   title: "Noob",    xp: 10,  avatar_emoji: "🐶", isMutual: false },
        ],
        total: 2,
        hiddenByUser: false,
      },
    });
    wrap(<FriendsTab userId="u-1" access={{ isSelf: false }} />);
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      // Only Alice is mutual.
      const mutuals = screen.getAllByText(/^mutual$/i);
      expect(mutuals.length).toBe(1);
    });
  });

  it("filters the list client-side by the search input", async () => {
    users.friends.mockResolvedValueOnce({
      data: {
        friends: [
          { id: "f-1", name: "Alice", isMutual: false },
          { id: "f-2", name: "Bob",   isMutual: false },
        ],
        total: 2,
        hiddenByUser: false,
      },
    });
    wrap(<FriendsTab userId="u-1" access={{ isSelf: false }} />);
    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: "bob" } });
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("hides the 'Remove' button on non-self views", async () => {
    users.friends.mockResolvedValueOnce({
      data: { friends: [{ id: "f-1", name: "Alice" }], total: 1, hiddenByUser: false },
    });
    wrap(<FriendsTab userId="u-1" access={{ isSelf: false }} />);
    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
    expect(screen.queryByText(/remove/i)).not.toBeInTheDocument();
  });

  it("shows a 'Remove' button on self views", async () => {
    users.friends.mockResolvedValueOnce({
      data: { friends: [{ id: "f-1", name: "Alice" }], total: 1, hiddenByUser: false },
    });
    wrap(<FriendsTab userId="u-self" access={{ isSelf: true }} />);
    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════
// ActivityTab
// ════════════════════════════════════════════════════════════

describe("ActivityTab", () => {
  it("renders hidden state when hiddenByUser=true", async () => {
    users.activity.mockResolvedValueOnce({ data: { items: [], hiddenByUser: true, hasMore: false } });
    wrap(<ActivityTab userId="u-1" />);
    await waitFor(() => {
      expect(screen.getByText(/hidden their activity/i)).toBeInTheDocument();
    });
  });

  it("renders empty state when no items", async () => {
    users.activity.mockResolvedValueOnce({ data: { items: [], hiddenByUser: false, hasMore: false } });
    wrap(<ActivityTab userId="u-1" />);
    await waitFor(() => {
      expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
    });
  });

  it("renders timeline items when data is present", async () => {
    users.activity.mockResolvedValueOnce({
      data: {
        items: [
          { kind: "event",       at: "2026-04-01T00:00:00Z", data: { title: "Hack Day", event_type: "hackathon", status: "attended" } },
          { kind: "achievement", at: "2026-03-20T00:00:00Z", data: { title: "First Steps", icon: "🎯", rarity: "common", xp_awarded: 50 } },
        ],
        hiddenByUser: false,
        hasMore: false,
      },
    });
    wrap(<ActivityTab userId="u-1" />);
    await waitFor(() => {
      expect(screen.getByText(/hack day/i)).toBeInTheDocument();
      expect(screen.getByText(/first steps/i)).toBeInTheDocument();
    });
  });

  it("shows a 'Load more' button when hasMore=true", async () => {
    users.activity.mockResolvedValueOnce({
      data: {
        items: [{ kind: "event", at: "2026-04-01T00:00:00Z", data: { title: "X" } }],
        hiddenByUser: false,
        hasMore: true,
      },
    });
    wrap(<ActivityTab userId="u-1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument());
  });
});
