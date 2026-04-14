// @vitest-environment jsdom
/**
 * Unit tests for FriendButton.
 *
 * Coverage: every branch of the state machine renders the right
 * label, every click fires the right hook method.
 *
 * We mock the hooks so the test doesn't need a real store or
 * network layer — the hooks are already covered in
 * tests/unit/useProfileActions.test.js and
 * tests/unit/relationship-store.test.js. Here we're testing the
 * UI layer, not the data layer.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mocks live OUTSIDE the factory — vi.mock hoists and we reference
// these via the imported modules below.
vi.mock("@/hooks/useRelationship", () => ({ useRelationship: vi.fn() }));
vi.mock("@/hooks/useProfileActions", () => ({ useProfileActions: vi.fn() }));

import { useRelationship } from "@/hooks/useRelationship";
import { useProfileActions } from "@/hooks/useProfileActions";
import FriendButton from "@/components/social/FriendButton";

// Fresh action spies per test — vi.clearAllMocks between runs.
let actions;
beforeEach(() => {
  actions = {
    sendRequest:     vi.fn(async () => {}),
    cancelRequest:   vi.fn(async () => {}),
    acceptRequest:   vi.fn(async () => {}),
    declineRequest:  vi.fn(async () => {}),
    unfriend:        vi.fn(async () => {}),
    startChat:       vi.fn(async () => null),
  };
  useProfileActions.mockReturnValue(actions);
  vi.clearAllMocks();
});

function stubRelationship(partial) {
  useRelationship.mockReturnValue({
    state: partial,
    loading: false,
    refetch: vi.fn(),
  });
}

// Shortcut: render + return the rendered root to query against.
function renderIt(props = {}) {
  return render(<FriendButton userId="u-target" {...props} />);
}

// ════════════════════════════════════════════════════════════
// Hidden states
// ════════════════════════════════════════════════════════════

describe("FriendButton — hidden states", () => {
  it("renders nothing for self", () => {
    stubRelationship({ self: true, friendship: null, blocked: false, canMessage: false });
    const { container } = renderIt();
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when blocked by me", () => {
    stubRelationship({ self: false, friendship: "accepted", blocked: "by_me", canMessage: false });
    const { container } = renderIt();
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when blocked by them", () => {
    stubRelationship({ self: false, friendship: null, blocked: "by_them", canMessage: false });
    const { container } = renderIt();
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when userId is empty", () => {
    stubRelationship({ self: false, friendship: null, blocked: false, canMessage: true });
    const { container } = renderIt({ userId: "" });
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing while loading with no cached state (avoids flash)", () => {
    useRelationship.mockReturnValue({ state: null, loading: true, refetch: vi.fn() });
    const { container } = renderIt();
    expect(container.firstChild).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════
// null friendship → Add Friend
// ════════════════════════════════════════════════════════════

describe("FriendButton — null friendship", () => {
  beforeEach(() => {
    stubRelationship({ self: false, friendship: null, blocked: false, canMessage: true });
  });

  it("renders '+ Add Friend'", () => {
    renderIt();
    expect(screen.getByRole("button", { name: /send friend request/i })).toBeInTheDocument();
    expect(screen.getByText(/add friend/i)).toBeInTheDocument();
  });

  it("clicking fires sendRequest", () => {
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: /send friend request/i }));
    expect(actions.sendRequest).toHaveBeenCalledTimes(1);
  });
});

// ════════════════════════════════════════════════════════════
// pending_sent → Requested (click to cancel)
// ════════════════════════════════════════════════════════════

describe("FriendButton — pending_sent", () => {
  beforeEach(() => {
    stubRelationship({ self: false, friendship: "pending_sent", blocked: false, canMessage: false });
  });

  it("renders 'Requested ✓'", () => {
    renderIt();
    expect(screen.getByText(/requested/i)).toBeInTheDocument();
  });

  it("clicking fires cancelRequest", () => {
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: /cancel friend request/i }));
    expect(actions.cancelRequest).toHaveBeenCalledTimes(1);
    expect(actions.sendRequest).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════
// pending_received → Accept + Decline
// ════════════════════════════════════════════════════════════

describe("FriendButton — pending_received", () => {
  beforeEach(() => {
    stubRelationship({ self: false, friendship: "pending_received", blocked: false, canMessage: false, friendshipId: "fr-1" });
  });

  it("renders TWO buttons (Accept + Decline)", () => {
    renderIt();
    expect(screen.getByRole("button", { name: /^accept$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^decline$/i })).toBeInTheDocument();
  });

  it("Accept fires acceptRequest", () => {
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: /^accept$/i }));
    expect(actions.acceptRequest).toHaveBeenCalledTimes(1);
    expect(actions.declineRequest).not.toHaveBeenCalled();
  });

  it("Decline fires declineRequest", () => {
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: /^decline$/i }));
    expect(actions.declineRequest).toHaveBeenCalledTimes(1);
  });
});

// ════════════════════════════════════════════════════════════
// accepted → Friends ✓ (hover = Unfriend)
// ════════════════════════════════════════════════════════════

describe("FriendButton — accepted", () => {
  beforeEach(() => {
    stubRelationship({ self: false, friendship: "accepted", blocked: false, canMessage: true, friendshipId: "fr-1" });
    // window.confirm mock — default to YES so unfriend test can run.
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("renders 'Friends ✓' by default", () => {
    renderIt();
    expect(screen.getByText(/friends ✓/i)).toBeInTheDocument();
  });

  it("clicking (after confirm) fires unfriend", () => {
    renderIt();
    fireEvent.click(screen.getByRole("button"));
    expect(actions.unfriend).toHaveBeenCalledTimes(1);
  });

  it("doesn't unfriend when the user dismisses the confirm dialog", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderIt();
    fireEvent.click(screen.getByRole("button"));
    expect(actions.unfriend).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════
// onChange callback
// ════════════════════════════════════════════════════════════

describe("FriendButton — onChange", () => {
  it("fires onChange after a successful action", async () => {
    stubRelationship({ self: false, friendship: null, blocked: false, canMessage: true });
    const onChange = vi.fn();
    renderIt({ onChange });
    fireEvent.click(screen.getByRole("button", { name: /send friend request/i }));
    // Let the async run tick through
    await new Promise((r) => setTimeout(r, 0));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
