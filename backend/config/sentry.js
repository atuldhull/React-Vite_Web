/**
 * Sentry wiring — error reporting for the production server.
 *
 * Sentry is a FEATURE-GATED dependency (see config/env.js). If
 * SENTRY_DSN isn't set we silently no-op every export here. That
 * means:
 *   - Dev machines without a DSN don't spam a third-party service.
 *   - CI / tests run without a DSN and capture nothing.
 *   - A forgotten prod SENTRY_DSN doesn't crash the boot — it
 *     just turns off error reporting (same pattern as Razorpay,
 *     push notifications, OpenRouter).
 *
 * When the DSN IS set:
 *   - `initSentry()` runs ONCE at server.js boot, before
 *     `createApp()`, so module-load throws are captured.
 *   - `captureException(err)` is called from the global error
 *     handler in app.js in addition to the existing pino log —
 *     Sentry is additive, not a replacement.
 *   - `requestId` is attached as a Sentry tag via setTag(),
 *     so a user-reported id can be searched directly.
 *
 * We deliberately DO NOT add the Sentry request/error handlers as
 * Express middleware. The modern `@sentry/node` v8+ flow auto-
 * instruments Node's HTTP layer once `init()` has run, and layering
 * our own capture in the error handler is more predictable than
 * relying on middleware ordering (especially after the csrf-csrf
 * rejections which we explicitly skip).
 */

import * as Sentry from "@sentry/node";
import { logger } from "./logger.js";

let initialised = false;

/**
 * Idempotent init. Safe to call multiple times — subsequent calls
 * are no-ops.
 *
 * @param {{ dsn?: string, environment?: string, release?: string }} [opts]
 */
export function initSentry(opts = {}) {
  if (initialised) return;

  const dsn = opts.dsn ?? process.env.SENTRY_DSN;
  if (!dsn) return; // feature disabled — see file header

  Sentry.init({
    dsn,
    environment:       opts.environment ?? process.env.NODE_ENV ?? "development",
    release:           opts.release     ?? process.env.RENDER_GIT_COMMIT ?? undefined,
    tracesSampleRate:  0.1,
    // Don't capture requests we know aren't server faults. These
    // are client / policy errors and flooding Sentry with them
    // would drown real signal.
    ignoreErrors: [
      "EBADCSRFTOKEN",
      "invalid csrf token",
    ],
    // Strip obviously sensitive values before transmission. Sentry
    // already scrubs passwords by default, but paranoia is cheap.
    beforeSend(event) {
      if (event.request?.cookies) delete event.request.cookies;
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });

  initialised = true;
  logger.info({ environment: opts.environment ?? process.env.NODE_ENV }, "sentry initialised");
}

/**
 * Wrap Sentry.captureException so callers don't need to branch on
 * whether Sentry is initialised. Swallows send failures — dropping
 * an error report must never mask the original error.
 *
 * @param {unknown} err
 * @param {{ requestId?: string, userId?: string, orgId?: string, url?: string, method?: string }} [ctx]
 */
export function captureException(err, ctx = {}) {
  if (!initialised) return;
  try {
    Sentry.withScope((scope) => {
      if (ctx.requestId) scope.setTag("requestId", ctx.requestId);
      if (ctx.userId)    scope.setUser({ id: ctx.userId });
      if (ctx.orgId)     scope.setTag("orgId", ctx.orgId);
      if (ctx.url)       scope.setExtra("url", ctx.url);
      if (ctx.method)    scope.setExtra("method", ctx.method);
      Sentry.captureException(err);
    });
  } catch {
    // Never let an error-reporting failure become a user-facing
    // bug. The original error is already being logged via pino.
  }
}

/** For tests only: reset the module flag so initSentry() can run again. */
export function __resetForTests() {
  initialised = false;
}
