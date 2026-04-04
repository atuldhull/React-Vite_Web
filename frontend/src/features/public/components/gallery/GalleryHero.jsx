import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

export default function GalleryHero() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 150]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.85]);
  const blur = useTransform(scrollYProgress, [0, 1], [0, 8]);

  return (
    <motion.section
      ref={ref}
      style={{ y, opacity, scale }}
      className="relative flex min-h-[70vh] flex-col items-center justify-center px-4 text-center"
    >
      <motion.div style={{ filter: blur.get ? undefined : undefined }}>
        <motion.p
          initial={{ opacity: 0, y: 20, letterSpacing: "0.1em" }}
          animate={{ opacity: 1, y: 0, letterSpacing: "0.6em" }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
          className="font-mono text-[11px] uppercase text-success"
        >
          Moments Captured
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.15, duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-7 font-display text-[clamp(3.5rem,10vw,8rem)] font-extrabold leading-[0.9] tracking-[-0.06em] text-white"
        >
          Club
          <br />
          <span className="bg-gradient-to-r from-primary via-secondary to-glow bg-clip-text text-transparent">
            Gallery
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 1 }}
          className="mx-auto mt-6 max-w-md text-lg italic text-text-muted"
        >
          Memories etched in time
        </motion.p>

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.8, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto mt-8 h-[2px] w-52 bg-gradient-to-r from-transparent via-primary/60 to-transparent"
        />

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="mt-14 flex flex-col items-center gap-2"
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-text-dim">Scroll to explore</span>
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className="h-9 w-5 rounded-full border border-line/30">
            <motion.div animate={{ y: [3, 16, 3] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="mx-auto mt-1.5 h-2 w-1 rounded-full bg-primary/60" />
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.section>
  );
}
