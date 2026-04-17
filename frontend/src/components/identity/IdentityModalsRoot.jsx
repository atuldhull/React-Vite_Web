/**
 * IdentityModalsRoot — single mount point for the identity modals.
 * Sits next to HovercardRoot inside ExperienceShell.
 *
 * Rules:
 *   - Does nothing until identity-store is hydrated. Hydration fires
 *     automatically on first use via useIdentityStore.getState().hydrate().
 *   - Ceremony modal shows when:
 *       • status = "missing" AND the user has clicked ChatButton
 *         (tracked via a "requested" flag in ui-store — we don't
 *         want to nag users who never open chat).
 *       • status = "forging" (phrase is being shown).
 *   - Restore modal is opened on demand by a link inside the
 *     ceremony modal's intro ("I already have a phrase").
 */

// @ts-check

import { useEffect, useState } from "react";
import { useIdentityStore } from "@/store/identity-store";
import { useUiStore } from "@/store/ui-store";
import IdentityCeremonyModal from "@/components/identity/IdentityCeremonyModal";
import RestoreIdentityModal from "@/components/identity/RestoreIdentityModal";

export default function IdentityModalsRoot() {
  const status = useIdentityStore((s) => s.status);
  const hydrate = useIdentityStore((s) => s.hydrate);
  const chatPanelOpen = useUiStore((s) => s.chatPanel.open);
  const [restoreOpen, setRestoreOpen] = useState(false);

  // Hydrate once on mount. Hydrate itself is idempotent and no-ops
  // after the first call that transitions status out of "unknown".
  useEffect(() => { hydrate(); }, [hydrate]);

  // Only show ceremony if the user has actually engaged with chat
  // (chat panel is open) AND we know they're missing identity.
  // This prevents the forge prompt from nagging users who never
  // touch chat — they can skip it indefinitely by not opening the
  // chat panel.
  const shouldShowCeremony =
    chatPanelOpen && (status === "missing" || status === "forging");

  return (
    <>
      {shouldShowCeremony && (
        <IdentityCeremonyModal onRestoreRequest={() => setRestoreOpen(true)} />
      )}
      <RestoreIdentityModal open={restoreOpen} onClose={() => setRestoreOpen(false)} />
    </>
  );
}
