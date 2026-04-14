/**
 * Request-ID middleware.
 *
 * Tags every incoming HTTP request with a stable identifier so that any
 * log line, error report, or downstream call can be traced back to the
 * single request that produced it.
 *
 * Behaviour:
 *
 *   - If the client sends an `x-request-id` header (e.g. an upstream
 *     load balancer or another microservice already tagged it), we
 *     adopt it — but defensively. Untrusted input means we cap the
 *     length and strip anything that isn't [A-Za-z0-9_-] so a
 *     malicious caller can't smuggle CRLF or shell characters into
 *     downstream log lines / response headers.
 *
 *   - Otherwise we generate a UUIDv4 via the standard library.
 *
 *   - The id is stashed on `req.id` (Express convention) AND echoed
 *     back in the `x-request-id` response header. The echo is what
 *     lets a user report an issue with "the request ID was X" — they
 *     can find it in their browser's network tab even if the JSON
 *     body doesn't include it.
 *
 *   - We also stash the id in AsyncLocalStorage so any code path
 *     (controllers, services, supabase wrappers) can retrieve it via
 *     `currentRequestId()` without us having to thread `req` through
 *     every function signature. This is the pattern that makes
 *     structured logging actually useful — every log line gets a
 *     request id without each call site having to remember.
 *
 * Mount this middleware FIRST in app.js (before helmet, cors, body
 * parsers — anything) so that:
 *   1. The error handler at the bottom of the chain always has access
 *      to req.id even if a downstream middleware throws.
 *   2. The id is consistent across all log output for the request.
 */

import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

const HEADER = "x-request-id";

// Inbound IDs are sanitised to this character set so we can safely echo
// them in response headers and log lines without worrying about CRLF
// injection or downstream parser confusion. UUIDs already satisfy this;
// most upstream-set IDs do too.
const SAFE_CHARS = /[^A-Za-z0-9_-]/g;
const MAX_LEN    = 128;

const storage = new AsyncLocalStorage();

/**
 * Express middleware. Place at the top of the chain.
 */
export function requestIdMiddleware(req, res, next) {
  const incoming = req.headers[HEADER];
  let id;

  if (typeof incoming === "string" && incoming.length > 0) {
    // Sanitise, cap, then verify there's something left. If the caller
    // sent a string of pure garbage we fall through and generate fresh.
    const cleaned = incoming.replace(SAFE_CHARS, "").slice(0, MAX_LEN);
    if (cleaned.length > 0) id = cleaned;
  }

  if (!id) id = randomUUID();

  req.id = id;
  res.setHeader(HEADER, id);

  // Run the rest of the request inside the ALS store so currentRequestId()
  // works anywhere downstream. enterWith would also work but causes the id
  // to leak into the next request on the same async chain in some edge
  // cases — `run` keeps the scope tight.
  storage.run({ id }, () => next());
}

/**
 * Returns the request id for the currently-executing async context, or
 * undefined if called outside an HTTP request (e.g. from a cron job or
 * background task).
 */
export function currentRequestId() {
  return storage.getStore()?.id;
}
