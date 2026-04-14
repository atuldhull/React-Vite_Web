/**
 * Health + readiness probes.
 *
 * Two distinct endpoints because they answer two distinct questions
 * (Kubernetes-style separation, but useful for any uptime monitor):
 *
 *   GET /api/health
 *     "Is the Node process alive?" — no I/O, no DB, sub-ms.
 *     Used by load balancers / process managers for "should I keep
 *     this instance in rotation?". Always 200 unless the process is
 *     actually crashed (in which case it can't reply at all).
 *
 *   GET /api/ready
 *     "Can this process serve real user requests right now?" — checks
 *     Supabase connectivity + that the critical env vars are set.
 *     Returns 503 with a per-check breakdown when something's wrong, so
 *     an operator can tell whether the DB is down vs. config is missing.
 *
 * Both are PUBLIC (no auth) because monitors can't carry sessions.
 * Neither response leaks secrets — only the names of failed checks.
 */

import supabase from "../config/supabase.js";

// Env vars the server genuinely cannot operate without. NOT a place
// for "nice to have" vars — those go in the env-validation step
// (1.2). This list is the absolute minimum for the API to function.
const CRITICAL_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SESSION_SECRET",
];

const startedAt = new Date();

/**
 * GET /api/health — liveness.
 * Always answers 200 if Node is alive enough to respond. No DB hit.
 */
export const getHealth = (_req, res) => {
  res.json({
    status:    "ok",
    uptimeSec: Math.floor(process.uptime()),
    startedAt: startedAt.toISOString(),
  });
};

/**
 * GET /api/ready — readiness.
 * Probes Supabase + env. 200 = serving traffic safely; 503 = don't.
 */
export const getReady = async (_req, res) => {
  const checks = {};

  // 1. Critical env vars present
  const missingEnv = CRITICAL_ENV.filter((k) => !process.env[k]);
  checks.env = missingEnv.length === 0
    ? { ok: true }
    : { ok: false, missing: missingEnv };

  // 2. Supabase reachable. We use a HEAD-style count on a known table
  //    (students) — no rows transferred, just confirms the connection
  //    works and the service-role key is accepted. Bounded with a 3s
  //    timeout so a hung Supabase doesn't hang the probe.
  checks.supabase = await withTimeout(3000, async () => {
    const { error } = await supabase
      .from("students")
      .select("*", { count: "exact", head: true });
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  }).catch((err) => ({ ok: false, reason: err.message || "timeout" }));

  const allOk = Object.values(checks).every((c) => c.ok);
  res.status(allOk ? 200 : 503).json({
    status:    allOk ? "ready" : "not_ready",
    uptimeSec: Math.floor(process.uptime()),
    checks,
  });
};

/**
 * Run an async function with a hard timeout. Returns the function's
 * result on success, or a `{ ok: false, reason: "timeout" }` object
 * if the timer fires first. We can't AbortSignal the supabase-js call
 * (the SDK doesn't support it), so this is a best-effort wrapper —
 * the underlying request still completes in the background, but the
 * probe returns within the budget.
 */
function withTimeout(ms, fn) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fn().then((v) => { clearTimeout(timer); resolve(v); },
            (e) => { clearTimeout(timer); reject(e); });
  });
}
