// @vitest-environment jsdom
/**
 * Unit tests for ProfileTabs.
 *
 * Pins:
 *   - Clicking an enabled tab fires onChange with the right id
 *   - Disabled tabs (access flag=false) don't fire onChange
 *   - Active tab carries aria-selected=true
 *   - Tab list is always rendered in the same order regardless of
 *     which are disabled — this is the "don't shift layout" invariant
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ProfileTabs from "@/features/profile/components/ProfileTabs";

const baseAccess = {
  canViewProfile:      true,
  canViewFriendList:   true,
  canViewActivityFeed: true,
};

describe("ProfileTabs", () => {
  it("renders all four tabs in order", () => {
    render(<ProfileTabs active="overview" onChange={() => {}} access={baseAccess} />);
    const list = screen.getByRole("tablist");
    const tabs = within(list).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Overview", "Achievements", "Friends", "Activity"]);
  });

  it("marks the active tab with aria-selected=true", () => {
    render(<ProfileTabs active="friends" onChange={() => {}} access={baseAccess} />);
    const friendsTab = screen.getByRole("tab", { name: /friends/i });
    expect(friendsTab).toHaveAttribute("aria-selected", "true");
    const overview = screen.getByRole("tab", { name: /overview/i });
    expect(overview).toHaveAttribute("aria-selected", "false");
  });

  it("clicking an enabled tab calls onChange with the tab id", () => {
    const onChange = vi.fn();
    render(<ProfileTabs active="overview" onChange={onChange} access={baseAccess} />);
    fireEvent.click(screen.getByRole("tab", { name: /achievements/i }));
    expect(onChange).toHaveBeenCalledWith("achievements");
  });

  it("Friends tab is rendered but disabled when canViewFriendList=false", () => {
    const onChange = vi.fn();
    render(
      <ProfileTabs
        active="overview"
        onChange={onChange}
        access={{ ...baseAccess, canViewFriendList: false }}
      />,
    );
    const friends = screen.getByRole("tab", { name: /friends/i });
    expect(friends).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(friends);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Activity tab is disabled when canViewActivityFeed=false", () => {
    const onChange = vi.fn();
    render(
      <ProfileTabs
        active="overview"
        onChange={onChange}
        access={{ ...baseAccess, canViewActivityFeed: false }}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /activity/i }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
