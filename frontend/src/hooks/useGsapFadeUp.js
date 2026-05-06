import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "@/lib/gsap-setup";

/**
 * useGsapFadeUp — drop-in entrance animation for any page or section.
 *
 * Usage:
 *   const ref = useGsapFadeUp();
 *   return <div ref={ref}>...content with [data-fade] attrs...</div>;
 *
 * Behaviour: every descendant element with the `data-fade` attribute
 * is faded in from below with a small stagger. Optionally drives an
 * additional pass on `[data-fade-bold]` elements (longer travel,
 * later start) for hero / heading bands.
 *
 * Why a hook + data-attrs (vs animating refs directly):
 *   - Pages can add `data-fade` to whatever cards/sections they like
 *     without adding a ref + import to each one.
 *   - useGSAP's `scope` ensures the cleanup function only kills tweens
 *     created inside the page when navigating away — neighbouring
 *     animations are unaffected.
 *
 * @param {object} [opts]
 * @param {number} [opts.delay=0] Extra delay before the first tween.
 * @param {number} [opts.stagger=0.08] Per-element delay between tweens.
 * @returns {React.MutableRefObject} Attach to the page's root element.
 */
export function useGsapFadeUp(opts = {}) {
  const { delay = 0, stagger = 0.08 } = opts;
  const ref = useRef(null);

  useGSAP(() => {
    const root = ref.current;
    if (!root) return;
    const fades = root.querySelectorAll("[data-fade]");
    if (fades.length) {
      gsap.from(fades, {
        autoAlpha: 0,
        y: 28,
        duration: 0.7,
        ease: "power3.out",
        delay,
        stagger,
      });
    }
    const bolds = root.querySelectorAll("[data-fade-bold]");
    if (bolds.length) {
      gsap.from(bolds, {
        autoAlpha: 0,
        y: 60,
        scale: 0.96,
        duration: 1.1,
        ease: "expo.out",
        delay: delay + 0.05,
        stagger: stagger * 1.5,
      });
    }
  }, { scope: ref });

  return ref;
}
