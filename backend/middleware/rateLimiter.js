import rateLimit from "express-rate-limit";

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

/* ── General: 200 requests per minute per IP ── */
export const generalLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             200,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         limitReached,
  skip:            (req) => !req.path.startsWith("/api/"),
});

/* ── Contact: 5 submissions per hour ── */
export const contactLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             5,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         limitReached,
});