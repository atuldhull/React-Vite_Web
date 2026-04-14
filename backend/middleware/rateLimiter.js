import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const limitReached = (req, res) => {
  res.status(429).json({
    error:   "Too many requests",
    message: "You're doing that too fast. Please slow down and try again in a moment.",
  });
};

/* ── Auth: 10 attempts per 15 mins (login/register) ── */
export const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         limitReached,
  skip: (req) => req.method === "GET",
});

/* ── Arena: 15 questions per hour per user ── */
export const arenaLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             15,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    (req) => req.session?.user?.id || "anon",
  skip:            (req) => !req.session?.user?.id,
  handler: (req, res) => {
    res.status(429).json({
      error:   "Hourly limit reached",
      message: "You've answered 15 questions this hour. Come back later — quality over quantity! 🧠",
    });
  },
});

/* ── General: 200 requests per minute per IP ──
   Skips:
   - Anything outside /api/ (handled by static serving / SPA fallback).
   - /api/health and /api/ready — uptime monitors and load balancers
     poll these every few seconds; rate-limiting them would falsely
     mark the instance unhealthy. Both endpoints do trivial work and
     leak no secrets, so they're safe to leave open. */
export const generalLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             200,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         limitReached,
  skip: (req) => {
    if (!req.path.startsWith("/api/")) return true;
    if (req.path === "/api/health" || req.path === "/api/ready") return true;
    return false;
  },
});

/* ── Contact: 5 submissions per hour ── */
export const contactLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             5,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         limitReached,
});

/* ── AI: 20 requests per hour per user ──
   Every hit talks to OpenRouter and costs real money. 20/hour is
   generous for a single human but prevents a runaway loop or
   credential-stuffing attack from draining the API budget in minutes.
   Per-USER key (not per-IP) so a whole CS lab on one NAT doesn't
   share the quota. Unauthenticated callers can't reach AI routes
   (requireAuth upstream), so there's no anon fallback case. */
export const aiLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  // Per-user key; fall back to the library's IP helper (handles IPv6
  // correctly — raw req.ip would let v6 callers bypass the limit by
  // flipping their prefix).
  keyGenerator:    (req) => req.session?.user?.id || ipKeyGenerator(req.ip),
  handler: (req, res) => {
    res.status(429).json({
      error:   "AI limit reached",
      message: "You've hit the hourly AI-request limit (20/hr). Try again later.",
    });
  },
});

/* ── Payment: 10 requests per 10 minutes per org ──
   Create-order + verify are protected by admin auth already, so the
   attacker surface is narrow (compromised admin session or a
   misbehaving client retrying forever). Razorpay itself rate-limits
   by API key, but if we hit THAT ceiling our whole org stalls —
   better to catch hot-loops here first. Key by org_id, not user, so
   two admins working concurrently during a release share quota but
   a stuck client can't exhaust the whole org's budget.
   (IP fallback when orgId is somehow missing — should never happen
   behind requireAdmin.) */
export const paymentLimiter = rateLimit({
  windowMs:        10 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    (req) => req.orgId || ipKeyGenerator(req.ip),
  handler: (req, res) => {
    res.status(429).json({
      error:   "Payment rate limit",
      message: "Too many payment attempts. Wait a few minutes and try again.",
    });
  },
});