import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Loader from "@/components/ui/Loader";
import { superAdmin } from "@/lib/api";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import { useMonument } from "@/hooks/useMonument";

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5 } }) };

export default function SAAnalyticsPage() {
  useMonument("magma");
  const [analytics, setAnalytics] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      superAdmin.analytics().catch(() => ({ data: null })),
      superAdmin.leaderboard().catch(() => ({ data: [] })),
      superAdmin.auditLogs().catch(() => ({ data: { data: [] } })),
    ]).then(([a, l, au]) => {
      setAnalytics(a.data);
      setLeaderboard(Array.isArray(l.data) ? l.data : []);
      // auditLogs may be { data: [...], total } or just []
      const logs = au.data;
      setAuditLogs(Array.isArray(logs) ? logs : Array.isArray(logs?.data) ? logs.data : []);
      setLoading(false);
    }).catch(() => { setError("Failed to load"); setLoading(false); });
  }, []);

  if (loading) return <div style={{ position: "relative" }}><MonumentBackground monument="magma" intensity={0.08} /><div className="flex justify-center py-20"><Loader variant="orbit" size="lg" label="Loading analytics..." /></div></div>;
  if (error) return <div style={{ position: "relative" }}><MonumentBackground monument="magma" intensity={0.08} /><div className="py-20 text-center text-danger">{error}</div></div>;

  const summary = analytics?.summary || {};
  const orgs = analytics?.recentOrgs || [];

  const stats = [
    { label: "Organisations", value: summary.totalOrgs ?? 0, color: "text-primary", icon: "🏢" },
    { label: "Total Users", value: summary.totalUsers ?? 0, color: "text-secondary", icon: "👥" },
    { label: "Challenges", value: summary.totalChallenges ?? 0, color: "text-success", icon: "🧩" },
    { label: "MRR", value: `$${summary.mrr || "0.00"}`, color: "text-warning", icon: "💰" },
  ];

  return (
    <div style={{ position: "relative" }}>
    <MonumentBackground monument="magma" intensity={0.08} />
    <motion.div initial="hidden" animate="visible" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} custom={i} variants={fadeUp}>
            <Card variant="glass" className="text-center">
              <span className="text-2xl">{s.icon}</span>
              <p className={`mt-2 font-display text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-text-dim">{s.label}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Orgs breakdown */}
        <motion.div custom={4} variants={fadeUp}>
          <Card variant="solid">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">Organisations</p>
            <div className="mt-4 space-y-2">
              {orgs.length === 0 && <p className="py-3 text-center text-xs text-text-dim">No organisations</p>}
              {orgs.map((org) => (
                <div key={org.id} className="flex items-center justify-between rounded-xl border border-line/10 bg-black/10 px-4 py-3">
                  <div>
                    <p className="text-sm text-white">{org.name}</p>
                    <p className="font-mono text-[10px] text-text-dim">{org.slug} · {org.plan_name || "free"}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase ${org.status === "active" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                    {org.status}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        {/* Global leaderboard */}
        <motion.div custom={5} variants={fadeUp}>
          <Card variant="glass">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warning">Global Leaderboard</p>
            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {leaderboard.slice(0, 15).map((u, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-line/5 bg-black/10 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-[9px] font-bold ${i < 3 ? "bg-warning/15 text-warning" : "bg-white/5 text-text-dim"}`}>{i + 1}</span>
                    <span className="text-xs text-white">{u.name || u.email}</span>
                  </div>
                  <span className="font-mono text-xs text-primary">{u.xp || 0}</span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Audit logs */}
      <motion.div custom={6} variants={fadeUp}>
        <Card variant="solid">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-secondary">Audit Logs</p>
          <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {auditLogs.length === 0 && <p className="py-3 text-center text-xs text-text-dim">No audit logs recorded</p>}
            {auditLogs.slice(0, 20).map((log, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-line/5 bg-black/10 px-3 py-2">
                <div>
                  <p className="text-xs text-white">{log.action || log.event || "Activity"}</p>
                  <p className="font-mono text-[9px] text-text-dim">{log.actor || log.user_email || ""}</p>
                </div>
                <span className="font-mono text-[9px] text-text-dim">{log.created_at ? new Date(log.created_at).toLocaleString() : ""}</span>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>
    </motion.div>
    </div>
  );
}
