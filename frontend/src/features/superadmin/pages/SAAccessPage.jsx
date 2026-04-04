import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Loader from "@/components/ui/Loader";
import { superAdmin } from "@/lib/api";
import { FEATURE_DEFINITIONS as FEATURES } from "@/config/features";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import { useMonument } from "@/hooks/useMonument";

export default function SAAccessPage() {
  useMonument("magma");
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [flags, setFlags] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  // Impersonation
  const [impOrg, setImpOrg] = useState("");
  const [impersonating, setImpersonating] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    superAdmin.orgs()
      .then((r) => { const d = r.data; setOrgs(Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []); })
      .catch(() => setOrgs([]))
      .finally(() => setLoading(false));
  }, []);

  // When org changes, load its CURRENT flags from the org data
  useEffect(() => {
    if (!selectedOrg) { setFlags({}); return; }
    const org = orgs.find((o) => o.id === selectedOrg);
    if (org && org.feature_flags && typeof org.feature_flags === "object") {
      // Load existing flags, fill missing ones as false
      const loaded = {};
      FEATURES.forEach((f) => { loaded[f.key] = org.feature_flags[f.key] ?? false; });
      setFlags(loaded);
    } else {
      // No flags set yet — default all to false
      const defaults = {};
      FEATURES.forEach((f) => { defaults[f.key] = false; });
      setFlags(defaults);
    }
    setMsg(null);
  }, [selectedOrg, orgs]);

  const toggle = (key) => { setFlags((p) => ({ ...p, [key]: !p[key] })); setMsg(null); };
  const enableAll = () => { const f = {}; FEATURES.forEach((feat) => { f[feat.key] = true; }); setFlags(f); setMsg(null); };
  const disableAll = () => { const f = {}; FEATURES.forEach((feat) => { f[feat.key] = false; }); setFlags(f); setMsg(null); };

  const saveFlags = async () => {
    if (!selectedOrg) return;
    setSaving(true); setMsg(null);
    try {
      await superAdmin.setFeatures(selectedOrg, flags);
      // Refresh orgs to get updated flags
      const r = await superAdmin.orgs();
      const d = r.data;
      setOrgs(Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []);
      setMsg({ type: "success", text: "Feature flags saved successfully! Changes are live." });
    } catch (err) {
      setMsg({ type: "error", text: err.response?.data?.error || "Failed to save" });
    }
    setSaving(false);
  };

  const handleImpersonate = async () => {
    if (!impOrg) return;
    setImpersonating(true);
    try {
      await superAdmin.impersonate(impOrg);
      setIsImpersonating(true);
      setMsg({ type: "success", text: "Impersonation started. You are now acting as this org's admin." });
    } catch (err) {
      setMsg({ type: "error", text: err.response?.data?.error || "Impersonation failed" });
    }
    setImpersonating(false);
  };

  const stopImpersonate = async () => {
    try {
      await superAdmin.stopImpersonate();
      setIsImpersonating(false);
      setMsg({ type: "success", text: "Impersonation stopped." });
    } catch { /* ignore */ }
  };

  const orgName = orgs.find((o) => o.id === selectedOrg)?.name || "";
  const enabledCount = Object.values(flags).filter(Boolean).length;

  if (loading) return <div style={{ position: "relative" }}><MonumentBackground monument="magma" intensity={0.08} /><div className="flex justify-center py-20"><Loader variant="orbit" size="lg" /></div></div>;

  return (
    <div style={{ position: "relative" }}>
    <MonumentBackground monument="magma" intensity={0.08} />
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-white">Access Control</h2>
        <p className="text-sm text-text-muted">Enable or disable features per organisation</p>
      </div>

      <AnimatePresence>
        {msg && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`rounded-xl border px-4 py-3 text-sm ${msg.type === "success" ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger"}`}>
            {msg.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Impersonation banner */}
      {isImpersonating && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-warning">You are currently impersonating an organisation</p>
            <Button size="sm" variant="ghost" onClick={stopImpersonate}>Stop Impersonation</Button>
          </div>
        </div>
      )}

      {/* ═══ FEATURE FLAGS ═══ */}
      <Card variant="solid">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">Feature Flags</p>
        <p className="mt-1 text-xs text-text-dim">Select an organisation, toggle features, and save. Only enabled features will be accessible to that org.</p>

        {/* Org selector */}
        <div className="mt-5">
          <label className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-text-dim">Select Organisation</label>
          <select value={selectedOrg} onChange={(e) => setSelectedOrg(e.target.value)}
            className="w-full max-w-md rounded-xl border border-line/15 bg-panel/70 px-4 py-3 text-sm text-white outline-none focus:border-primary/30">
            <option value="">Choose an organisation...</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name} ({o.slug})</option>
            ))}
          </select>
        </div>

        {/* Feature toggles */}
        {selectedOrg && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-text-muted">
                Managing: <span className="font-medium text-white">{orgName}</span>
                <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[9px] text-primary">{enabledCount}/{FEATURES.length} enabled</span>
              </p>
              <div className="flex gap-2">
                <button onClick={enableAll} className="rounded-lg bg-success/10 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-success transition hover:bg-success/20">Enable All</button>
                <button onClick={disableAll} className="rounded-lg bg-danger/10 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-danger transition hover:bg-danger/20">Disable All</button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {FEATURES.map((feat) => (
                <div key={feat.key}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3.5 transition ${
                    flags[feat.key] ? "border-success/20 bg-success/5" : "border-line/10 bg-black/10"
                  }`}>
                  <div>
                    <p className={`text-sm font-medium ${flags[feat.key] ? "text-white" : "text-text-muted"}`}>{feat.label}</p>
                    <p className="text-[10px] text-text-dim">{feat.description || feat.desc}</p>
                  </div>
                  <button onClick={() => toggle(feat.key)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${flags[feat.key] ? "bg-success" : "bg-white/10"}`}>
                    <motion.span
                      animate={{ x: flags[feat.key] ? 22 : 3 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      className="absolute top-1 h-5 w-5 rounded-full bg-white shadow"
                    />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center gap-3">
              <Button onClick={saveFlags} loading={saving}>
                Save Feature Flags
              </Button>
              <span className="text-xs text-text-dim">Changes apply immediately after saving</span>
            </div>
          </motion.div>
        )}
      </Card>

      {/* ═══ IMPERSONATION ═══ */}
      <Card variant="glass" className="border-warning/10">
        <div className="flex items-center gap-2">
          <span className="text-warning">⚠</span>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warning">Dangerous Operation</p>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Impersonation allows you to act as an organisation admin. All actions performed while impersonating will be logged in the audit trail. Use with extreme caution.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-[10px] text-text-dim">Organisation</label>
            <select value={impOrg} onChange={(e) => setImpOrg(e.target.value)}
              className="w-full rounded-xl border border-line/15 bg-panel/70 px-3 py-2.5 text-sm text-white outline-none">
              <option value="">Select org...</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <Button size="sm" variant="danger" onClick={handleImpersonate} loading={impersonating} disabled={!impOrg}>
            Impersonate
          </Button>
        </div>
      </Card>
    </motion.div>
    </div>
  );
}
