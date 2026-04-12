/**
 * SECURITY MIDDLEWARE
 * Math Collective — full protection layer
 *
 * What each piece does (plain English):
 *
 * 1. Helmet       — sets HTTP security headers so browsers block XSS,
 *                   clickjacking, MIME sniffing attacks automatically
 *
 * 2. CORS         — only allows requests from your own domain,
 *                   blocks random websites from calling your API
 *
 * 3. HPP          — blocks HTTP Parameter Pollution
 *                   e.g. someone sending ?role=student&role=admin
 *
 * 4. Input sanitizer — strips <script> tags and SQL injection
 *                   attempts from ALL request bodies automatically
 *
 * 5. Request size limit — blocks huge payloads (file bombs, DoS attacks)
 *
 * 6. Admin page protection — /admin page itself now requires session,
 *                   not just the API routes
 *
 * 7. Secure session — cookie is httpOnly, sameSite, secure in prod
 */

import helmet    from "helmet";
import cors      from "cors";

/* ══════════════════════════════════════════
   1. HELMET — Security Headers
   Tells browsers to enforce security policies.
   Prevents XSS, clickjacking, MIME sniffing.
══════════════════════════════════════════ */
export function applyHelmet(app) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:     ["'self'"],
        scriptSrc:      ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "unpkg.com", "esm.sh"],
        styleSrc:       ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
        fontSrc:        ["'self'", "fonts.gstatic.com", "cdn.jsdelivr.net"],
        imgSrc:         ["'self'", "data:", "blob:", "api.dicebear.com", "*.supabase.co"],
        connectSrc:     ["'self'", "*.supabase.co", "api.openrouter.ai", "api.dicebear.com", "openrouter.ai"],
        frameSrc:       ["'none'"],
        objectSrc:      ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    // Prevent clickjacking — stops your site being embedded in iframes
    frameguard:          { action: "deny" },
    // Stop browsers guessing content types
    noSniff:             true,
    // Force HTTPS in prod
    hsts:                process.env.NODE_ENV === "production"
                           ? { maxAge: 31536000, includeSubDomains: true }
                           : false,
    // Hide that you're using Express
    hidePoweredBy:       true,
    // Block old IE XSS filter bugs
    xssFilter:           true,
    // Prevent browsers from sending referrer to external sites
    referrerPolicy:      { policy: "strict-origin-when-cross-origin" },
  }));
}

/* ══════════════════════════════════════════
   2. CORS — Cross-Origin Resource Sharing
   Only YOUR domain can call the API.
   Blocks random websites from using your endpoints.
══════════════════════════════════════════ */
export function applyCors(app) {
  const allowedOrigins = [
    /^http:\/\/localhost(:\d+)?$/,         // local dev
    /^http:\/\/127\.0\.0\.1(:\d+)?$/,      // local dev alternate
    process.env.FRONTEND_URL,              // set this in .env.local = https://yourdomain.com
  ].filter(Boolean);

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Postman, server-to-server)
      if (!origin) return callback(null, true);
      const allowed = allowedOrigins.some(o =>
        typeof o === "string" ? o === origin : o.test(origin)
      );
      if (allowed) callback(null, true);
      else callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials:      true,   // allow cookies
    methods:          ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders:   ["Content-Type", "Authorization"],
  }));
}

/* ══════════════════════════════════════════
   3. INPUT SANITIZER
   Strips dangerous characters from all
   request bodies, queries, and params.
   Prevents XSS and basic injection attacks.
══════════════════════════════════════════ */
function sanitizeValue(val) {
  if (typeof val !== "string") return val;
  return val
    // Strip script tags
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    // Strip event handlers like onclick=, onerror= etc
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, "")
    // Strip javascript: protocol
    .replace(/javascript\s*:/gi, "")
    // Strip data: URIs in unexpected places
    .replace(/data\s*:\s*text\/html/gi, "")
    // Strip SQL injection basics (doesn't replace legit content)
    .replace(/;\s*DROP\s+TABLE/gi, "")
    .replace(/;\s*DELETE\s+FROM/gi, "")
    .replace(/UNION\s+SELECT/gi, "")
    .trim();
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== "object") return obj;
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "string") {
      obj[key] = sanitizeValue(obj[key]);
    } else if (typeof obj[key] === "object") {
      obj[key] = sanitizeObject(obj[key]);
    }
  }
  return obj;
}

export function applyInputSanitizer(app) {
  app.use((req, res, next) => {
    // Sanitize body (can be reassigned)
    if (req.body) req.body = sanitizeObject(req.body);

    // Sanitize query — Express 5 made req.query read-only, mutate keys in place
    if (req.query) {
      for (const key of Object.keys(req.query)) {
        if (typeof req.query[key] === "string") {
          req.query[key] = sanitizeValue(req.query[key]);
        }
      }
    }

    // Sanitize params — same approach
    if (req.params) {
      for (const key of Object.keys(req.params)) {
        if (typeof req.params[key] === "string") {
          req.params[key] = sanitizeValue(req.params[key]);
        }
      }
    }

    next();
  });
}

/* ══════════════════════════════════════════
   4. HPP — HTTP Parameter Pollution
   Prevents attacks like:
   POST /api/auth/login?role=admin&role=student
   Takes only the last value of duplicate params.
══════════════════════════════════════════ */
export function applyHPP(app) {
  app.use((req, res, next) => {
    // Mutate in place — don't reassign req.query (read-only in Express 5)
    for (const key of Object.keys(req.query)) {
      if (Array.isArray(req.query[key])) {
        req.query[key] = req.query[key][req.query[key].length - 1];
      }
    }
    next();
  });
}

/* ══════════════════════════════════════════
   5. REQUEST SIZE LIMITER
   Blocks huge payloads — prevents DoS attacks
   where someone sends a 500MB body to crash Node.
   Applied per-route category.
══════════════════════════════════════════ */
export const REQUEST_LIMITS = {
  api:      "1mb",    // regular API requests
  upload:   "15mb",   // file uploads (logos, avatars)
  quiz:     "5mb",    // quiz bulk generation
};

/* ══════════════════════════════════════════
   6. SECURE SESSION CONFIG
   Returns the session options to use.
══════════════════════════════════════════ */
export function getSessionConfig() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    secret:            process.env.SESSION_SECRET || "math_collective_secret_2026_CHANGE_IN_PROD",
    resave:            false,
    saveUninitialized: false,
    name:              "mc.sid",           // don't use default 'connect.sid'
    cookie: {
      httpOnly: true,                      // JS can't access cookie
      sameSite: isProd ? "strict" : "lax", // CSRF protection
      secure:   isProd,                    // HTTPS only in prod
      maxAge:   1000 * 60 * 60 * 24 * 7,  // 7 days
    },
  };
}

/* ══════════════════════════════════════════
   7. SUSPICIOUS REQUEST LOGGER
   Logs unusual patterns to console so you
   can see if someone is probing your site.
══════════════════════════════════════════ */
export function applyRequestLogger(app) {
  const SUSPICIOUS = [
    /\.\.\//,              // path traversal
    /<script/i,            // XSS in URL
    /union.*select/i,      // SQL injection
    /\/etc\/passwd/,       // Linux file access
    /wp-admin/,            // WordPress scanner
    /\.php$/,              // PHP scanner
    /eval\(/i,             // code injection
  ];

  app.use((req, res, next) => {
    const url = req.originalUrl;
    const isSuspicious = SUSPICIOUS.some(p => p.test(url));
    if (isSuspicious) {
      console.warn(`[SECURITY] Suspicious request: ${req.method} ${url} from ${req.ip}`);
      return res.status(400).json({ error: "Bad request" });
    }
    next();
  });
}