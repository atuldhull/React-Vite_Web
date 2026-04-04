import { motion } from "framer-motion";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import { useMonument } from "@/hooks/useMonument";
import Card from "@/components/ui/Card";
import { useAuthStore } from "@/store/auth-store";

export default function BillingPage() {
  useMonument("city");
  const user = useAuthStore((s) => s.user);
  const plan = user?.org_plan || "free";
  const orgName = user?.org_name || "Your Organisation";

  return (
    <div style={{ position: "relative" }}>
      <MonumentBackground monument="city" intensity={0.1} />
      <div className="relative z-10 space-y-8 pb-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Subscription</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.05em] text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Your Plan</h1>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card variant="glow" className="text-center">
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-dim">{orgName}</p>
            <p className="math-text mt-3 text-4xl font-bold capitalize text-white">{plan}</p>
            <p className="mt-2 text-sm text-text-muted">
              {plan === "free"
                ? "You're on the free plan. Contact your organisation admin to upgrade."
                : `Your organisation is on the ${plan} plan. All features included in your plan are active.`}
            </p>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card variant="solid">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-secondary">What's included</p>
            <div className="mt-4 space-y-2">
              {[
                { name: "Arena Challenges", included: true },
                { name: "Leaderboard", included: true },
                { name: "Events", included: true },
                { name: "Live Quiz", included: plan !== "free" },
                { name: "Certificates", included: plan !== "free" },
                { name: "AI Question Generation", included: plan === "professional" || plan === "enterprise" },
                { name: "Projects", included: plan !== "free" },
                { name: "Advanced Analytics", included: plan === "professional" || plan === "enterprise" },
              ].map((f) => (
                <div key={f.name} className="flex items-center gap-3 rounded-lg px-3 py-2">
                  <span className={f.included ? "text-success" : "text-text-dim"}>
                    {f.included ? "✓" : "✗"}
                  </span>
                  <span className={`text-sm ${f.included ? "text-white" : "text-text-dim line-through"}`}>{f.name}</span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <Card variant="glass">
            <p className="text-sm text-text-muted">
              Need to upgrade? Contact your <span className="text-white">organisation admin</span> — they manage billing and subscriptions through the Admin panel.
            </p>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
