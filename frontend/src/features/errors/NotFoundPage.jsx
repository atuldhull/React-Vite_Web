import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuthStore } from "@/store/auth-store";
import { dashboardForRole } from "@/lib/roles";
import AuroraMesh from "@/components/backgrounds/AuroraMesh";

// Background math symbols that drift / pulse so the page reads alive
// instead of a static error screen. Each gets an independent animation
// so they don't sync up into a single beat.
const SYMBOLS = [
  { ch: "∫", left: "8%",  top: "18%", size: "10rem", delay: 0,    drift: 14 },
  { ch: "Σ", left: "82%", top: "22%", size: "9rem",  delay: 1.2,  drift: 10 },
  { ch: "π", left: "12%", top: "70%", size: "7.5rem",delay: 0.6,  drift: 12 },
  { ch: "∞", left: "85%", top: "75%", size: "9.5rem",delay: 1.8,  drift: 16 },
  { ch: "ϕ", left: "50%", top: "10%", size: "6rem",  delay: 2.4,  drift: 8  },
  { ch: "∇", left: "48%", top: "85%", size: "7rem",  delay: 0.9,  drift: 11 },
];

export default function NotFoundPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const isAuth = status === "authenticated" && user;
  const homePath = isAuth ? dashboardForRole(user.role) : "/";

  return (
    <div className="relative">
      <AuroraMesh palette="primary" intensity={0.5} />

      {/* Floating math symbols, low-opacity, drifting */}
      {SYMBOLS.map((s, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          initial={{ opacity: 0, y: 30 }}
          animate={{
            opacity: [0, 0.10, 0.07, 0.10],
            y: [0, -s.drift, 0, s.drift, 0],
          }}
          transition={{
            duration: 12 + i * 1.2,
            delay: s.delay,
            repeat: Infinity,
            ease: "easeInOut",
            opacity: { duration: 2, delay: s.delay },
          }}
          className="math-text pointer-events-none absolute select-none text-white"
          style={{
            left: s.left,
            top: s.top,
            fontSize: s.size,
            transform: "translate(-50%, -50%)",
            mixBlendMode: "screen",
          }}
        >
          {s.ch}
        </motion.span>
      ))}

      <div className="relative z-10 flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="font-mono text-[11px] uppercase tracking-[0.42em] text-primary/85"
        >
          Error 404 · Undefined route
        </motion.p>

        {/* Big stylised 4-0-4 with the zero rendered as an animated
            infinity-style ring — visual hook so the page feels
            crafted instead of a default browser 404. */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 flex items-center justify-center gap-3 font-display sm:gap-5"
        >
          <span className="text-[7rem] font-extrabold leading-none tracking-[-0.08em] text-white drop-shadow-[0_8px_30px_rgba(124,58,237,0.35)] sm:text-[10rem]">4</span>
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 16, ease: "linear", repeat: Infinity }}
            className="relative inline-block h-[6rem] w-[6rem] sm:h-[9rem] sm:w-[9rem]"
          >
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: "conic-gradient(from 0deg, var(--color-primary, #8352ff), var(--color-secondary, #23c1ff), var(--color-glow, #6ee7ff), var(--color-primary, #8352ff))",
                opacity: 0.25,
                filter: "blur(2px)",
              }}
            />
            <span
              className="absolute inset-[8%] rounded-full border-[6px] sm:border-[10px]"
              style={{ borderColor: "rgb(var(--color-primary))" }}
            />
            <span
              className="absolute inset-[40%] rounded-full"
              style={{ background: "rgb(var(--color-glow))", opacity: 0.85, filter: "blur(2px)" }}
            />
          </motion.span>
          <span className="text-[7rem] font-extrabold leading-none tracking-[-0.08em] text-white drop-shadow-[0_8px_30px_rgba(124,58,237,0.35)] sm:text-[10rem]">4</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.7 }}
          className="mt-8 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
        >
          Lost in the void.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.7 }}
          className="mt-3 max-w-md text-sm leading-7 text-text-muted sm:text-base"
        >
          This route doesn&rsquo;t exist on the Math Collective.
          <span className="block opacity-70">Even Euler couldn&rsquo;t find a function for it.</span>
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.7 }}
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          <motion.button
            onClick={() => navigate(-1)}
            whileHover={{ y: -2, scale: 1.02, transition: { type: "spring", stiffness: 420, damping: 24 } }}
            whileTap={{ scale: 0.96 }}
            className="rounded-full border border-line/20 bg-white/[0.04] px-6 py-2.5 font-mono text-[11px] uppercase tracking-[0.24em] text-text-muted backdrop-blur transition-colors hover:border-line/35 hover:text-white"
          >
            ← Go back
          </motion.button>
          <motion.div
            whileHover={{ y: -2, scale: 1.02, transition: { type: "spring", stiffness: 420, damping: 24 } }}
            whileTap={{ scale: 0.96 }}
          >
            <Link
              to={homePath}
              className="inline-block rounded-full border border-primary/40 bg-primary/15 px-6 py-2.5 font-mono text-[11px] uppercase tracking-[0.24em] text-white backdrop-blur transition hover:bg-primary/25"
            >
              {isAuth ? "To dashboard →" : "Home →"}
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
