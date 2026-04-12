import session from "express-session";

const isProd = process.env.NODE_ENV === "production";
const oneWeekMs = 1000 * 60 * 60 * 24 * 7;

export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "math_collective_secret_2026",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,             // HTTPS only in production
    sameSite: isProd ? "strict" : "lax", // CSRF protection
    maxAge: oneWeekMs,
  },
});

export default sessionMiddleware;
