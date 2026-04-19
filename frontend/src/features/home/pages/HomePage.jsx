import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import Button from "@/components/ui/Button";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import { useMonument } from "@/hooks/useMonument";
import { usePublicStats, formatStat } from "@/hooks/usePublicStats";
import MonumentVideo from "@/features/home/components/MonumentGround";

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.12, duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  }),
};

const features = [
  {
    icon: "\u{1F9EE}",
    title: "Challenge Arena",
    description: "Battle through weekly math challenges ranked by difficulty. Solve problems, earn points, climb the leaderboard.",
    to: "/arena",
    // Tailwind needs full class strings at build time (no interpolation).
    accent: "text-primary",
    bg:     "bg-primary/10",
    ring:   "ring-primary/20",
    glow:   "group-hover:shadow-[0_0_40px_rgba(131,82,255,0.25)]",
  },
  {
    icon: "\u{1F4CA}",
    title: "Live Dashboard",
    description: "Track your progress, view streaks, monitor your ranking, and see how you compare to the collective.",
    to: "/dashboard",
    accent: "text-warning",
    bg:     "bg-warning/10",
    ring:   "ring-warning/20",
    glow:   "group-hover:shadow-[0_0_40px_rgba(251,191,36,0.25)]",
  },
  {
    icon: "\u{1F3AF}",
    title: "Events & Competitions",
    description: "Join live quizzes, treasure hunts, and math competitions. Compete in real-time with students across universities.",
    to: "/events",
    accent: "text-success",
    bg:     "bg-success/10",
    ring:   "ring-success/20",
    glow:   "group-hover:shadow-[0_0_40px_rgba(45,212,191,0.25)]",
  },
  {
    icon: "\u{1F3C6}",
    title: "Leaderboards",
    description: "Weekly and all-time rankings. See top performers, your personal best, and earn recognition for your skills.",
    to: "/leaderboard",
    accent: "text-secondary",
    bg:     "bg-secondary/10",
    ring:   "ring-secondary/20",
    glow:   "group-hover:shadow-[0_0_40px_rgba(35,193,255,0.25)]",
  },
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

  // Real platform totals from /api/stats/public — true counts (head:true,
  // count:exact) for each underlying table. Em-dashes until loaded so we
  // never render a placeholder/fake number. The previous implementation
  // counted /leaderboard rows for "Active Members" but that endpoint has
  // .limit(20), so the count was capped at 20 — masked with a misleading
  // "+". Now it's the real students.is_active count.
  const platformStats = usePublicStats();
  const stats = [
    { value: formatStat(platformStats.members),     label: "Active Members" },
    { value: formatStat(platformStats.challenges),  label: "Challenges" },
    { value: formatStat(platformStats.events),      label: "Events" },
    { value: formatStat(platformStats.submissions), label: "Submissions" },
  ];

  return (
    <div style={{ width: "100vw", marginLeft: "calc(-50vw + 50%)" }}>

      {/* ── FULL-SCREEN VIDEO (scroll-synced, the ENTIRE experience) ── */}
      <MonumentVideo />

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
            // Lower minimum so the title doesn't overflow ~375px
            // viewports. 7vw on a 375px screen is 26px, below the old
            // 2.5rem (40px) floor — which forced overflow.
            fontSize: "clamp(1.75rem, 7vw, 5rem)",
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

      {/* ── SCROLL SPACER (drives video progress) ── */}
      <div style={{ height: "500vh", position: "relative", pointerEvents: "none" }} />

      {/* ── CONTENT SECTIONS ── */}
      <div style={{ position: "relative", minHeight: "100vh" }} className="space-y-12 px-4 pb-16 pt-16 sm:space-y-20 sm:px-8">
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
            <h2 className="mt-4 text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
              Everything you need to compete
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-text-muted">
              Four surfaces, one collective. Pick where you want to sharpen your edge.
            </p>
          </motion.div>
          <div className="mt-14 grid gap-5 md:grid-cols-2">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                <Link to={feature.to} className="block h-full">
                  <article
                    className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line/15 bg-surface/60 p-6 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-line/30 hover:bg-surface/80 ${feature.glow}`}
                  >
                    {/* Icon badge — a proper pill instead of a bare emoji */}
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-xl ring-1 ${feature.bg} ${feature.ring}`}
                    >
                      <span className="text-3xl leading-none" aria-hidden>
                        {feature.icon}
                      </span>
                    </div>

                    <h3 className="mt-6 font-display text-2xl font-bold tracking-[-0.02em] text-white">
                      {feature.title}
                    </h3>
                    <p className="mt-2 flex-1 text-sm leading-7 text-text-muted">
                      {feature.description}
                    </p>

                    {/* Learn-more cue — fades in on hover */}
                    <span className={`mt-6 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] opacity-70 transition group-hover:opacity-100 ${feature.accent}`}>
                      Explore
                      <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
                        {"\u2192"}
                      </span>
                    </span>
                  </article>
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
