import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import { useMonument } from "@/hooks/useMonument";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import { useAuthStore } from "@/store/auth-store";
import http from "@/lib/http";

export default function RegisterPage() {
  useMonument("city");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const register = useAuthStore((s) => s.register);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Referral code from URL (?ref=MATH-XXXXX)
  const [refCode] = useState(() => searchParams.get("ref") || "");
  const [refValid, setRefValid] = useState(null); // null=checking, true/false
  const [refName, setRefName] = useState("");

  useEffect(() => {
    if (!refCode) { setRefValid(null); return; }
    http.get(`/referral/validate/${refCode}`)
      .then((res) => {
        setRefValid(res.data?.valid || false);
        setRefName(res.data?.referrerName || "");
      })
      .catch(() => setRefValid(false));
  }, [refCode]);

  // Check if registrations are open
  const [regOpen, setRegOpen] = useState(null); // null = loading, true/false = known
  const [regMessage, setRegMessage] = useState("");

  useEffect(() => {
    http.get("/events/settings")
      .then((res) => {
        const settings = res.data || {};
        const isOpen = settings.registrations_open !== "false";
        setRegOpen(isOpen);
        if (!isOpen) {
          setRegMessage(
            settings.registration_message ||
            "Registrations are currently closed. The admin will reopen them soon — check back later!"
          );
        }
      })
      .catch(() => {
        // If settings fail to load, allow registration (fail open)
        setRegOpen(true);
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await register(form.name, form.email, form.password);
      // Apply referral code if present (after account creation, before redirect)
      if (refCode && refValid) {
        try {
          await http.post("/referral/apply", { code: refCode });
        } catch { /* referral is best-effort, don't block registration */ }
      }
      navigate("/login");
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  // ── Loading state while checking registration status ──
  if (regOpen === null) {
    return (
      <div style={{ position: "relative" }}>
        <MonumentBackground monument="city" intensity={0.35} />
        <div className="relative z-10 flex min-h-[40vh] items-center justify-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="math-text text-4xl"
            style={{ color: "var(--monument-city)" }}
          >
            ∑
          </motion.div>
        </div>
      </div>
    );
  }

  // ── Registrations CLOSED ──
  if (!regOpen) {
    return (
      <div style={{ position: "relative" }}>
        <MonumentBackground monument="city" intensity={0.35} />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 w-full"
        >
          <div
            className="relative overflow-hidden border border-line/20 bg-surface/60 p-8 shadow-panel backdrop-blur-2xl sm:p-10"
            style={{ clipPath: "var(--clip-notch)", borderTop: "2px solid var(--monument-city)" }}
          >
            {/* Background symbol */}
            <span
              className="math-text pointer-events-none absolute right-4 top-4 select-none"
              style={{ fontSize: "6rem", opacity: 0.04, lineHeight: 1 }}
            >
              🔒
            </span>

            <div className="text-center">
              {/* Lock icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", bounce: 0.4, delay: 0.3 }}
                className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-danger/30 bg-danger/10"
              >
                <svg className="h-10 w-10 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-6 text-2xl font-extrabold tracking-[-0.03em] text-white sm:text-3xl"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Registrations Closed
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-text-muted"
              >
                {regMessage}
              </motion.p>

              {/* Countdown-style visual */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                className="mx-auto mt-6 max-w-xs rounded-xl border border-line/15 bg-black/20 p-4"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-text-dim">What to do</p>
                <div className="mt-3 space-y-2 text-left text-xs text-text-muted">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">→</span>
                    <span>Ask your admin or teacher when registrations reopen</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">→</span>
                    <span>If you already have an account, sign in below</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">→</span>
                    <span>Check the leaderboard and events while you wait</span>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1 }}
                className="mt-6 flex flex-wrap justify-center gap-3"
              >
                <Link to="/login">
                  <Button size="lg">Sign In Instead</Button>
                </Link>
                <Link to="/leaderboard">
                  <Button variant="ghost" size="lg">View Leaderboard</Button>
                </Link>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Registrations OPEN — normal form ──
  return (
    <div style={{ position: "relative" }}>
      <MonumentBackground monument="city" intensity={0.35} />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full"
      >
        <div
          className="relative overflow-hidden border border-line/20 bg-surface/60 p-8 shadow-panel backdrop-blur-2xl sm:p-10"
          style={{ clipPath: "var(--clip-notch)", borderTop: "2px solid var(--monument-city)" }}
        >
          <span
            className="math-text pointer-events-none absolute right-4 top-4 select-none"
            style={{ fontSize: "6rem", opacity: 0.04, lineHeight: 1 }}
          >
            ∑
          </span>

          <div className="mb-8">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-secondary">Join the Collective</p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.05em] text-white sm:text-4xl" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "2rem" }}>
              Create your account
            </h1>
            <p className="mt-3 text-sm text-text-muted">
              Start solving challenges, competing in events, and climbing the ranks.
            </p>
          </div>

          {/* Referral banner */}
          {refCode && refValid && (
            <div className="mb-5 border border-success/30 bg-success/10 px-4 py-3 text-sm text-success" style={{ clipPath: "var(--clip-notch)" }}>
              🎁 Referred by <strong>{refName}</strong> — you'll get <strong>50 bonus XP</strong> after signing up!
            </div>
          )}
          {refCode && refValid === false && (
            <div className="mb-5 border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning" style={{ clipPath: "var(--clip-notch)" }}>
              Invalid referral code — but you can still register!
            </div>
          )}

          {error && (
            <div className="mb-5 border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" style={{ clipPath: "var(--clip-notch)" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <InputField label="Full Name" placeholder="Your display name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <InputField label="Email" type="email" placeholder="you@university.edu" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <InputField label="Password" type="password" placeholder="Create a secure password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <InputField label="Confirm Password" type="password" placeholder="Confirm your password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required />
            <Button type="submit" loading={loading} className="w-full justify-center" size="lg">
              Create Account
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-text-muted">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-primary transition hover:text-secondary">
              Sign in
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
