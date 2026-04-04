/**
 * ReferralPage — Referral dashboard with code, stats, QR, leaderboard.
 */

import { motion } from "framer-motion";
import { useEffect, useState, useMemo } from "react";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import MonumentHero from "@/components/monument/MonumentHero";
import { useMonument } from "@/hooks/useMonument";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Loader from "@/components/ui/Loader";
import { referral } from "@/lib/api";

export default function ReferralPage() {
  useMonument("sky");

  const [stats, setStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      referral.getCode().catch(() => ({ data: { code: null } })),
      referral.stats().catch(() => ({ data: null })),
      referral.leaderboard().catch(() => ({ data: [] })),
    ]).then(([codeRes, statsRes, lbRes]) => {
      setStats({ ...statsRes.data, code: statsRes.data?.code || codeRes.data?.code });
      setLeaderboard(Array.isArray(lbRes.data) ? lbRes.data : []);
      setLoading(false);
    });
  }, []);

  const referralLink = useMemo(() => {
    if (!stats?.code) return "";
    return `${window.location.origin}/app/register?ref=${stats.code}`;
  }, [stats?.code]);

  // Generate QR code as data URL using a simple canvas-based approach
  const qrDataUrl = useMemo(() => {
    if (!referralLink) return "";
    // Use a public QR API for simplicity (replace with local lib in production)
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(referralLink)}&bgcolor=030712&color=B695F8`;
  }, [referralLink]);

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(stats?.code || "").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div style={{ position: "relative" }}>
        <MonumentBackground monument="sky" intensity={0.15} />
        <div className="relative z-10 flex min-h-[60vh] items-center justify-center">
          <Loader variant="orbit" size="lg" label="Loading referrals..." />
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <MonumentBackground monument="sky" intensity={0.15} />
      <div className="relative z-10 space-y-8 pb-16">
        <MonumentHero monument="sky" title="Invite & Earn" subtitle="Referral Program" description="Share your code, grow the collective, earn XP." />

        {/* Referral Code Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card variant="glow" className="text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-glow">Your Referral Code</p>
            <p className="math-text mt-3 text-4xl font-bold tracking-[0.2em] text-white">{stats?.code || "—"}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Button size="sm" onClick={copyCode}>{copied ? "Copied!" : "Copy Code"}</Button>
              <Button size="sm" variant="secondary" onClick={copyLink}>{copied ? "Copied!" : "Copy Link"}</Button>
            </div>

            {/* QR Code */}
            {qrDataUrl && (
              <div className="mt-5 flex justify-center">
                <div className="rounded-xl border border-line/10 bg-black/20 p-3">
                  <img src={qrDataUrl} alt="Referral QR Code" className="h-36 w-36 rounded" />
                  <p className="mt-2 text-center text-[9px] text-text-dim">Scan to join</p>
                </div>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Stats Grid */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total Invites", value: stats?.totalInvites || 0, color: "text-primary" },
            { label: "Successful", value: stats?.successfulReferrals || 0, color: "text-success" },
            { label: "Pending", value: stats?.pendingReferrals || 0, color: "text-warning" },
            { label: "XP Earned", value: stats?.totalXPEarned || 0, color: "text-glow" },
          ].map((stat) => (
            <Card key={stat.label} variant="glass" className="text-center">
              <p className={`math-text text-3xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-text-dim">{stat.label}</p>
            </Card>
          ))}
        </motion.div>

        {/* How it works */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card variant="solid">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-secondary">How It Works</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {[
                { step: "01", title: "Share Your Code", desc: "Copy your unique code or QR and send it to friends." },
                { step: "02", title: "Friend Joins", desc: "They sign up using your code and verify their account." },
                { step: "03", title: "Both Earn XP", desc: `You get 100 XP, they get 50 XP bonus. Everyone wins.` },
              ].map((item) => (
                <div key={item.step} className="text-center">
                  <span className="math-text text-3xl font-bold text-primary/20">{item.step}</span>
                  <h4 className="mt-2 text-sm font-bold text-white">{item.title}</h4>
                  <p className="mt-1 text-xs text-text-dim">{item.desc}</p>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        {/* Referral Leaderboard */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card variant="solid">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warning">Top Referrers</p>
            <div className="mt-4 space-y-2">
              {leaderboard.length === 0 && (
                <p className="py-6 text-center text-sm text-text-dim">No referrals yet. Be the first!</p>
              )}
              {leaderboard.map((entry) => (
                <div key={entry.userId} className="flex items-center gap-3 rounded-xl border border-line/10 bg-black/10 px-4 py-2.5">
                  <span className={`math-text flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                    entry.rank <= 3 ? "bg-warning/15 text-warning" : "bg-white/5 text-text-dim"
                  }`}>
                    {entry.rank}
                  </span>
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-sm"
                    style={{ background: entry.avatar_color || "linear-gradient(135deg,#7c3aed,#3b82f6)" }}
                  >
                    {entry.avatar_emoji || entry.name?.charAt(0) || "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{entry.name || "User"}</p>
                    <p className="text-[10px] text-text-dim">{entry.referralCount} referrals</p>
                  </div>
                  <span className="math-text text-sm font-bold text-primary">+{entry.xpEarned} XP</span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
