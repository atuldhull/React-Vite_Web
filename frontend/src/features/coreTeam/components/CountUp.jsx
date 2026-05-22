import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useReducedMotion } from "framer-motion";

/**
 * CountUp — GSAP-driven number roll-up. Respects reduced-motion by
 * snapping straight to the final value.
 */
export default function CountUp({ value = 0, className }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();

  useGSAP(() => {
    if (!ref.current) return;
    if (reduced) { ref.current.textContent = String(value); return; }
    const obj = { n: 0 };
    gsap.to(obj, {
      n: value,
      duration: 1.3,
      ease: "power2.out",
      onUpdate: () => { if (ref.current) ref.current.textContent = String(Math.round(obj.n)); },
    });
  }, [value, reduced]);

  return <span ref={ref} className={className}>0</span>;
}
