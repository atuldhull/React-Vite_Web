/**
 * Express application factory.
 *
 * Splits out the HTTP app from the Socket.IO / server-listen concerns that
 * used to share server.js. Makes the app unit-testable (supertest can boot
 * this directly) and keeps the entrypoint under 40 lines.
 */

import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import helmet  from "helmet";
import cors    from "cors";

import { generalLimiter } from "./middleware/rateLimiter.js";
import { injectTenant }   from "./middleware/tenantMiddleware.js";
import { sessionMiddleware } from "./middleware/sessionConfig.js";

import registerApiRoutes from "./routes/registerRoutes.js";
import pageRoutes        from "./routes/pageRoutes.js";
import authController    from "./controllers/authController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR   = path.join(PROJECT_ROOT, "public");
const SPA_INDEX    = path.join(PUBLIC_DIR, "app", "index.html");

export function createApp() {
  const isProd = process.env.NODE_ENV === "production";
  const app = express();

  /* ── SECURITY ── */
  app.use(helmet({
    contentSecurityPolicy: false,      // CSP would break inline scripts in SPA
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors({
    origin:      isProd ? process.env.FRONTEND_URL || false : true,
    credentials: true,
  }));

  /* ── PARSERS + SESSION ── */
  app.use(express.static(PUBLIC_DIR));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json({
    limit: "2mb",
    // Preserve raw body bytes for the Razorpay webhook so we can HMAC-verify
    // the signature. JSON.stringify(req.body) is NOT byte-stable with what
    // Razorpay signed — different key order / whitespace breaks the match.
    verify: (req, _res, buf) => {
      if (req.originalUrl === "/api/payment/webhook") {
        req.rawBody = buf;
      }
    },
  }));
  app.use(sessionMiddleware);

  /* ── TENANT + RATE LIMIT ── */
  app.use("/api", injectTenant);
  app.use("/api/", generalLimiter);

  /* ── API ROUTES ── */
  registerApiRoutes(app);

  /* ── Global logout (works from any page) ── */
  app.get("/logout", authController.logoutRedirect);

  /* ── DEBUG ──
     Disabled entirely in production — leaks session info + row counts.
     In dev it still requires admin role. */
  if (!isProd) {
    app.get("/api/debug", async (req, res) => {
      const role = req.session?.user?.role;
      if (role !== "admin" && role !== "super_admin") {
        return res.status(403).json({ error: "Admin role required" });
      }
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { count: c } = await sb.from("challenges").select("*", { count: "exact", head: true }).eq("is_active", true);
      const { count: s } = await sb.from("students").select("*", { count: "exact", head: true });
      res.json({ session: req.session?.user || null, activeChallenges: c, totalStudents: s });
    });
  }

  /* ── PAGE ROUTES ── */
  app.use("/", pageRoutes);

  /* ── 404 — serve SPA for unmatched client-side routes ── */
  app.use((req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
    res.sendFile(SPA_INDEX);
  });

  /* ── ERROR HANDLER ── */
  app.use((err, req, res, _next) => {
    console.error("[ERROR]", err.stack);
    if (req.path.startsWith("/api/")) return res.status(500).json({ error: "Internal server error" });
    res.sendFile(SPA_INDEX);
  });

  return app;
}

export { PUBLIC_DIR, SPA_INDEX, PROJECT_ROOT };
