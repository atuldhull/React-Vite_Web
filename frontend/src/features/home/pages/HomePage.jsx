import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import { useMonument } from "@/hooks/useMonument";
import http from "@/lib/http";
import MonumentVideo from "@/features/home/components/MonumentGround";

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.12, duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  }),
};

const features = [
  { icon: "🧮", title: "Challenge Arena", description: "Battle through weekly math challenges ranked by difficulty. Solve problems, earn points, climb the leaderboard.", to: "/arena", color: "from-primary/20 to-secondary/10" },
  { icon: "📊", title: "Live Dashboard", description: "Track your progress, view streaks, monitor your ranking, and see how you compare to the collective.", to: "/dashboard", color: "from-warning/15 to-danger/10" },
  { icon: "🎯", title: "Events & Competitions", description: "Join live quizzes, treasure hunts, and math competitions. Compete in real-time with students across universities.", to: "/events", color: "from-success/15 to-glow/10" },
  { icon: "🏆", title: "Leaderboards", description: "Weekly and all-time rankings. See top performers, your personal best, and earn recognition for your skills.", to: "/arena", color: "from-secondary/15 to-primary/10" },
];

/**
 * useScrollVideo — scroll progress 0→1 over a given scroll range.
 * Uses rAF for smooth 60fps tracking, no React re-renders on every pixel.
 */
function useScrollVideo(scrollRange) {
  const progress = useRef(0);
  const [, forceUpdate] = useState(0);
  const frameRef = useRef(null);
  const rangeRef = useRef(scrollRange || window.innerHeight * 6);

  useEffect(() => {
    rangeRef.current = scrollRange || window.innerHeight * 6;
  }, [scrollRange]);

  useEffect(() => {
    let lastP = -1;
    function tick() {
      const y = window.scrollY;
      const p = Math.min(1, Math.max(0, y / rangeRef.current));
      progress.current = p;
      // Only trigger React re-render every ~5% change (for opacity transitions)
      const rounded = Math.round(p * 20) / 20;
      if (rounded !== lastP) {
        lastP = rounded;
        forceUpdate(n => n + 1);
      }
      frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, []);

  return progress;
}

export default function HomePage() {
  useMonument("desert");

  // Single scroll progress for the entire page video
  const progressRef = useScrollVideo(window.innerHeight * 5);

  // Overlay visibility (title shown at start, fades as you scroll)
  const p = progressRef.current;
  const showTitle = p < 0.15;
  const showScroll = p < 0.05;
  const titleOpacity = p < 0.08 ? 1 : p < 0.18 ? 1 - (p - 0.08) / 0.1 : 0;

  const [stats, setStats] = useState([
    { value: "—", label: "Active Members" },
    { value: "—", label: "Challenges" },
    { value: "—", label: "Events" },
    { value: "—", label: "Submissions" },
  ]);

  useEffect(() => {
    Promise.all([
      http.get("/leaderboard").catch(() => ({ data: [] })),
      http.get("/challenge/all").catch(() => ({ data: [] })),
      http.get("/events").catch(() => ({ data: [] })),
    ]).then(([lb, ch, ev]) => {
      const lbArr = Array.isArray(lb.data) ? lb.data : [];
      const chArr = Array.isArray(ch.data) ? ch.data : [];
      const evArr = Array.isArray(ev.data) ? ev.data : [];
      setStats([
        { value: lbArr.length > 0 ? `${lbArr.length}+` : "—", label: "Active Members" },
        { value: chArr.length > 0 ? String(chArr.length) : "—", label: "Challenges" },
        { value: evArr.length > 0 ? String(evArr.length) : "—", label: "Events" },
        { value: lbArr.reduce((s, u) => s + (Number(u.xp) || 0), 0) > 0 ? String(lbArr.reduce((s, u) => s + (Number(u.xp) || 0), 0)) : "—", label: "Total XP Earned" },
      ]);
    });
  }, []);

  return (
    <div style={{ width: "100vw", marginLeft: "calc(-50vw + 50%)" }}>

      {/* ── FULL-SCREEN VIDEO (scroll-synced, the ENTIRE experience) ── */}
      <MonumentVideo progress={progressRef.current} />

      {/* ── HERO OVERLAY (title + scroll hint) ── */}
      {showTitle && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10,
          pointerEvents: "none",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          opacity: titleOpacity,
          willChange: "opacity",
        }}>
          <h1 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: "clamp(2.5rem, 7vw, 5rem)",
            fontWeight: 800, color: "white", margin: 0,
            letterSpacing: "-0.04em", lineHeight: 1.1,
            textShadow: "0 0 80px rgba(0,0,0,0.6), 0 0 160px rgba(79,195,247,0.1)",
          }}>
            Math Collective
          </h1>
          <p style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: "clamp(0.85rem, 2vw, 1.3rem)",
            color: "rgba(255,255,255,0.5)", marginTop: "0.75rem",
            letterSpacing: "0.04em",
          }}>
            Where Mathematics Becomes Monument
          </p>
        </div>
      )}

      {/* ── SCROLL HINT ── */}
      {showScroll && (
        <div style={{
          position: "fixed", bottom: "12%", left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10, pointerEvents: "none",
          display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem",
        }}>
          <span className="math-text" style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", letterSpacing: "0.2em" }}>
            SCROLL TO EXPLORE
          </span>
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
          >
            <div style={{ width: 1.5, height: 20, borderRadius: 1, background: "linear-gradient(to bottom, rgba(255,255,255,0.3), transparent)" }} />
            <div style={{ width: 8, height: 8, borderRight: "1.5px solid rgba(255,255,255,0.3)", borderBottom: "1.5px solid rgba(255,255,255,0.3)", transform: "rotate(45deg)", marginTop: -4 }} />
          </motion.div>
        </div>
      )}

      {/* ── STATS BAR (bottom, visible at start) ── */}
      {p < 0.25 && (
        <div style={{
          position: "fixed", bottom: "3%", left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10, pointerEvents: "none",
          display: "flex", gap: "2rem",
          padding: "0.6rem 1.8rem",
          background: "rgba(0,0,0,0.3)",
          backdropFilter: "blur(16px)",
          borderRadius: "2rem",
          border: "1px solid rgba(255,255,255,0.06)",
          opacity: p < 0.15 ? 1 : 1 - (p - 0.15) / 0.1,
        }}>
          {stats.map((stat) => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <span className="math-text" style={{ fontSize: "1rem", fontWeight: 700, color: "white", display: "block" }}>
                {stat.value}
              </span>
              <span style={{ fontSize: "0.55rem", color: "rgba(255,255,255,0.35)", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── SCROLL SPACER (drives video progress) ── */}
      <div style={{ height: "500vh", position: "relative", pointerEvents: "none" }} />

      {/* ── CONTENT SECTIONS ── */}
      <div style={{ position: "relative", minHeight: "100vh" }} className="space-y-20 px-4 pb-16 pt-16 sm:px-8">
        <MonumentBackground monument="desert" intensity={0.2} />

        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}
          className="relative z-[1] mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-8 sm:gap-14">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="math-text text-3xl font-bold tracking-tight text-white sm:text-4xl">{stat.value}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-text-dim">{stat.label}</p>
            </div>
          ))}
        </motion.div>

        <section className="relative z-[1] mx-auto max-w-5xl text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <motion.p custom={0} variants={fadeUp} className="font-mono text-xs uppercase tracking-[0.4em] text-secondary">Welcome to the Collective</motion.p>
            <motion.h2 custom={1} variants={fadeUp} className="mt-6 text-5xl font-extrabold leading-[0.92] tracking-[-0.06em] text-white sm:text-6xl lg:text-7xl">
              Where Math<br />
              <span className="bg-gradient-to-r from-primary via-secondary to-glow bg-clip-text text-transparent">Becomes Epic</span>
            </motion.h2>
            <motion.p custom={2} variants={fadeUp} className="mx-auto mt-8 max-w-2xl text-lg leading-8 text-text-muted">
              Math Collective is a competitive mathematics platform where university students solve challenges, compete in live events, and push each other to think harder, faster, and deeper.
            </motion.p>
            <motion.div custom={3} variants={fadeUp} className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link to="/register"><Button size="lg">Join the Collective</Button></Link>
              <Link to="/arena"><Button variant="secondary" size="lg">Enter Arena</Button></Link>
            </motion.div>
          </motion.div>
        </section>

        <section className="relative z-[1] mx-auto max-w-6xl">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.7 }} className="text-center">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Platform Features</p>
            <h2 className="mt-4 text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">Everything you need to compete</h2>
          </motion.div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            {features.map((feature, i) => (
              <motion.div key={feature.title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ delay: i * 0.1, duration: 0.6 }}>
                <Link to={feature.to}>
                  <Card variant="glass" interactive className="h-full">
                    <div className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-br ${feature.color}`} />
                    <div className="relative z-[1]">
                      <span className="text-3xl">{feature.icon}</span>
                      <h3 className="mt-4 text-2xl font-bold tracking-[-0.03em] text-white">{feature.title}</h3>
                      <p className="mt-3 text-sm leading-7 text-text-muted">{feature.description}</p>
                    </div>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="relative z-[1] mx-auto max-w-5xl">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }} className="text-center">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-secondary">How It Works</p>
            <h2 className="mt-4 text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">Three steps to greatness</h2>
          </motion.div>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              { step: "01", title: "Sign Up", desc: "Create your account and join the collective. Pick your university and set your math focus areas." },
              { step: "02", title: "Solve Challenges", desc: "Dive into weekly challenges sorted by difficulty. Each correct solution earns points and boosts your rank." },
              { step: "03", title: "Compete & Win", desc: "Enter live events, climb the leaderboard, earn certificates, and prove you're the best." },
            ].map((item, i) => (
              <motion.div key={item.step} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15, duration: 0.6 }}
                className="group relative border border-line/15 bg-surface/50 p-8 backdrop-blur-xl" style={{ clipPath: "var(--clip-notch)" }}>
                <span className="math-text text-5xl font-extrabold tracking-[-0.06em] text-primary/20 transition-colors group-hover:text-primary/40">{item.step}</span>
                <h3 className="mt-4 text-xl font-bold text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-text-muted">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="relative z-[1] mx-auto max-w-4xl text-center">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.7 }}
            className="border border-primary/20 bg-gradient-to-br from-primary/10 via-surface/80 to-secondary/10 p-12 shadow-orbit backdrop-blur-2xl sm:p-16" style={{ clipPath: "var(--clip-notch)" }}>
            <h2 className="text-4xl font-extrabold tracking-[-0.05em] text-white sm:text-5xl">Ready to prove yourself?</h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">Join hundreds of students who are already competing. The next challenge drops weekly — don't miss it.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link to="/register"><Button size="lg">Get Started Free</Button></Link>
              <Link to="/events"><Button variant="ghost" size="lg">Browse Events</Button></Link>
            </div>
          </motion.div>
        </section>
      </div>
    </div>
  );
}
