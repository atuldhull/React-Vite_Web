import { useEffect, useState } from "react";
import PandaBot from "@/components/panda/PandaBot";
import InteractiveCursor from "@/components/experience/InteractiveCursor";
import LoadingScreen from "@/components/experience/LoadingScreen";
import HovercardRoot from "@/components/social/HovercardRoot";
import ChatButton from "@/components/chat/ChatButton";
import IdentityModalsRoot from "@/components/identity/IdentityModalsRoot";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { useScrollEffects } from "@/hooks/useScrollEffects";
import { useSmoothScroll } from "@/hooks/useSmoothScroll";

export default function ExperienceShell({ children }) {
  const reducedMotion = useReducedMotionPreference();
  const [booting, setBooting] = useState(true);

  useSmoothScroll(!reducedMotion);
  useScrollEffects(!reducedMotion && !booting);

  useEffect(() => {
    if (reducedMotion) {
      setBooting(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setBooting(false);
    }, 1500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [reducedMotion]);

  return (
    <>
      <LoadingScreen visible={booting} />
      <InteractiveCursor enabled={!reducedMotion} />
      {children}
      <PandaBot />
      {/* Floating messages button for any logged-in user. Hidden when
          guest/loading — the auth gate lives inside ChatButton itself.
          Opens the slide-out chat panel which handles conversations
          list, friend search, and pending requests. */}
      <ChatButton />
      {/* Single-portal hovercard — listens to hovercard-store and
          renders the currently-shown card anchored via portal. Zero
          cost when no card is open (returns null). */}
      <HovercardRoot />
      {/* Identity ceremony + restore modals. Only shows to users
          who've opened chat but haven't forged their identity yet. */}
      <IdentityModalsRoot />
    </>
  );
}
