import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { useUiStore } from "@/store/ui-store";

export default function InteractiveCursor({ enabled }) {
  const cursorMode = useUiStore((state) => state.cursorMode);
  const setCursorMode = useUiStore((state) => state.setCursorMode);
  const [isActive, setIsActive] = useState(false);

  const pointerX = useMotionValue(-120);
  const pointerY = useMotionValue(-120);
  const glowX = useSpring(pointerX, { stiffness: 210, damping: 26, mass: 0.45 });
  const glowY = useSpring(pointerY, { stiffness: 210, damping: 26, mass: 0.45 });
  const coreX = useSpring(pointerX, { stiffness: 360, damping: 32, mass: 0.2 });
  const coreY = useSpring(pointerY, { stiffness: 360, damping: 32, mass: 0.2 });

  useEffect(() => {
    if (!enabled || !window.matchMedia("(pointer:fine)").matches) {
      return undefined;
    }

    const onMove = (event) => {
      pointerX.set(event.clientX);
      pointerY.set(event.clientY);
      setIsActive(true);
    };

    const onPointerOver = (event) => {
      const interactive = event.target.closest(
        "button, a, input, textarea, [data-cursor='interactive']",
      );

      setCursorMode(interactive ? "interactive" : "ambient");
    };

    const onLeave = () => {
      setCursorMode("ambient");
      setIsActive(false);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("mouseleave", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, [enabled, pointerX, pointerY, setCursorMode]);

  if (!enabled) {
    return null;
  }

  const expanded = cursorMode === "interactive";

  return (
    <div className="pointer-events-none fixed inset-0 z-[80] hidden lg:block">
      <motion.div
        className="fixed left-0 top-0 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/18 blur-2xl"
        style={{ x: glowX, y: glowY }}
        animate={{
          width: expanded ? 96 : 64,
          height: expanded ? 96 : 64,
          opacity: isActive ? 0.9 : 0,
        }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      />
      <motion.div
        className="fixed left-0 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-white/80"
        style={{ x: coreX, y: coreY }}
        animate={{
          width: expanded ? 18 : 12,
          height: expanded ? 18 : 12,
          opacity: isActive ? 1 : 0,
          backgroundColor: expanded ? "rgba(var(--color-glow), 0.92)" : "rgba(var(--color-text-primary), 0.88)",
        }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      />
    </div>
  );
}
