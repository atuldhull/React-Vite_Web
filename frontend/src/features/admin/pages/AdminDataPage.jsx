import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Loader from "@/components/ui/Loader";
import { admin } from "@/lib/api";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import { useMonument } from "@/hooks/useMonument";

export default function AdminDataPage() {
  useMonument("magma");
  const [teams, setTeams] = useState([]);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [userId, setUserId] = useState("");
  const [exporting, setExporting] = useState(false);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      admin.teams().catch(() => ({ data: [] })),
      admin.tests().catch(() => ({ data: [] })),
    ]).then(([t, te]) => {
      setTeams(Array.isArray(t.data) ? t.data : []);
      setTests(Array.isArray(te.data) ? te.data : []);
      setLoading(false);
    });
  };

  useEffect(() => { fetchData(); }, []);
  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(null), 3000); };

  if (loading) return <div style={{ position: "relative" }}><MonumentBackground monument="magma" intensity={0.1} /><div className="flex justify-center py-20"><Loader variant="orbit" size="lg" /></div></div>;

  return (
    <div style={{ position: "relative" }}><MonumentBackground monument="magma" intensity={0.1} />
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-2xl font-bold text-white" style={{ fontFamily: "'Space Grotesk'" }}>Data & Teams</h2>
        <Button
          size="sm"
          variant="secondary"
          loading={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              const res = await admin.exportAll();
              const blob = new Blob([res.data], { type: "application/zip" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `math-collective-export-${new Date().toISOString().slice(0,10)}.zip`;
              a.click();
              URL.revokeObjectURL(url);
              showMsg("Export downloaded!");
            } catch (err) {
              showMsg("Export failed: " + (err.response?.data?.error || err.message));
            }
            setExporting(false);
          }}
        >
          Export All Data (ZIP)
        </Button>
      </div>

      {msg && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{msg}</motion.div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* User operations */}
        <Card variant="solid">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">User Data Operations</p>
          <p className="mt-1 text-xs text-text-dim">Clear attempts or reset XP for a specific user</p>
          <div className="mt-4 space-y-3">
            <input type="text" placeholder="Enter User ID" value={userId} onChange={(e) => setUserId(e.target.value)}
              className="w-full rounded-xl border border-line/15 bg-black/15 px-4 py-2.5 text-sm text-white outline-none focus:border-primary/30" />
            <div className="flex gap-3">
              <Button size="sm" variant="ghost" disabled={!userId} onClick={async () => {
                if (!confirm("Clear all attempts for this user?")) return;
                await admin.clearAttempts(userId).catch(() => {});
                showMsg("Attempts cleared");
              }}>Clear Attempts</Button>
              <Button size="sm" variant="ghost" disabled={!userId} onClick={async () => {
                if (!confirm("Reset XP to 0?")) return;
                await admin.resetXp(userId).catch(() => {});
                showMsg("XP reset to 0");
              }}>Reset XP</Button>
            </div>
          </div>
        </Card>

        {/* Summary */}
        <Card variant="glass">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-secondary">Summary</p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-line/10 bg-black/10 px-4 py-3 text-center">
              <p className="math-text text-2xl font-bold text-primary">{teams.length}</p>
              <p className="font-mono text-[10px] text-text-dim">Teams</p>
            </div>
            <div className="rounded-xl border border-line/10 bg-black/10 px-4 py-3 text-center">
              <p className="math-text text-2xl font-bold text-secondary">{tests.length}</p>
              <p className="font-mono text-[10px] text-text-dim">Scheduled Tests</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Teams */}
      <Card variant="solid">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-success">Teams ({teams.length})</p>
        </div>
        <div className="mt-4 space-y-2">
          {teams.length === 0 && <p className="py-4 text-center text-xs text-text-dim">No teams created</p>}
          {teams.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-xl border border-line/10 bg-black/10 px-4 py-3">
              <div>
                <p className="text-sm text-white">{t.name}</p>
                <p className="font-mono text-[10px] text-text-dim">{t.members?.length || 0} members{t.project_title ? ` · ${t.project_title}` : ""}</p>
              </div>
              <Button variant="danger" size="sm" onClick={async () => {
                if (!confirm("Delete this team?")) return;
                await admin.deleteTeam(t.id).catch(() => {});
                showMsg("Team deleted"); fetchData();
              }}>Delete</Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Tests */}
      <Card variant="solid">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warning">Scheduled Tests ({tests.length})</p>
        <div className="mt-4 space-y-2">
          {tests.length === 0 && <p className="py-4 text-center text-xs text-text-dim">No tests scheduled</p>}
          {tests.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-xl border border-line/10 bg-black/10 px-4 py-3">
              <div>
                <p className="text-sm text-white">{t.title}</p>
                <p className="font-mono text-[10px] text-text-dim">
                  {t.starts_at ? new Date(t.starts_at).toLocaleString() : ""} → {t.ends_at ? new Date(t.ends_at).toLocaleString() : ""}
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={async () => {
                if (!confirm("Delete this test?")) return;
                await admin.deleteTest(t.id).catch(() => {});
                showMsg("Test deleted"); fetchData();
              }}>Delete</Button>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
    </div>
  );
}
