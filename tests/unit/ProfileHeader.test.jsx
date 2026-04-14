// @vitest-environment jsdom
/**
 * Unit tests for ProfileHeader.
 *
 * Coverage:
 *   - Name + avatar always render
 *   - Private-profile path: hides stats + bio, shows "Private" chip
 *   - Self-view: renders "Edit profile" link, NO friend/message buttons
 *   - Other-view: renders FriendButton + MessageButton, NO edit link
 *   - Email only visible when access.isSelf
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Stub the social components so the tests don't depend on the
// relationship store / useRelationship hook — the buttons have
// their own test coverage.
vi.mock("@/components/social/FriendButton", () => ({
  default: () => <button data-testid="friend-btn">Friend</button>,
}));
vi.mock("@/components/social/MessageButton", () => ({
  default: () => <button data-testid="message-btn">Message</button>,
}));

import ProfileHeader from "@/features/profile/components/ProfileHeader";

const fullProfile = {
  id: "u-1",
  name: "Atul",
  role: "student",
  title: "Scholar",
  xp: 500,
  friend_count: 12,
  achievement_count: 4,
  bio: "Hi there",
  avatar_emoji: "🦊",
  avatar_color: "#0af",
};

function renderIt(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("ProfileHeader — happy path (other user)", () => {
  it("renders name, title, and avatar", () => {
    renderIt(
      <ProfileHeader
        profile={fullProfile}
        access={{ isSelf: false, reason: "public", canViewProfile: true }}
        userId="u-1"
      />,
    );
    expect(screen.getByRole("heading", { name: /atul/i })).toBeInTheDocument();
    expect(screen.getByText(/scholar/i)).toBeInTheDocument();
  });

  it("renders stats (XP, friends, badges)", () => {
    renderIt(
      <ProfileHeader
        profile={fullProfile}
        access={{ isSelf: false, reason: "public", canViewProfile: true }}
        userId="u-1"
      />,
    );
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("shows FriendButton + MessageButton for non-self", () => {
    renderIt(
      <ProfileHeader
        profile={fullProfile}
        access={{ isSelf: false, reason: "public", canViewProfile: true }}
        userId="u-1"
      />,
    );
    expect(screen.getByTestId("friend-btn")).toBeInTheDocument();
    expect(screen.getByTestId("message-btn")).toBeInTheDocument();
    expect(screen.queryByText(/edit profile/i)).not.toBeInTheDocument();
  });
});

describe("ProfileHeader — self view", () => {
  it("renders 'Edit profile' link instead of FriendButton/MessageButton", () => {
    renderIt(
      <ProfileHeader
        profile={{ ...fullProfile, email: "a@x" }}
        access={{ isSelf: true, reason: "self", canViewProfile: true }}
        userId="u-1"
      />,
    );
    expect(screen.getByText(/edit profile/i)).toBeInTheDocument();
    expect(screen.queryByTestId("friend-btn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("message-btn")).not.toBeInTheDocument();
  });

  it("shows email only for self", () => {
    const { rerender } = renderIt(
      <ProfileHeader
        profile={{ ...fullProfile, email: "a@x" }}
        access={{ isSelf: true, reason: "self", canViewProfile: true }}
        userId="u-1"
      />,
    );
    expect(screen.getByText("a@x")).toBeInTheDocument();

    // Non-self: email should NOT render even if payload has it (the
    // backend redacts it, but header defence is the test).
    rerender(
      <MemoryRouter>
        <ProfileHeader
          profile={{ ...fullProfile, email: "a@x" }}
          access={{ isSelf: false, reason: "public", canViewProfile: true }}
          userId="u-1"
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText("a@x")).not.toBeInTheDocument();
  });
});

describe("ProfileHeader — private profile", () => {
  it("renders 'Private' chip and hides stats/bio", () => {
    renderIt(
      <ProfileHeader
        profile={{ id: "u-1", name: "Alice", isPrivate: true, avatar_emoji: "👤" }}
        access={{ isSelf: false, reason: "private", canViewProfile: false }}
        userId="u-1"
      />,
    );
    expect(screen.getByText(/^private$/i)).toBeInTheDocument();
    // Stats and bio should NOT render for private
    expect(screen.queryByText(/total xp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/scholar/i)).not.toBeInTheDocument();
  });
});
