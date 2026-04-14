/**
 * MessageButton — opens the ChatPanel pre-targeted at a specific
 * user's 1-to-1 conversation.
 *
 * Uses the ui-store chat-panel handle (openChatWith) rather than
 * navigating to a separate route — the existing slide-out panel is
 * where messaging actually lives, and opening a new page just to
 * land in the same panel would be double work for the user.
 *
 * Visibility / enabled state
 * ──────────────────────────
 * Rendering rules exactly match FriendButton's except we additionally
 * GATE on `canMessage`:
 *   - self           → hidden (can't DM yourself)
 *   - blocked        → hidden (either direction)
 *   - canMessage=false → hidden (target's allow_messages_from blocks this)
 *   - otherwise      → "Message" button
 *
 * Design note: we deliberately DON'T render a disabled-state button
 * when canMessage=false. A greyed-out "Message" button creates a
 * "why can't I?" question the UI can't answer without leaking the
 * target's privacy settings. Hiding avoids that entire class of
 * awkward interaction.
 */

import { useRelationship } from "@/hooks/useRelationship";
import { useUiStore } from "@/store/ui-store";
import Button from "@/components/ui/Button";

/**
 * @param {{
 *   userId: string,
 *   size?: "sm" | "md" | "lg",
 *   variant?: "primary" | "secondary" | "ghost",
 *   label?: string,
 * }} props
 */
export default function MessageButton({ userId, size = "sm", variant = "secondary", label = "Message" }) {
  const { state, loading } = useRelationship(userId);
  const openChatWith = useUiStore((s) => s.openChatWith);

  if (!userId)              return null;
  if (loading && !state)    return null;
  if (!state)               return null;
  if (state.self)           return null;
  if (state.blocked)        return null;
  if (!state.canMessage)    return null;

  return (
    <Button
      size={size}
      variant={variant}
      onClick={() => openChatWith(userId)}
      aria-label={`Message this user`}
    >
      💬 {label}
    </Button>
  );
}
