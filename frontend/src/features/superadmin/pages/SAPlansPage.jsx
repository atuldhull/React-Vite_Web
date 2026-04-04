import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Loader from "@/components/ui/Loader";
import { superAdmin } from "@/lib/api";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import { useMonument } from "@/hooks/useMonument";

// SaaS pricing model — Super Admin manages these, Orgs (Admins) subscribe
const SAAS_PLANS = [
  {
    id: "starter",
    name: "Starter",
    monthlyUSD: 29,
    yearlyUSD: 290,
    threeYearUSD: 696,
    maxUsers: 100,
    maxChallenges: 200,
    maxEvents: 10,
    features: ["Arena", "Leaderboard", "Events", "Basic Analytics"],
    highlight: false,
  },
  {
    id: "professional",
    name: "Professional",
    monthlyUSD: 79,
    yearlyUSD: 790,
    threeYearUSD: 1896,
    maxUsers: 500,
    maxChallenges: 1000,
    maxEvents: 50,
    features: ["Everything in Starter", "Live Quiz (Socket.IO)", "Certificates", "AI Question Gen", "Projects", "Gallery", "Advanced Analytics"],
    highlight: true,
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyUSD: 199,
    yearlyUSD: 1990,
    threeYearUSD: 4776,
    maxUsers: -1, // unlimited
    maxChallenges: -1,
    maxEvents: -1,
    features: ["Everything in Professional", "Unlimited Users", "Unlimited Content", "Custom Branding", "Priority Support", "API Access", "White-label Option"],
    highlight: false,
  },
];

export default function SAPlansPage() {
  useMonument("magma");
  const [dbPlans, setDbPlans] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState("yearly");
  const [msg, setMsg] = useState(null);
  const [assignOrg, setAssignOrg] = useState("");
  const [assignPlan, setAssignPlan] = useState("");
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    Promise.all([
      superAdmin.plans().catch(() => ({ data: [] })),
      superAdmin.orgs().catch(() => ({ data: { data: [] } })),
    ]).then(([p, o]) => {
      setDbPlans(Array.isArray(p.data) ? p.data : []);
      const od = o.data;
      setOrgs(Array.isArray(od) ? od : Array.isArray(od?.data) ? od.data : []);
      setLoading(false);
    });
  }, []);

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(null), 4000); };

  const handleAssign = async () => {
    if (!assignOrg || !assignPlan) return;
    setAssigning(true);
    try {
      await superAdmin.assignPlan(assignOrg, assignPlan);
      showMsg("Plan assigned successfully");
      const o = await superAdmin.orgs().catch(() => ({ data: { data: [] } }));
      const od = o.data;
      setOrgs(Array.isArray(od) ? od : Array.isArray(od?.data) ? od.data : []);
    } catch (err) { showMsg(err.response?.data?.error || "Failed to assign"); }
    setAssigning(false);
  };

  const getPrice = (plan) => {
    if (billingCycle === "monthly") return plan.monthlyUSD;
    if (billingCycle === "yearly") return plan.yearlyUSD;
    return plan.threeYearUSD;
  };

  const getPerMonth = (plan) => {
    if (billingCycle === "monthly") return plan.monthlyUSD;
    if (billingCycle === "yearly") return (plan.yearlyUSD / 12).toFixed(0);
    return (plan.threeYearUSD / 36).toFixed(0);
  };

  const getSavings = (plan) => {
    const full = plan.monthlyUSD * (billingCycle === "yearly" ? 12 : billingCycle === "3year" ? 36 : 1);
    const actual = getPrice(plan);
    const saved = full - actual;
    return saved > 0 ? saved : 0;
  };

  if (loading) return <div style={{ position: "relative" }}><MonumentBackground monument="magma" intensity={0.08} /><div className="flex justify-center py-20"><Loader variant="orbit" size="lg" /></div></div>;

  return (
    <div style={{ position: "relative" }}>
    <MonumentBackground monument="magma" intensity={0.08} />
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-bold text-white">Plans & Revenue</h2>
        <p className="text-sm text-text-muted">Manage SaaS subscription plans for organisations</p>
      </div>

      {msg && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{msg}</motion.div>}

      {/* Billing cycle toggle */}
      <div className="flex items-center justify-center gap-1 rounded-full border border-line/15 bg-surface/50 p-1 w-fit mx-auto">
        {[
          { key: "monthly", label: "Monthly" },
          { key: "yearly", label: "Yearly", badge: "Save 17%" },
          { key: "3year", label: "3 Years", badge: "Save 30%" },
        ].map((c) => (
          <button key={c.key} onClick={() => setBillingCycle(c.key)}
            className={`relative rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-wider transition ${
              billingCycle === c.key ? "bg-primary/20 text-white" : "text-text-dim hover:text-white"
            }`}>
            {c.label}
            {c.badge && billingCycle === c.key && (
              <span className="absolute -right-1 -top-2 rounded-full bg-success px-1.5 py-0.5 text-[7px] font-bold text-black">{c.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Plan cards */}
      <div className="grid gap-5 lg:grid-cols-3">
        {SAAS_PLANS.map((plan, i) => (
          <motion.div key={plan.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card variant={plan.highlight ? "glow" : "solid"} className={`relative ${plan.highlight ? "ring-1 ring-primary/30" : ""}`}>
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-white">
                  Most Popular
                </span>
              )}

              <p className="font-display text-xl font-bold text-white">{plan.name}</p>

              <div className="mt-4">
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-4xl font-extrabold text-white">${getPerMonth(plan)}</span>
                  <span className="font-mono text-xs text-text-dim">/mo</span>
                </div>
                {billingCycle !== "monthly" && (
                  <p className="mt-1 font-mono text-[10px] text-text-dim">
                    ${getPrice(plan)} billed {billingCycle === "yearly" ? "annually" : "every 3 years"}
                    {getSavings(plan) > 0 && <span className="ml-1 text-success">Save ${getSavings(plan)}</span>}
                  </p>
                )}
              </div>

              <div className="mt-5 space-y-2 border-t border-line/10 pt-5">
                <div className="flex justify-between text-xs">
                  <span className="text-text-dim">Users</span>
                  <span className="text-white">{plan.maxUsers === -1 ? "Unlimited" : `Up to ${plan.maxUsers}`}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-text-dim">Challenges</span>
                  <span className="text-white">{plan.maxChallenges === -1 ? "Unlimited" : `Up to ${plan.maxChallenges}`}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-text-dim">Events</span>
                  <span className="text-white">{plan.maxEvents === -1 ? "Unlimited" : `Up to ${plan.maxEvents}`}</span>
                </div>
              </div>

              <div className="mt-4 space-y-1.5">
                {plan.features.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs text-text-muted">
                    <span className="text-success">✓</span> {f}
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Assign plan to org */}
      <Card variant="glass">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-secondary">Assign Plan to Organisation</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-[10px] text-text-dim">Organisation</label>
            <select value={assignOrg} onChange={(e) => setAssignOrg(e.target.value)}
              className="w-full rounded-xl border border-line/15 bg-black/15 px-3 py-2.5 text-sm text-white outline-none">
              <option value="">Select org...</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.plan_name || "free"})</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-[10px] text-text-dim">Plan</label>
            <select value={assignPlan} onChange={(e) => setAssignPlan(e.target.value)}
              className="w-full rounded-xl border border-line/15 bg-black/15 px-3 py-2.5 text-sm text-white outline-none">
              <option value="">Select plan...</option>
              {dbPlans.map((p) => <option key={p.name} value={p.name}>{p.display_name || p.name} (${p.price_monthly}/mo)</option>)}
              <option value="starter">Starter ($29/mo)</option>
              <option value="professional">Professional ($79/mo)</option>
              <option value="enterprise">Enterprise ($199/mo)</option>
            </select>
          </div>
          <Button size="sm" onClick={handleAssign} loading={assigning} disabled={!assignOrg || !assignPlan}>
            Assign Plan
          </Button>
        </div>
      </Card>

      {/* Current org subscriptions */}
      <Card variant="solid">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warning">Active Subscriptions</p>
        <div className="mt-4 space-y-2">
          {orgs.length === 0 && <p className="py-3 text-center text-xs text-text-dim">No organisations</p>}
          {orgs.map((org) => (
            <div key={org.id} className="flex items-center justify-between rounded-xl border border-line/10 bg-black/10 px-4 py-3">
              <div>
                <p className="text-sm text-white">{org.name}</p>
                <p className="font-mono text-[10px] text-text-dim">{org.slug}</p>
              </div>
              <div className="text-right">
                <span className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase ${
                  org.plan_name === "enterprise" ? "bg-warning/10 text-warning" :
                  org.plan_name === "professional" ? "bg-primary/10 text-primary" :
                  "bg-white/5 text-text-dim"
                }`}>
                  {org.plan_name || "free"}
                </span>
                <p className="mt-0.5 font-mono text-[9px] text-text-dim">{org.status}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Revenue from DB plans */}
      {dbPlans.length > 0 && (
        <Card variant="glass">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">Database Plans (Current Config)</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line/10 font-mono text-[9px] uppercase tracking-wider text-text-dim">
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2">Monthly</th>
                  <th className="px-3 py-2">Yearly</th>
                  <th className="px-3 py-2">Users</th>
                  <th className="px-3 py-2">Challenges</th>
                  <th className="px-3 py-2">Events</th>
                </tr>
              </thead>
              <tbody>
                {dbPlans.map((p) => (
                  <tr key={p.name} className="border-b border-line/5">
                    <td className="px-3 py-2 font-medium text-white">{p.display_name || p.name}</td>
                    <td className="px-3 py-2 text-success">${p.price_monthly || 0}</td>
                    <td className="px-3 py-2 text-success">${p.price_yearly || 0}</td>
                    <td className="px-3 py-2 text-text-muted">{p.max_users || "—"}</td>
                    <td className="px-3 py-2 text-text-muted">{p.max_challenges || "—"}</td>
                    <td className="px-3 py-2 text-text-muted">{p.max_events || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </motion.div>
    </div>
  );
}
