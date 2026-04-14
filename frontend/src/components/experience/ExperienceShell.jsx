import { useEffect, useState } from "react";
import PandaBot from "@/components/panda/PandaBot";
import InteractiveCursor from "@/components/experience/InteractiveCursor";
import LoadingScreen from "@/components/experience/LoadingScreen";
import HovercardRoot from "@/components/social/HovercardRoot";
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
      {/* Phase 15: single-portal hovercard — listens to hovercard-store
          and renders the currently-shown card anchored via portal.
          Zero cost when no card is open (returns null). */}
      <HovercardRoot />
    </>
  );
}
