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
import CoreMindMap from "@/features/coreTeam/components/CoreMindMap";

// Nodes for the dashboard mind map — icon path + accent colour each.
const MAP_NODES = [
  { to: "/core/tasks",    label: "Tasks",    color: "#7c3aed", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
  { to: "/core/feedback", label: "Feedback", color: "#ec4899", icon: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" },
  { to: "/core/ideas",    label: "Ideas",    color: "#22c55e", icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" },
  { to: "/core/trends",   label: "Trends",   color: "#f59e0b", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" },
  { to: "/core/meetings", label: "Meetings", color: "#06b6d4", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { to: "/core/roster",   label: "Roster",   color: "#a855f7", icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-3-6.93" },
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

      {/* Portal navigation — animated mind map */}
      <div className="relative overflow-hidden rounded-2xl border border-line/15 bg-surface/50 px-4 py-6 shadow-panel backdrop-blur-2xl sm:px-6">
        <p className="text-center font-mono text-[11px] uppercase tracking-[0.32em] text-primary/80">
          Navigate the portal
        </p>
        <CoreMindMap nodes={MAP_NODES} hubLabel="CORE" />
      </div>

      {/* Open tasks teaser */}
      <Card variant="glow" spotlight={false}>
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
