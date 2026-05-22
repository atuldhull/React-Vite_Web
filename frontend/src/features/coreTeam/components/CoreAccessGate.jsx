import { useState } from "react";
import { motion } from "framer-motion";
import { core } from "@/lib/api";
import { useCoreStore } from "@/store/core-store";
import Button from "@/components/ui/Button";

/**
 * Shown inside the portal when an authenticated user is NOT yet a core
 * member. They redeem their private access code here to unlock it.
 */
export default function CoreAccessGate() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);
  const fetchMe = useCoreStore((s) => s.fetchMe);

  const redeem = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await core.redeem(code.trim());
      setOk(true);
      setTimeout(() => fetchMe(), 800);
    } catch (e2) {
      setErr(e2?.response?.data?.error || "Could not redeem that code.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-line/15 bg-surface/70 p-8 shadow-panel backdrop-blur-2xl"
        style={{ borderTop: "2px solid #7c3aed" }}
      >
        <span className="pointer-events-none absolute right-[-3rem] top-[-3rem] h-40 w-40 rounded-full bg-primary/20 blur-3xl" />

        <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-primary/80">
          Club Asymptotes
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-[-0.04em] text-white">
          Core Team Portal
        </h1>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          This workspace is for the club&apos;s council, team heads and core members.
          Enter the private access code you were given to unlock it.
        </p>

        {ok ? (
          <div className="mt-6 rounded-xl border border-success/30 bg-success/10 px-4 py-4 text-center">
            <p className="text-2xl">✓</p>
            <p className="mt-1 text-sm text-success">Code accepted — opening the portal…</p>
          </div>
        ) : (
          <form onSubmit={redeem} className="mt-6 space-y-3">
            <label className="block font-mono text-[10px] uppercase tracking-[0.24em] text-text-dim">
              Access code
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ASYM-XXXX"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-line/20 bg-black/30 px-4 py-3 text-center font-mono text-lg tracking-[0.3em] text-white outline-none transition focus:border-primary/50"
            />
            {err && (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {err}
              </p>
            )}
            <Button type="submit" variant="primary" size="md" loading={busy} className="w-full" magnetic={false}>
              Unlock Portal
            </Button>
            <p className="pt-1 text-center text-[11px] text-text-dim">
              Don&apos;t have a code? Contact the club council.
            </p>
          </form>
        )}
      </motion.div>
    </div>
  );
}
