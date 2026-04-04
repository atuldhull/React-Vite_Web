import { useEffect } from "react";
import Lenis from "lenis";

export function useSmoothScroll(enabled) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const lenis = new Lenis({
      lerp: 0.085,
      duration: 1.15,
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 0.95,
    });

    let frameId = 0;

    const raf = (time) => {
      lenis.raf(time);
      frameId = window.requestAnimationFrame(raf);
    };

    frameId = window.requestAnimationFrame(raf);

    return () => {
      window.cancelAnimationFrame(frameId);
      lenis.destroy();
    };
  }, [enabled]);
}
