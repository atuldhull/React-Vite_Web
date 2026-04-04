import session from "express-session";

/**
 * Centralised session middleware to keep auth behaviour consistent.
 * NOTE: Values mirror previous inline config to avoid behaviour changes.
 */
const oneWeekMs = 1000 * 60 * 60 * 24 * 7;

export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "math_collective_secret_2026",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: oneWeekMs,
  },
});

export default sessionMiddleware;
