/**
 * catchAsync(fn) — wrap an async Express handler so any thrown or
 * rejected error flows to `next(err)` and lands in the global error
 * handler (app.js), instead of being locally swallowed into a
 * generic 500 by a per-controller try/catch.
 *
 * WHY
 * ───
 * The codebase had ~100 copies of this pattern:
 *
 *   export const getFoo = async (req, res) => {
 *     try {
 *       const data = await fetchSomething();
 *       res.json(data);
 *     } catch (err) {
 *       console.error("[Foo]", err.message);
 *       return res.status(500).json({ error: "Failed" });
 *     }
 *   };
 *
 * It's boilerplate that:
 *   - Discards the stack (only `err.message`, via unstructured console).
 *   - Responds without a requestId, so a user-reported "it failed"
 *     can't be grepped out of logs.
 *   - Hides real errors behind a blanket "Failed" string.
 *
 * With catchAsync the equivalent is:
 *
 *   export const getFoo = catchAsync(async (req, res) => {
 *     const data = await fetchSomething();
 *     res.json(data);
 *   });
 *
 * Rejections land in the app.js error handler, which:
 *   - Logs via pino at error level (structured: { err, method, url,
 *     requestId } — requestId auto-attached by the ALS mixin).
 *   - Responds 500 with { error:"Internal server error", requestId }
 *     so the user can paste the id into a support ticket.
 *
 * WHEN NOT TO USE IT
 * ──────────────────
 * Controllers whose catch does MORE than return 500 — e.g. maps
 * specific error shapes to 400/401/404, falls back to a cached value,
 * retries, or emits a different response entirely — keep their
 * explicit try/catch. catchAsync only exists to dedupe the "translate
 * any error to a generic 500" pattern.
 *
 * HOW IT WORKS
 * ────────────
 * We use an async arrow + try/catch (rather than
 * `Promise.resolve(fn(...)).catch(next)`) because the latter doesn't
 * catch SYNCHRONOUS throws: if fn throws before returning a promise,
 * the throw escapes Promise.resolve() entirely. The async+try form
 * catches both sync throws and async rejections.
 */

// @ts-check

/**
 * @typedef {import("express").Request}  Req
 * @typedef {import("express").Response} Res
 * @typedef {import("express").NextFunction} Next
 * @typedef {(req: Req, res: Res, next: Next) => unknown | Promise<unknown>} Handler
 */

/**
 * @param {Handler} fn
 * @returns {Handler}
 */
export function catchAsync(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Variant that lets the caller pass a specific HTTP status for known
 * error shapes (e.g. validation errors that became thrown exceptions
 * somewhere deep). Rarely needed; catchAsync() + controller-level
 * res.status() covers the 90% case.
 *
 * @param {Handler} fn
 * @param {number} [status=500]
 * @returns {Handler}
 */
export function catchAsyncWithStatus(fn, status = 500) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      // err may be any thrown value; we set .status only when the
      // shape is an object and doesn't already carry one.
      if (err && typeof err === "object" && !(/** @type {any} */ (err).status)) {
        /** @type {any} */ (err).status = status;
      }
      next(err);
    }
  };
}
