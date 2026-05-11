import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuthStore } from "@/store/auth-store";
import { dashboardForRole } from "@/lib/roles";
import AuroraMesh from "@/components/backgrounds/AuroraMesh";

export default function ForbiddenPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const isAuth = status === "authenticated" && user;
  const homePath = isAuth ? dashboardForRole(user.role) : "/";

  return (
    <div className="relative">
      <AuroraMesh palette="danger" intensity={0.45} />

      <div className="relative z-10 flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="font-mono text-[11px] uppercase tracking-[0.42em] text-danger/90"
        >
          Error 403 · Permission denied
        </motion.p>

        {/* Stylised lock icon + "403" — the lock pulses subtly so the
            page reads alive rather than a static rejection. */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 flex items-center justify-center gap-4 font-display sm:gap-6"
        >
          <span className="text-[6.5rem] font-extrabold leading-none tracking-[-0.08em] text-white drop-shadow-[0_8px_30px_rgba(239,68,68,0.35)] sm:text-[9.5rem]">4</span>

          <motion.div
            animate={{ y: [0, -6, 0], rotate: [-1, 1, -1] }}
            transition={{ duration: 4, ease: "easeInOut", repeat: Infinity }}
            className="relative flex h-[6rem] w-[6rem] items-center justify-center sm:h-[8.5rem] sm:w-[8.5rem]"
          >
            {/* Pulsing aura behind the lock */}
            <motion.span
              animate={{ scale: [1, 1.18, 1], opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 rounded-full"
              style={{ background: "radial-gradient(circle, rgba(239,68,68,0.5), transparent 70%)", filter: "blur(8px)" }}
            />
            {/* Lock SVG */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="relative h-3/4 w-3/4 text-white drop-shadow-[0_4px_18px_rgba(239,68,68,0.6)]"
            >
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              <circle cx="12" cy="16" r="1.4" fill="currentColor" />
            </svg>
          </motion.div>

          <span className="text-[6.5rem] font-extrabold leading-none tracking-[-0.08em] text-white drop-shadow-[0_8px_30px_rgba(239,68,68,0.35)] sm:text-[9.5rem]">3</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.7 }}
          className="mt-8 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
        >
          Access denied.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.7 }}
          className="mt-3 max-w-md text-sm leading-7 text-text-muted sm:text-base"
        >
          {isAuth
            ? "Your account role doesn't have permission to view this page. If you think this is a mistake, ask your admin."
            : "You need to sign in to view this page."}
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
              {isAuth ? "To your dashboard →" : "Sign in →"}
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
