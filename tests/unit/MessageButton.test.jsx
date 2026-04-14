// @vitest-environment jsdom
/**
 * Unit tests for MessageButton.
 *
 * MessageButton is simpler than FriendButton — one state-machine
 * branch ("render or don't"), one click handler (open chat panel
 * pre-targeted). But the hidden states matter: if the "Message"
 * button renders on a self-view or when the target has blocked
 * messages, it signals wrong affordances to the user.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/hooks/useRelationship", () => ({ useRelationship: vi.fn() }));

// Use the real ui-store so we can assert its state after click
// rather than mocking it. That way a test failure catches if the
// wiring between click → store is broken at either end.
import { useRelationship } from "@/hooks/useRelationship";
import { useUiStore } from "@/store/ui-store";
import MessageButton from "@/components/social/MessageButton";

beforeEach(() => {
  useUiStore.setState({ chatPanel: { open: false, targetUserId: null } });
  vi.clearAllMocks();
});

function stubRelationship(partial) {
  useRelationship.mockReturnValue({ state: partial, loading: false, refetch: vi.fn() });
}

// ════════════════════════════════════════════════════════════
// Hidden states
// ════════════════════════════════════════════════════════════

describe("MessageButton — hidden states", () => {
  it("hides for self", () => {
    stubRelationship({ self: true, friendship: null, blocked: false, canMessage: false });
    const { container } = render(<MessageButton userId="u-x" />);
    expect(container.firstChild).toBeNull();
  });

  it("hides when canMessage=false (target's settings block DMs from non-friends)", () => {
    stubRelationship({ self: false, friendship: null, blocked: false, canMessage: false });
    const { container } = render(<MessageButton userId="u-x" />);
    expect(container.firstChild).toBeNull();
  });

  it("hides when blocked (either direction)", () => {
    stubRelationship({ self: false, friendship: "accepted", blocked: "by_me", canMessage: false });
    const { container } = render(<MessageButton userId="u-x" />);
    expect(container.firstChild).toBeNull();
  });

  it("hides when userId is empty", () => {
    stubRelationship({ self: false, friendship: null, blocked: false, canMessage: true });
    const { container } = render(<MessageButton userId="" />);
    expect(container.firstChild).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════
// Visible + click
// ════════════════════════════════════════════════════════════

describe("MessageButton — visible + click", () => {
  beforeEach(() => {
    stubRelationship({ self: false, friendship: "accepted", blocked: false, canMessage: true });
  });

  it("renders a 'Message' button when canMessage=true", () => {
    render(<MessageButton userId="u-target" />);
    expect(screen.getByText(/message/i)).toBeInTheDocument();
  });

  it("clicking opens the chat panel pre-targeted to this user", () => {
    render(<MessageButton userId="u-target" />);
    fireEvent.click(screen.getByRole("button"));
    const { chatPanel } = useUiStore.getState();
    expect(chatPanel.open).toBe(true);
    expect(chatPanel.targetUserId).toBe("u-target");
  });

  it("respects a custom label prop", () => {
    render(<MessageButton userId="u-target" label="Say hi" />);
    expect(screen.getByText(/say hi/i)).toBeInTheDocument();
  });
});
