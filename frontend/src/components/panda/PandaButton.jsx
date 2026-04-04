import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useRef } from "react";
import { OrbitRing, RippleBurst } from "./PandaAnimations";

export default function PandaButton({ open, onClick, launching }) {
  const ref = useRef(null);

  // Magnetic hover
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 150, damping: 15 });
  const springY = useSpring(mouseY, { stiffness: 150, damping: 15 });

  const handleMouseMove = (e) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    mouseX.set((e.clientX - cx) * 0.15);
    mouseY.set((e.clientY - cy) * 0.15);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <div
      ref={ref}
      className="fixed bottom-7 right-7 z-50"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ width: 80, height: 80 }}
    >
      {/* Orbit ring */}
      <OrbitRing size={80} active={open} />

      {/* Ripple burst on launch */}
      <RippleBurst active={launching} />

      {/* Breathing glow */}
      <motion.div
        animate={{
          boxShadow: open
            ? "0 0 40px rgba(131,82,255,0.4), 0 0 80px rgba(110,231,255,0.15)"
            : [
                "0 0 20px rgba(131,82,255,0.2), 0 0 40px rgba(110,231,255,0.08)",
                "0 0 35px rgba(131,82,255,0.35), 0 0 60px rgba(110,231,255,0.15)",
                "0 0 20px rgba(131,82,255,0.2), 0 0 40px rgba(110,231,255,0.08)",
              ],
        }}
        transition={open ? { duration: 0.3 } : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0 rounded-full"
      />

      {/* Floating animation wrapper */}
      <motion.div
        animate={open ? {} : { y: [0, -6, 0], rotate: [0, 1.5, -1, 0] }}
        transition={open ? {} : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0"
      >
        <motion.button
          onClick={onClick}
          style={{ x: springX, y: springY }}
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.88 }}
          className="relative flex h-full w-full items-center justify-center rounded-full"
          aria-label="Toggle PANDA AI"
        >
          {/* Button background */}
          <motion.div
            animate={open ? { scale: 1 } : { scale: [1, 1.04, 1] }}
            transition={open ? {} : { duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 rounded-full bg-gradient-to-br from-[#1a0a30] via-[#0f0820] to-[#0a1525] border-2 border-primary/30"
          />

          {/* Panda face */}
          <motion.div
            animate={open ? { scale: 0.8, opacity: 0 } : { scale: 1, opacity: 1 }}
            className="relative z-10 flex flex-col items-center"
          >
            {/* Ears */}
            <div className="absolute -top-2.5 flex w-10 justify-between">
              <div className="h-4 w-4 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.3)]" />
              <div className="h-4 w-4 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.3)]" />
            </div>
            {/* Face */}
            <div className="relative mt-1.5 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.2)]">
              {/* Eye patches */}
              <div className="absolute flex w-8 justify-between" style={{ top: 10 }}>
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#1a1a2e]">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                    className="h-1.5 w-1.5 rounded-full bg-white"
                  />
                </div>
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#1a1a2e]">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                    className="h-1.5 w-1.5 rounded-full bg-white"
                  />
                </div>
              </div>
              {/* Nose */}
              <div className="absolute bottom-2 h-1.5 w-2.5 rounded-full bg-[#1a1a2e]" />
            </div>
          </motion.div>

          {/* Close icon */}
          <motion.svg
            animate={open ? { scale: 1, opacity: 1, rotate: 0 } : { scale: 0, opacity: 0, rotate: -180 }}
            transition={{ type: "spring", bounce: 0.3 }}
            className="absolute h-7 w-7 text-white"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </motion.svg>
        </motion.button>
      </motion.div>

      {/* Label */}
      <motion.div
        initial={false}
        animate={open ? { opacity: 0, y: 5 } : { opacity: 1, y: 0 }}
        className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap"
      >
        <span className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-primary/70">
          PANDA
        </span>
      </motion.div>
    </div>
  );
}
