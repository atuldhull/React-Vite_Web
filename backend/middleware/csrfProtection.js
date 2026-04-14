/**
 * CSRF protection — double-submit cookie pattern via `csrf-csrf`.
 *
 * WHAT
 * ────
 * Mutating requests (POST/PUT/PATCH/DELETE) under /api/* must carry
 * a valid CSRF token in the `x-csrf-token` header. The token is
 * minted by `GET /api/csrf-token` (see csrfRoutes.js), which also
 * sets a httpOnly cookie containing a hash of the token. On a
 * subsequent mutation, the middleware compares the header against
 * the cookie hash — they must match.
 *
 * WHY
 * ───
 * `sameSite: 'strict'` cookies + the strict CORS allowlist already
 * block most CSRF, but:
 *   - sameSite is browser-dependent (older Safari + IE bypasses);
 *   - CORS blocks reading the response, NOT the request firing —
 *     so a "fire and forget" CSRF attack (e.g. POST /admin/users/X/delete
 *     from evil.com) still hits the server unless we explicitly
 *     reject it. The CSRF token is what does the rejection.
 *
 * SCOPE
 * ─────
 * Skipped:
 *   GET / HEAD / OPTIONS — read-only, no state change to protect
 *   /api/payment/webhook — Razorpay calls this server-to-server with
 *                          its own HMAC signature; no session, no token
 *   /api/csrf-token      — the endpoint that ISSUES the token. It
 *                          can't itself require a token to call.
 *   /api/health, /api/ready — public probes; no session at all
 *
 * Login + register + forgot-password DO require CSRF: a "login CSRF"
 * attack logs the victim into the attacker's account so subsequent
 * actions happen in the attacker's context. The frontend fetches the
 * token before the form submit and sends it on the POST.
 *
 * COOKIE NAME
 * ───────────
 * `__Host-` prefix would be ideal (no Domain, Secure, Path=/) but it
 * requires HTTPS, which dev doesn't have. We pick the prefix dynamically
 * — `__Host-csrf` in production, `csrf-secret` in dev — so dev still
 * works on http://localhost.
 */

import { doubleCsrf } from "csrf-csrf";

const isProd = process.env.NODE_ENV === "production";

// Skip CSRF on these paths regardless of method. Keep this list short
// and audited — every entry is a route a CSRF attacker could
// theoretically poke. Each is intentionally exempted with a reason.
const SKIP_PATHS = new Set([
  "/api/payment/webhook",  // Razorpay HMAC validates instead of session+token
  "/api/csrf-token",       // The endpoint that mints the token can't require one
  "/api/health",           // Public probe — no state change possible
  "/api/ready",            // Public probe — no state change possible
]);

const csrf = doubleCsrf({
  // Reuse SESSION_SECRET — env validation guarantees it's ≥ 16 chars.
  // CSRF lib uses it to HMAC the cookie value; same secret is fine
  // because the use cases don't conflict.
  getSecret:             () => process.env.SESSION_SECRET,
  // Tie tokens to a session-ish identifier. For anonymous callers
  // (who haven't logged in yet but need to POST /auth/login), fall
  // back to the requestId — anything stable per-call is enough for
  // double-submit comparison.
  getSessionIdentifier:  (req) => req.session?.id || req.id || "anonymous",
  cookieName:            isProd ? "__Host-csrf" : "csrf-secret",
  cookieOptions: {
    sameSite: "lax",     // strict would block cross-tab page loads on the same site
    httpOnly: true,      // double-submit only needs the SERVER to read this
    secure:   isProd,
    path:     "/",
  },
  size:                  64,
  ignoredMethods:        ["GET", "HEAD", "OPTIONS"],
  getCsrfTokenFromRequest: (req) => req.headers["x-csrf-token"],
});

/**
 * Express middleware. Routes mounted under /api/* run through this.
 * Skips the SKIP_PATHS set + GET-style methods (handled internally
 * by the lib). Anything else gets validated; failure → 403.
 *
 * We match against req.originalUrl (with the query stripped) instead
 * of req.path because this middleware is mounted at "/api" — under
 * that mount, req.path drops the prefix ("/payment/webhook" instead
 * of "/api/payment/webhook"), which would silently bypass the skip
 * list. originalUrl always carries the full request path.
 */
export function csrfProtection(req, res, next) {
  const fullPath = (req.originalUrl || req.url).split("?")[0];
  if (SKIP_PATHS.has(fullPath)) return next();
  return csrf.doubleCsrfProtection(req, res, next);
}

/**
 * Handler for `GET /api/csrf-token`. Mints a fresh token, sets the
 * paired hash cookie, and returns the token in the JSON body so the
 * frontend can stash it in memory + put it in the x-csrf-token header
 * on subsequent mutations.
 *
 * Touches req.session.csrfBound so that express-session — configured
 * with saveUninitialized:false — actually persists the session on
 * THIS response. Without this, the session id used by the CSRF lib's
 * `getSessionIdentifier` is ephemeral (regenerated per-request because
 * no session cookie was ever set), and the next mutation arrives with
 * a different session id, failing validation.
 */
export function getCsrfTokenHandler(req, res) {
  if (req.session) req.session.csrfBound = true;
  const token = csrf.generateCsrfToken(req, res);
  res.json({ csrfToken: token });
}

// Re-exported so the global error handler (or tests) can recognise
// CSRF rejections specifically — the lib throws an Error subclass.
export const invalidCsrfTokenError = csrf.invalidCsrfTokenError;
