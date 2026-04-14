/**
 * Response shim that standardises the shape of error responses.
 *
 * Phase 2.4 added `requestId`. Phase 9.2 adds `code`.
 *
 * Final shape:
 *   {
 *     error:     "human-readable message",
 *     code:      "MACHINE_READABLE_CODE",   // derived from status when not provided
 *     requestId: "<x-request-id>",
 *     ...(any other fields the caller set, e.g. validation `issues`)
 *   }
 *
 * Why the `code` field:
 *   - Clients can switch on a stable identifier instead of pattern-
 *     matching error message strings (which change for ergonomics
 *     reasons every other PR).
 *   - Frontend can map codes to user-facing copy + tracking events.
 *   - Log-aggregator queries become trivial: `code:RATE_LIMITED` finds
 *     every rate-limit hit across the app.
 *
 * Why a SHIM not editing every call site:
 *   - ~100 `res.status(N).json({error: ...})` call sites across the
 *     backend would need updating. The shim makes the default
 *     correct without each controller having to remember.
 *   - Controllers that DO want a specific code (e.g. CSRF rejection
 *     uses "CSRF_INVALID", not the default "FORBIDDEN") just include
 *     it in the body — the shim respects pre-set fields.
 *
 * Must mount AFTER requestIdMiddleware (needs req.id) and BEFORE the
 * routes (so controllers use the patched res.json).
 */

// Status → default code mapping. Covers the HTTP statuses this app
// actually emits. Any status not in this table just doesn't get a
// default code — explicit is better than guessing.
const CODE_BY_STATUS = {
  400: "BAD_REQUEST",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  422: "UNPROCESSABLE",
  429: "RATE_LIMITED",
  500: "INTERNAL",
  502: "BAD_GATEWAY",
  503: "SERVICE_UNAVAILABLE",
};

export function responseShapeMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    // Only decorate errors — don't touch successful payloads. An
    // error body is anything that has a truthy `error` field (string
    // or structured); we also accept `message` for endpoints that
    // historically used that key.
    if (
      body && typeof body === "object" && !Array.isArray(body) &&
      (body.error || body.message)
    ) {
      const additions = {};
      // requestId — skip if the caller already set one
      if (!body.requestId && req.id) {
        additions.requestId = req.id;
      }
      // code — derive from status when the caller didn't set one.
      // Specific codes (e.g. "CSRF_INVALID", "VALIDATION_FAILED",
      // "EMAIL_NOT_VERIFIED") set explicitly by the controller win
      // over the status-derived default — that's the point of having
      // an enum: caller picks the precise meaning when the HTTP
      // status alone is too coarse.
      if (!body.code) {
        const fromStatus = CODE_BY_STATUS[res.statusCode];
        if (fromStatus) additions.code = fromStatus;
      }

      if (Object.keys(additions).length > 0) {
        return originalJson({ ...body, ...additions });
      }
    }
    return originalJson(body);
  };
  next();
}
