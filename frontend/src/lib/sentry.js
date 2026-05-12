/**
 * Frontend Sentry wiring — runtime error reporting for the React app.
 *
 * Mirrors backend/config/sentry.js: FEATURE-GATED on VITE_SENTRY_DSN.
 * Without a DSN every export here no-ops. That means:
 *   - Local dev without a DSN doesn't spam Sentry.
 *   - CI / preview builds without secrets just skip init.
 *   - Production with VITE_SENTRY_DSN set captures every uncaught
 *     React error, unhandled promise, and console error matching
 *     a configured pattern.
 *
 * Release tagging:
 *   The build-time RELEASE constant (defined in vite.config.js via
 *   `define`) carries the git SHA so Sentry can group errors by
 *   deploy and resolve them against the source maps uploaded by
 *   @sentry/vite-plugin during the build.
 *
 * Why React.lazy-style code-split chunks need this:
 *   When LibraryScene (lazy-loaded) throws, its stack trace points
 *   into the three-vendor / motion-vendor / LibraryScene chunk —
 *   minified, mangled function names. Source maps fix that. Without
 *   maps the trace is unusable; with maps it points to the actual
 *   file:line in the original JSX.
 */

import * as Sentry from "@sentry/react";

let initialised = false;

export function initSentry() {
  if (initialised) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // feature disabled — see file header

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // RELEASE is injected at build time by vite.config.js (define).
    // Falls back to undefined in dev so Sentry uses its own grouping.
    release: typeof __SENTRY_RELEASE__ !== "undefined" ? __SENTRY_RELEASE__ : undefined,
    integrations: [
      // browserTracing instruments fetch/XHR + navigation transactions
      // for performance monitoring. Sampled below.
      Sentry.browserTracingIntegration(),
    ],
    // 10% perf sampling — same as backend. Cheap, useful for trend
    // analysis, won't blow the Sentry quota.
    tracesSampleRate: 0.1,
    // Replay session sampling — 0 in production by default. Sentry
    // Replay adds ~50KB and records DOM mutations, which is heavy
    // for a marketing-style landing page. Turn on only if explicitly
    // debugging a user-reported issue.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Ignore known-noisy errors that aren't actionable bugs.
    ignoreErrors: [
      // ResizeObserver loops — benign browser quirk.
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      // Network noise that's user-side (offline, blocked by extension).
      "Network Error",
      "NetworkError when attempting to fetch resource",
      "Load failed",
      // Browser extensions injecting into the page.
      /chrome-extension:\/\//,
      /moz-extension:\/\//,
    ],
    beforeSend(event) {
      // Strip cookies + auth headers as paranoid defence-in-depth
      // even though Sentry scrubs these by default.
      if (event.request?.cookies) delete event.request.cookies;
      if (event.request?.headers) {
        delete event.request.headers.Authorization;
        delete event.request.headers.Cookie;
      }
      return event;
    },
  });

  initialised = true;
}

/**
 * Lazy-export so callers can capture errors without branching on
 * whether Sentry initialised. No-ops when uninitialised.
 */
export function captureException(err, ctx = {}) {
  if (!initialised) return;
  try {
    Sentry.withScope((scope) => {
      if (ctx.userId) scope.setUser({ id: ctx.userId });
      if (ctx.requestId) scope.setTag("requestId", ctx.requestId);
      Object.entries(ctx.extra ?? {}).forEach(([k, v]) => scope.setExtra(k, v));
      Sentry.captureException(err);
    });
  } catch {
    // Never let error-reporting fail user-facing flows.
  }
}

export { Sentry };
