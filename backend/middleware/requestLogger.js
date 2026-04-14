/**
 * Per-request structured logger middleware.
 *
 * Emits exactly ONE log line per HTTP request at end-of-cycle with
 * the fields a log aggregator needs to make "what happened to user X
 * at 14:32?" answerable in one query:
 *
 *   {
 *     level:    30,
 *     time:     ...,
 *     msg:      "request",
 *     method:   "POST",
 *     url:      "/api/auth/login",
 *     status:   401,
 *     latencyMs: 42,
 *     userId:   "u-1234",         // null for anonymous
 *     orgId:    "org-abcd",       // null for super_admin or pre-session
 *     requestId: "<x-request-id>" // auto-attached by the ALS mixin
 *   }
 *
 * Captured via `res.on("finish")` so the line includes the final
 * status (which a controller might set late) and the real latency
 * (start to flush).
 *
 * Skipped:
 *   /api/health, /api/ready — uptime monitors poll these every few
 *                             seconds; logging each would drown out
 *                             real traffic. Their behaviour is
 *                             already covered by the readiness-check
 *                             metrics on the monitor side.
 *
 * Mount in app.js after sessionMiddleware so req.session is hydrated
 * by the time we read userId/orgId. The requestId comes from the ALS
 * store set by requestIdMiddleware (mounted FIRST), so it auto-
 * attaches via the logger's mixin without us having to thread it.
 */

import { logger } from "../config/logger.js";

const SKIP_PATHS = new Set(["/api/health", "/api/ready"]);

export function requestLoggerMiddleware(req, res, next) {
  const fullPath = (req.originalUrl || req.url).split("?")[0];
  if (SKIP_PATHS.has(fullPath)) return next();

  const startNs = process.hrtime.bigint();

  // Defer the log line to AFTER the response is sent. This way:
  //   - status reflects the final value (controllers may res.status()
  //     late, especially in error paths)
  //   - latency is accurate (covers all middleware + handler + flush)
  //   - the log line never blocks the response
  res.on("finish", () => {
    const latencyMs = Math.round(Number(process.hrtime.bigint() - startNs) / 1e6);
    logger.info(
      {
        method:    req.method,
        url:       req.originalUrl,
        status:    res.statusCode,
        latencyMs,
        userId:    req.userId   || req.session?.user?.id     || null,
        orgId:     req.orgId    || req.session?.user?.org_id || null,
        // requestId is auto-attached by the logger's ALS mixin
      },
      "request"
    );
  });

  next();
}
