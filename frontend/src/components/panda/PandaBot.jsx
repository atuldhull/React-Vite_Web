import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import PandaChatPanel from "./PandaChatPanel";

export default function PandaBot() {
  const [open, setOpen] = useState(false);
  const [jumping, setJumping] = useState(false);

  const toggle = useCallback(() => {
    if (!open) {
      setJumping(true);
      setTimeout(() => { setJumping(false); setOpen(true); }, 600);
    } else {
      setOpen(false);
    }
  }, [open]);

  return (
    <>
      <PandaChatPanel open={open} />

      {/* The panda face itself IS the floating bot — no circle container */}
      <div className="fixed bottom-5 right-5 z-50">
        {/* Shadow underneath */}
        <motion.div
          animate={open ? { opacity: 0.15, scale: 0.7 } : jumping ? { opacity: 0.05, scale: 0.5 } : { opacity: [0.12, 0.2, 0.12], scale: [0.8, 0.85, 0.8] }}
          transition={jumping ? { duration: 0.3 } : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-2 left-1/2 h-4 w-14 -translate-x-1/2 rounded-full bg-black/60 blur-md"
        />

        {/* Float + jump wrapper */}
        <motion.div
          animate={
            jumping
              ? { y: [0, -40, -45, 0, -12, 0], rotate: [0, -8, 10, -5, 3, 0], scale: [1, 1.1, 1.15, 0.9, 1.05, 1] }
              : open
                ? { y: 0 }
                : { y: [0, -8, 0], rotate: [0, 2, -1.5, 0] }
          }
          transition={
            jumping
              ? { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
              : open
                ? { duration: 0.3 }
                : { duration: 3.5, repeat: Infinity, ease: "easeInOut" }
          }
        >
          <motion.button
            onClick={toggle}
            whileHover={{ scale: 1.15, y: -4 }}
            whileTap={{ scale: 0.85 }}
            className="relative flex items-center justify-center cursor-pointer border-0 p-0 outline-none"
            style={{
              width: 56,
              height: 56,
              clipPath: "var(--clip-hex)",
              background: "#000d1a",
              border: "1.5px solid var(--monument-abyss)",
              boxShadow: "0 0 20px rgba(0,255,200,0.3)",
              filter: "drop-shadow(0 8px 20px rgba(0,255,200,0.2)) drop-shadow(0 2px 8px rgba(0,0,0,0.3))",
            }}
            aria-label="Toggle PANDA AI"
          >
            <AnimatePresence mode="wait">
              {open ? (
                /* When open: show X on the panda */
                <motion.div
                  key="open"
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 90 }}
                  transition={{ type: "spring", bounce: 0.3 }}
                  className="relative"
                >
                  <span className="block text-[32px] leading-none opacity-40">🐼</span>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="h-7 w-7 text-white drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                </motion.div>
              ) : (
                /* When closed: the panda face, big and expressive */
                <motion.div
                  key="closed"
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 30 }}
                  transition={{ type: "spring", bounce: 0.5 }}
                >
                  <motion.span
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="block text-[32px] leading-none"
                  >
                    🐼
                  </motion.span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </motion.div>

        {/* Label */}
        <motion.p
          animate={open ? { opacity: 0 } : { opacity: 1 }}
          className="mt-0.5 text-center font-mono text-[7px] font-bold uppercase tracking-[0.2em]"
          style={{ color: "var(--monument-abyss)", opacity: 0.7 }}
        >
          PANDA AI
        </motion.p>
      </div>
    </>
  );
}
