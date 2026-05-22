import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import Card from "@/components/ui/Card";
import Loader from "@/components/ui/Loader";
import { core } from "@/lib/api";
import { useCoreStore } from "@/store/core-store";
import CountUp from "@/features/coreTeam/components/CountUp";
import CoreBadge from "@/features/coreTeam/components/CoreBadge";

const SECTIONS = [
  { to: "/core/tasks",    label: "Tasks",     desc: "Pick up work, hit deadlines, earn points.", accent: "text-primary" },
  { to: "/core/feedback", label: "Feedback",  desc: "Anonymous suggestions & complaints.",       accent: "text-secondary" },
  { to: "/core/ideas",    label: "Ideas",     desc: "Pitch creative ideas, vote on the best.",   accent: "text-success" },
  { to: "/core/trends",   label: "Trends",    desc: "Fresh ideas pulled from the web every 4h.", accent: "text-warning" },
  { to: "/core/meetings", label: "Meetings",  desc: "Scheduled meets — RSVP going or can't.",     accent: "text-secondary" },
  { to: "/core/roster",   label: "Roster",    desc: "Every team, every member, the rankings.",   accent: "text-primary" },
];

export default function CorePortalPage() {
  const { member, teamRank } = useCoreStore();
  const [data, setData] = useState(null);
  const heroRef = useRef(null);

  useEffect(() => {
    Promise.all([
      core.tasks().catch(() => ({ data: [] })),
      core.ideas().catch(() => ({ data: { ideas: [] } })),
    ]).then(([t, i]) => {
      setData({
        tasks: Array.isArray(t.data) ? t.data : [],
        ideas: i.data?.ideas || [],
      });
    });
  }, []);

  useGSAP(() => {
    if (!heroRef.current) return;
    gsap.from(heroRef.current.querySelectorAll("[data-hero]"), {
      y: 24, opacity: 0, duration: 0.7, stagger: 0.12, ease: "power3.out",
    });
  }, { scope: heroRef });

  if (!data) {
    return <div className="flex justify-center py-20"><Loader variant="orbit" size="lg" label="Loading…" /></div>;
  }

  const isLead = member?.tier === "council" || member?.tier === "head";
  const myTasks = data.tasks.filter(
    (t) => t.claimer?.id === member?.id && t.status !== "confirmed",
  );
  const openTasks = data.tasks.filter((t) => t.is_open && t.status === "open");
  const pendingConfirm = data.tasks.filter(
    (t) => t.status === "submitted" &&
      (member?.tier === "council" || (member?.tier === "head" && t.team_id === member?.team_id)),
  );
  const myApproved = data.ideas.filter(
    (i) => i.author_member_id === member?.id && i.status === "approved",
  ).length;

  const stats = [
    { label: "My Points",      value: member?.points ?? 0,        hint: "earned so far" },
    { label: "Team Rank",      value: teamRank?.rank ?? 0,         hint: teamRank ? `of ${teamRank.of}` : "—" },
    { label: "Active Tasks",   value: myTasks.length,              hint: "in your hands" },
    { label: "Ideas Approved", value: myApproved,                  hint: "cleared the vote" },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div
        ref={heroRef}
        className="relative overflow-hidden rounded-2xl border border-line/15 bg-surface/60 p-7 shadow-panel backdrop-blur-2xl"
        style={{ borderTop: "2px solid #7c3aed" }}
      >
        <span className="pointer-events-none absolute right-[-4rem] top-[-4rem] h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
        <p data-hero className="font-mono text-[11px] uppercase tracking-[0.32em] text-primary/80">
          Welcome back
        </p>
        <h2 data-hero className="mt-2 font-display text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">
          {member?.name?.split(" ")[0] || "Core Member"}
        </h2>
        <div data-hero className="mt-3 flex flex-wrap items-center gap-3">
          <CoreBadge tier={member?.tier} />
          <span className="font-mono text-xs text-text-muted">
            {member?.position} · {member?.core_teams?.name || "Club Council"}
          </span>
        </div>
        {isLead && pendingConfirm.length > 0 && (
          <Link
            data-hero
            to="/core/tasks"
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning transition hover:bg-warning/15"
          >
            {pendingConfirm.length} task{pendingConfirm.length > 1 ? "s" : ""} awaiting your confirmation →
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.07, duration: 0.45 }}
          >
            <Card variant="glass" spotlight={false} noEntrance className="text-center">
              <p className="math-text text-4xl font-bold text-primary">
                <CountUp value={s.value} />
              </p>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-text-dim">{s.label}</p>
              <p className="mt-0.5 text-[11px] text-text-muted">{s.hint}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Section grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.to} to={s.to}>
            <Card variant="solid" interactive className="h-full">
              <h3 className={`font-display text-xl font-bold ${s.accent}`}>{s.label}</h3>
              <p className="mt-2 text-sm leading-6 text-text-muted">{s.desc}</p>
              <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-text-dim">Open →</p>
            </Card>
          </Link>
        ))}

        {/* Open tasks teaser */}
        <Card variant="glow" spotlight={false} className="h-full">
          <h3 className="font-display text-xl font-bold text-white">Up for grabs</h3>
          <p className="mt-2 text-sm text-text-muted">
            {openTasks.length
              ? `${openTasks.length} open task${openTasks.length > 1 ? "s" : ""} anyone can claim — first come, first serve.`
              : "No open tasks right now. Check back soon."}
          </p>
          <Link
            to="/core/tasks"
            className="mt-4 inline-block font-mono text-[10px] uppercase tracking-[0.2em] text-primary hover:underline"
          >
            Go to tasks →
          </Link>
        </Card>
      </div>

      {/* My active tasks */}
      <Card variant="solid" spotlight={false}>
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">Your active tasks</p>
        <div className="mt-4 space-y-2">
          {myTasks.length === 0 && (
            <p className="py-4 text-center text-sm text-text-dim">
              Nothing on your plate. Grab a task to start earning points.
            </p>
          )}
          {myTasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-line/8 bg-black/15 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-white">{t.title}</p>
                <p className="font-mono text-[10px] text-text-dim">
                  {t.status.replace("_", " ")} · {t.points} pts
                  {t.deadline ? ` · due ${new Date(t.deadline).toLocaleDateString()}` : ""}
                </p>
              </div>
              <Link to="/core/tasks" className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-primary hover:underline">
                Open
              </Link>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
