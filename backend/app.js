/**
 * Express application factory.
 *
 * Splits out the HTTP app from the Socket.IO / server-listen concerns that
 * used to share server.js. Makes the app unit-testable (supertest can boot
 * this directly) and keeps the entrypoint under 40 lines.
 */

import path from "path";
import fs from "node:fs";
import { fileURLToPath } from "url";
import express from "express";
import cookieParser from "cookie-parser";
import yaml from "yaml";
import swaggerUi from "swagger-ui-express";

import { generalLimiter }     from "./middleware/rateLimiter.js";
import { injectTenant }       from "./middleware/tenantMiddleware.js";
import { sessionMiddleware }  from "./middleware/sessionConfig.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { responseShapeMiddleware } from "./middleware/errorShape.js";
import { csrfProtection, invalidCsrfTokenError } from "./middleware/csrfProtection.js";
import { requestLoggerMiddleware } from "./middleware/requestLogger.js";
import { logger }              from "./config/logger.js";
import { captureException }    from "./config/sentry.js";
import {
  applyHelmet,
  applyCors,
  applyHPP,
  applyRequestLogger,
} from "./middleware/security.js";

import registerApiRoutes from "./routes/registerRoutes.js";
import csrfRoutes        from "./routes/csrfRoutes.js";
import authController    from "./controllers/authController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR   = path.join(PROJECT_ROOT, "public");
const SPA_INDEX    = path.join(PUBLIC_DIR, "app", "index.html");

export function createApp() {
  // isProd is read from env via the validateEnv() return value at boot;
  // app.js is also created from tests where NODE_ENV may not be set, so
  // we keep this lookup local rather than threading the env object in.
  // (Used by the dev-only debug route below.)
  const isProd = process.env.NODE_ENV === "production";
  const app = express();

  /* ── TRUST PROXY ──
     Production runs behind a reverse proxy (Render / Fly / nginx /
     Cloudflare). Without this, req.ip resolves to the proxy's loopback
     address — every per-IP rate limit (auth, contact, AI, payment,
     general) ends up keyed on the same IP for every user, so they all
     share one bucket. Setting trust proxy = 1 tells Express to read
     the FIRST entry in the X-Forwarded-For chain.

     The "1" is deliberate — DON'T trust the entire chain. A spoofed
     X-Forwarded-For header from an attacker becomes the perceived
     client IP otherwise; trusting only the immediate proxy means the
     attacker would need to be that proxy. (Set higher only if you
     genuinely run multiple stacked proxies you control end to end.)

     Also makes the session cookie's `secure: isProd` actually fire —
     express-session checks req.secure (which derives from req.protocol,
     which derives from X-Forwarded-Proto, which trust proxy enables).
     Without this, the cookie is silently dropped on HTTPS deploys
     because express-session sees req.secure === false. */
  app.set("trust proxy", 1);

  /* ── REQUEST ID ──
     First in the chain so every other middleware (including helmet,
     cors, body parsers, and the final error handler) has access to
     req.id and the AsyncLocalStorage context. */
  app.use(requestIdMiddleware);

  /* ── RESPONSE SHAPE ──
     Patches res.json so error responses automatically carry a
     requestId without every controller having to remember. Mounted
     here because it needs req.id (set above) and must be active
     before any controller's res.json call runs. */
  app.use(responseShapeMiddleware);

  /* ── SECURITY ──
     Wire up the hardening that lives in middleware/security.js. This
     replaces the previous inline helmet()/cors() calls which had CSP
     disabled with a stale "would break inline scripts" comment — the
     SPA's index.html actually has zero inline scripts (Vite emits
     external module bundles), so a strict CSP is fine. The same file
     also gives us tighter CORS (localhost regex + FRONTEND_URL only)
     and HTTP Parameter Pollution defence.

     Deliberately NOT wired: applyInputSanitizer. It strips substrings
     like "DROP TABLE" / "<script>" from request bodies, which mangles
     legitimate content (a forum post about SQL would lose words) and
     gives a false sense of security. Supabase's parameterised queries
     make string-level SQL-injection scrubbing unnecessary, and React
     handles XSS at OUTPUT — not at input. The right defence is
     schema-validation (Zod), not regex laundering of user data. */
  applyHelmet(app);          // Strict CSP + frame deny + HSTS + nosniff
  applyCors(app);            // Allowlist: localhost + FRONTEND_URL only
  applyHPP(app);             // Collapse duplicated query keys to last value
  applyRequestLogger(app);   // 400 on path-traversal / SQL-injection / scanner patterns

  /* ── PARSERS + SESSION ── */
  // Block source-map files in production before static serves them.
  // The Vite build emits *.js.map next to each minified bundle for
  // local dev debugging; exposing them on the public origin lets an
  // attacker reconstruct the un-minified source. Dev + test keep them
  // available so the browser devtools stack traces stay readable.
  if (process.env.NODE_ENV === "production") {
    app.use((req, res, next) => {
      if (req.path.endsWith(".map")) return res.status(404).end();
      next();
    });
  }
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

  /* ── REQUEST LOGGER ──
     Mounted AFTER session so userId / orgId are populated when the
     `finish` event fires. Emits ONE structured log line per request
     end-of-cycle: { method, url, status, latencyMs, userId, orgId,
     requestId }. Skips /api/health and /api/ready (uptime monitor
     traffic would drown real signal otherwise). */
  app.use(requestLoggerMiddleware);

  /* ── COOKIES + CSRF ──
     cookie-parser must run before csrfProtection — the CSRF lib reads
     the paired-hash cookie via req.cookies. csrfProtection itself
     skips GET/HEAD/OPTIONS and a small allow-list (webhook, the
     token endpoint, health probes) — see middleware/csrfProtection.js
     for the full skip list and the rationale.

     The token endpoint is mounted BEFORE csrfProtection so it can be
     called without already having a token. */
  app.use(cookieParser());
  app.use("/api/csrf-token", csrfRoutes);
  app.use("/api", csrfProtection);

  /* ── TENANT + RATE LIMIT ── */
  app.use("/api", injectTenant);
  app.use("/api/", generalLimiter);

  /* ── API ROUTES ── */
  registerApiRoutes(app);

  /* ── Global logout (works from any page) ── */
  app.get("/logout", authController.logoutRedirect);

  /* ── API DOCS (dev only) ──
     Serves the hand-maintained OpenAPI spec at /api/docs via
     swagger-ui-express. In production this is OFF — we don't want
     to advertise the API surface to the internet. (If you ever
     want it on in prod, gate it behind requireSuperAdmin.) */
  if (!isProd) mountSwaggerDocs(app);

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

  /* The SPA lives at /app/ (Vite base + React Router basename). If a user
     hits the bare root, redirect to /app/ so the router's basename matches.
     302 (not a rewrite) so the URL in the address bar is honest about
     where the SPA is mounted. */
  app.get("/", (_req, res) => res.redirect(302, "/app/"));

  /* ── SPA fallback — any non-API path renders the React SPA.
     express.static handles /app/assets/* etc. above; this catches everything
     else (e.g. direct-link entry to /app/dashboard) and lets client-side
     routing take over. */
  app.use((req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
    res.sendFile(SPA_INDEX);
  });

  /* ── ERROR HANDLER ──
     Logs the error with structured fields (requestId is attached
     automatically by the logger's ALS mixin) and includes req.id in
     the JSON 500 so a user reporting a problem can paste the id and
     we can grep it directly out of the logs.

     CSRF rejections are recognised and downgraded to 403 — they're
     not "server errors" but client/policy errors, and lumping them
     into the 500 stream would muddy the alerting. */
  app.use((err, req, res, _next) => {
    if (err === invalidCsrfTokenError || err?.code === "EBADCSRFTOKEN") {
      logger.warn({
        method: req.method,
        url:    req.originalUrl,
        ip:     req.ip,
      }, "csrf token rejected");
      return res.status(403).json({
        error:     "Invalid or missing CSRF token",
        code:      "CSRF_INVALID",
        requestId: req.id,
      });
    }

    logger.error({
      err,
      method: req.method,
      url:    req.originalUrl,
    }, "unhandled error in request");

    // Forward to Sentry (no-op when SENTRY_DSN isn't set). We pass
    // requestId/userId/orgId so the issue is searchable by the id
    // a user quotes from their error toast. CSRF is filtered above
    // already — those don't reach this branch.
    captureException(err, {
      requestId: req.id,
      userId:    req.session?.user?.id,
      orgId:     req.session?.user?.org_id,
      url:       req.originalUrl,
      method:    req.method,
    });

    if (req.path.startsWith("/api/")) {
      return res.status(500).json({ error: "Internal server error", requestId: req.id });
    }
    res.sendFile(SPA_INDEX);
  });

  return app;
}

/**
 * Mount Swagger UI for the hand-maintained OpenAPI spec.
 *
 * Synchronous (imports hoisted to module top) so the route is in
 * place before createApp() returns — the previous lazy version
 * raced against tests that hit /api/docs immediately after boot.
 *
 * Spec source: docs/openapi.yaml — checked into git, hand-edited.
 * Adding a new endpoint? Update the YAML in the same PR (same
 * policy as the coverage-include list in vitest.config.js).
 *
 * Also exposes the parsed spec at /api/docs/openapi.json for tools
 * (e.g. `openapi-typescript` for generating typed clients).
 */
function mountSwaggerDocs(app) {
  const specPath = path.join(PROJECT_ROOT, "docs", "openapi.yaml");
  if (!fs.existsSync(specPath)) {
    logger.warn({ specPath }, "openapi.yaml not found — /api/docs disabled");
    return;
  }
  const spec = yaml.parse(fs.readFileSync(specPath, "utf8"));

  // Order matters: register the JSON endpoint BEFORE the swagger UI
  // mount. swaggerUi.serve is `app.use("/api/docs", ...)` which
  // catches every path starting with /api/docs — including
  // /api/docs/openapi.json — and returns its own (non-JSON) response.
  app.get("/api/docs/openapi.json", (_req, res) => res.json(spec));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec, {
    customSiteTitle: "Math Collective API — docs",
    swaggerOptions: { docExpansion: "list" },
  }));
}

export { PUBLIC_DIR, SPA_INDEX, PROJECT_ROOT };
