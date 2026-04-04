import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";

const ROUTE_MONUMENTS = {
  "/arena": "desert",
  "/dashboard": "pyramid",
  "/history": "pyramid",
  "/leaderboard": "glacier",
  "/events": "jungle",
  "/projects": "jungle",
  "/login": "city",
  "/register": "city",
  "/billing": "city",
  "/gallery": "abyss",
  "/profile": "sky",
  "/certificates": "sky",
  "/notifications": "sky",
  "/admin": "magma",
  "/teacher": "magma",
  "/super-admin": "magma",
};

const MONUMENT_SYMBOLS = {
  desert: "∑",
  pyramid: "△",
  glacier: "∞",
  jungle: "∫",
  city: "λ",
  abyss: "Ω",
  sky: "φ",
  magma: "∇",
};

const MONUMENT_NAMES = {
  desert: "Desert Winds Observatory",
  pyramid: "Great Pyramid Theorem",
  glacier: "Glacial Citadel of Limits",
  jungle: "Jungle Ruins of Infinity",
  city: "Neon Spire City of Proofs",
  abyss: "Abyssal Library of Constants",
  sky: "Sky Archipelago of Transformations",
  magma: "Magma Forge of Axioms",
};

function resolveMonument(pathname) {
  // Exact match first
  if (ROUTE_MONUMENTS[pathname]) return ROUTE_MONUMENTS[pathname];
  // Prefix match for nested routes like /admin/users, /teacher/quiz
  const prefix = "/" + pathname.split("/").filter(Boolean)[0];
  return ROUTE_MONUMENTS[prefix] || null;
}

const overlayVariants = {
  enter: { opacity: 0, scale: 1.1 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.4, delay: 0.2 } },
};

export default function MonumentTransition() {
  const location = useLocation();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [targetMonument, setTargetMonument] = useState("desert");
  const prevPath = useRef(location.pathname);
  const timerRef = useRef(null);

  useEffect(() => {
    if (location.pathname === prevPath.current) return;
    prevPath.current = location.pathname;

    const monument = resolveMonument(location.pathname);
    // Skip transition for homepage or unknown routes
    if (!monument) return;

    setTargetMonument(monument);
    setIsTransitioning(true);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsTransitioning(false), 1500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [location.pathname]);

  const symbol = MONUMENT_SYMBOLS[targetMonument];
  const name = MONUMENT_NAMES[targetMonument];

  return (
    <AnimatePresence>
      {isTransitioning && (
        <motion.div
          key="monument-transition"
          variants={overlayVariants}
          initial="enter"
          animate="visible"
          exit="exit"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.85)",
            pointerEvents: "none",
          }}
        >
          <MonumentBackground monument={targetMonument} intensity={0.8} />

          {/* Math symbol */}
          <motion.span
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "relative",
              zIndex: 1,
              fontSize: "8rem",
              fontFamily: "'JetBrains Mono', monospace",
              color: "var(--page-accent)",
              lineHeight: 1,
            }}
          >
            {symbol}
          </motion.span>

          {/* Monument name */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 0.7, y: 0 }}
            transition={{ delay: 0.4, duration: 0.3 }}
            style={{
              position: "relative",
              zIndex: 1,
              marginTop: "1.5rem",
              fontSize: "0.8rem",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: "var(--page-accent)",
            }}
          >
            {name}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
