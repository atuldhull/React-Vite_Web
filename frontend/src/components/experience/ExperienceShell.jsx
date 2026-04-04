import { useEffect, useState } from "react";
import PandaBot from "@/components/panda/PandaBot";
import InteractiveCursor from "@/components/experience/InteractiveCursor";
import LoadingScreen from "@/components/experience/LoadingScreen";
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
    </>
  );
}
