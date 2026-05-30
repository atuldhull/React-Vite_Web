/**
 * useDeviceTier — single source of truth for the "how much animation
 * can this device afford?" decision.
 *
 * Returns one of: "high" | "mid" | "low".
 *
 *   high — desktop/laptop or capable tablet. Default. Full effects:
 *          postprocessing pipeline on, particle counts at FULL_*
 *          constants, framer-motion at full fidelity.
 *   mid  — small/mid-range device. Trim particles, drop post-process
 *          extras, dial back GSAP stagger.
 *   low  — weak phone / explicit reduced-motion preference. Strip the
 *          heaviest layers (3D scenes, ambient cursor glow, particle
 *          systems), keep only essential transitions.
 *
 * Detection (one-shot at mount — we don't re-tier on resize):
 *
 *   1. prefers-reduced-motion=reduce  → low (user preference wins,
 *                                            even on a beefy desktop)
 *   2. navigator.deviceMemory ≤ 2GB    → low
 *   3. navigator.hardwareConcurrency<=4 AND viewport<768  → low
 *   4. viewport < 768                  → mid (mid-range phone)
 *   5. else                            → high
 *
 * Why one-shot: re-running quality checks on rotate / resize causes
 * visible reflows in any consumer that keys an effect on the tier
 * (LibraryScene tears down WebGL contexts, etc.). A user changing
 * orientation isn't expecting their hero to re-initialize.
 *
 * LibraryScene already does its OWN tier check inline (predates this
 * hook). It can stay — they should produce the same answer, and the
 * downside of two paths is small. New consumers should use this hook.
 */

import { useEffect, useState } from "react";

function classify() {
  if (typeof window === "undefined") return "high";   // SSR safety

  // User preference: reduced-motion always wins.
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return "low";
  }

  // navigator.deviceMemory — reported in GiB rounded down. Chrome /
  // Edge / Opera support it; Safari + Firefox don't (returns undefined).
  // Treat missing as "not low signal", fall through to the next check.
  const mem = navigator.deviceMemory;
  if (typeof mem === "number" && mem <= 2) return "low";

  // hardwareConcurrency — count of logical CPU cores. Widely supported.
  const cores  = navigator.hardwareConcurrency || 8;
  const width  = window.innerWidth || 1024;
  const isPhone = width < 768;

  if (isPhone && cores <= 4) return "low";   // weak phone
  if (isPhone)               return "mid";   // capable phone / small tablet
  return "high";
}

export function useDeviceTier() {
  // Initialise synchronously so the FIRST render already has the right
  // value — avoids a flash of "high tier" content on a low-tier device
  // before the effect runs.
  const [tier, setTier] = useState(classify);

  useEffect(() => {
    // Re-classify ONCE post-mount in case the SSR fallback set "high"
    // but the client is actually low.
    const next = classify();
    setTier((prev) => (prev === next ? prev : next));

    // Listen for runtime reduced-motion preference flips. Other inputs
    // (deviceMemory, hardwareConcurrency) don't change without a
    // reload, so we don't bother polling them.
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const onChange = () => setTier(classify());
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  return tier;
}
