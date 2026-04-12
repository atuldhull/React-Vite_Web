import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import { useMonument } from "@/hooks/useMonument";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import { useAuthStore } from "@/store/auth-store";
import { auth } from "@/lib/api";
import http from "@/lib/http";
import { dashboardForRole } from "@/lib/roles";

export default function LoginPage() {
  useMonument("city");
  const navigate = useNavigate();
  const location = useLocation();
  // If ProtectedRoute bounced a guest here, go back there after login.
  const returnTo = location.state?.from || null;

  // ── Handle Supabase password recovery redirect ──
  // Supabase sends: /login#access_token=xxx&type=recovery
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newPwConfirm, setNewPwConfirm] = useState("");
  const [recoveryToken, setRecoveryToken] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryMsg, setRecoveryMsg] = useState(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("type=recovery")) {
      const params = new URLSearchParams(hash.replace("#", "?"));
      const token = params.get("access_token");
      if (token) {
        setRecoveryMode(true);
        setRecoveryToken(token);
        // Clean URL
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, []);

  const handleRecovery = async (e) => {
    e.preventDefault();
    if (newPw.length < 6) { setRecoveryMsg({ type: "error", text: "Password must be at least 6 characters" }); return; }
    if (newPw !== newPwConfirm) { setRecoveryMsg({ type: "error", text: "Passwords don't match" }); return; }
    setRecoveryLoading(true);
    setRecoveryMsg(null);
    try {
      // Call backend to update password using the recovery token
      await http.post("/auth/reset-password", { access_token: recoveryToken, new_password: newPw });
      setRecoveryMsg({ type: "success", text: "Password updated! You can now sign in." });
      setTimeout(() => { setRecoveryMode(false); }, 2000);
    } catch (err) {
      setRecoveryMsg({ type: "error", text: err.response?.data?.error || "Failed to reset password" });
    }
    setRecoveryLoading(false);
  };
  const login = useAuthStore((s) => s.login);
  const clearError = useAuthStore((s) => s.clearError);
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMsg, setForgotMsg] = useState(null);
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleForgot = async (e) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotLoading(true);
    setForgotMsg(null);
    try {
      const { data } = await auth.forgotPassword(forgotEmail);
      setForgotMsg({ type: "success", text: data.message || "Reset email sent! Check your inbox." });
    } catch (err) {
      setForgotMsg({ type: "error", text: err.response?.data?.error || "Failed to send reset email" });
    }
    setForgotLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    clearError();
    try {
      const data = await login(form.email, form.password);
      // Priority: the path the user was trying to reach > backend hint > role default.
      // `replace: true` so the back button does not bring the user back to /login.
      const target =
        returnTo
          || data?.redirectTo
          || dashboardForRole(data?.user?.role || data?.role);
      navigate(target, { replace: true });
    } catch (err) {
      const msg = err.message || "Login failed";
      if (msg === "EMAIL_NOT_VERIFIED" || msg.includes("verify")) {
        setError("Please verify your email first. Check your inbox for the confirmation link.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Recovery mode UI ──
  if (recoveryMode) {
    return (
      <div style={{ position: "relative" }}>
        <MonumentBackground monument="city" intensity={0.35} />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full">
          <div
            className="relative overflow-hidden border border-line/20 bg-surface/60 p-8 shadow-panel backdrop-blur-2xl sm:p-10"
            style={{ clipPath: "var(--clip-notch)", borderTop: "2px solid var(--monument-city)" }}
          >
            {/* Background math symbol */}
            <span
              className="math-text pointer-events-none absolute right-4 top-4 select-none"
              style={{ fontSize: "6rem", opacity: 0.04, lineHeight: 1 }}
            >
              λ
            </span>

            <p className="font-mono text-xs uppercase tracking-[0.3em] text-success">Password Recovery</p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.05em] text-white" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "2rem" }}>
              Set New Password
            </h1>
            <p className="mt-3 text-sm text-text-muted">Enter your new password below.</p>

            {recoveryMsg && (
              <div className={`mt-5 border px-4 py-3 text-sm ${recoveryMsg.type === "success" ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger"}`} style={{ clipPath: "var(--clip-notch)" }}>
                {recoveryMsg.text}
              </div>
            )}

            <form onSubmit={handleRecovery} className="mt-6 space-y-5">
              <InputField label="New Password" type="password" placeholder="Min 6 characters" value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
              <InputField label="Confirm Password" type="password" placeholder="Repeat password" value={newPwConfirm} onChange={(e) => setNewPwConfirm(e.target.value)} required />
              <Button type="submit" loading={recoveryLoading} className="w-full justify-center" size="lg">
                Update Password
              </Button>
            </form>

            <Button variant="ghost" size="sm" onClick={() => setRecoveryMode(false)} className="mt-4 w-full justify-center">
              Back to sign in
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

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
          {/* Background math symbol */}
          <span
            className="math-text pointer-events-none absolute right-4 top-4 select-none"
            style={{ fontSize: "6rem", opacity: 0.04, lineHeight: 1 }}
          >
            λ
          </span>

          <div className="mb-8">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Welcome Back</p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.05em] text-white sm:text-4xl" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "2rem" }}>
              Sign in to your account
            </h1>
            <p className="mt-3 text-sm text-text-muted">
              Continue your math journey. Your challenges are waiting.
            </p>
          </div>

          {error && (
            <div className="mb-5 border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" style={{ clipPath: "var(--clip-notch)" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <InputField
              label="Email"
              type="email"
              placeholder="you@university.edu"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <InputField
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <Button type="submit" loading={loading} className="w-full justify-center" size="lg">
              Sign In
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForgot(true)} className="w-full justify-center">
              Forgot password?
            </Button>
          </form>

          {/* Forgot Password */}
          {showForgot && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              className="mt-5 border border-line/15 bg-panel/50 p-5" style={{ clipPath: "var(--clip-notch)" }}>
              <p className="text-sm font-medium text-white">Reset your password</p>
              <p className="mt-1 text-xs text-text-dim">We'll send a reset link to your email</p>
              {forgotMsg && (
                <div className={`mt-3 px-3 py-2 text-xs ${forgotMsg.type === "success" ? "border border-success/30 bg-success/10 text-success" : "border border-danger/30 bg-danger/10 text-danger"}`}>
                  {forgotMsg.text}
                </div>
              )}
              <form onSubmit={handleForgot} className="mt-3 flex gap-2">
                <InputField
                  type="email"
                  placeholder="your@email.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  className="flex-1"
                />
                <Button type="submit" size="sm" loading={forgotLoading}>Send</Button>
              </form>
              <Button variant="ghost" size="sm" onClick={() => setShowForgot(false)} className="mt-2">Cancel</Button>
            </motion.div>
          )}

          <div className="mt-6 text-center text-sm text-text-muted">
            Don't have an account?{" "}
            <Link to="/register" className="font-medium text-primary transition hover:text-secondary">
              Create one
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
