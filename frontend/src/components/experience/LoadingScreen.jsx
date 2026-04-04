import { AnimatePresence, motion } from "framer-motion";
import Loader from "@/components/ui/Loader";

export default function LoadingScreen({ visible }) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.55, ease: "easeOut" } }}
          className="pointer-events-none fixed inset-0 z-[90] overflow-hidden bg-obsidian"
        >
          <div className="absolute inset-0 bg-mesh-radial opacity-90" />
          <div className="absolute inset-0 bg-panel-grid bg-[size:150px_150px] opacity-20" />
          <div className="absolute left-1/2 top-1/2 h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/14 blur-3xl" />

          <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-mono text-[11px] uppercase tracking-[0.42em] text-primary/85"
            >
              Boot sequence
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.7 }}
              className="mt-5 font-display text-4xl font-extrabold tracking-[-0.08em] text-white sm:text-6xl"
            >
              Math Collective
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14, duration: 0.7 }}
              className="mt-4 max-w-2xl text-sm leading-8 text-text-muted sm:text-base"
            >
              Warming the visual engine, calibrating motion fields, and syncing the
              immersive interface layer.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="mt-10 flex flex-col items-center gap-5 rounded-[2rem] border border-line/20 bg-surface/55 px-8 py-7 shadow-panel backdrop-blur-2xl"
            >
              <Loader variant="orbit" size="lg" label="stabilizing" />
              <div className="h-1.5 w-56 overflow-hidden rounded-full bg-white/8">
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: "140%" }}
                  transition={{ duration: 1.3, ease: "easeInOut", repeat: Infinity }}
                  className="h-full w-1/2 rounded-full bg-gradient-to-r from-primary via-secondary to-glow"
                />
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
