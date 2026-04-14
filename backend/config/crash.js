/**
 * Process-level crash handlers.
 *
 * Two categories of "something went badly wrong, no one caught it":
 *
 *   - uncaughtException: a synchronous throw escaped every function
 *     boundary (or an async function threw before a handler was
 *     attached). Node's default is to print the stack and exit.
 *
 *   - unhandledRejection: a promise rejected and nothing ever
 *     called .catch on it. In older Node this was just a warning;
 *     from Node 15+ the default behaviour is to terminate the
 *     process, which — for a server — is usually what we want.
 *
 * Why install our own handlers:
 *
 *   - Default Node output goes to stderr as an unstructured stack.
 *     Log aggregators (Loki/Datadog/CloudWatch) can parse it, but
 *     they can't tie it to the current requestId (if we were inside
 *     a request when it happened). Routing through pino gives us:
 *       * the structured JSON shape the rest of the logs use
 *       * the AsyncLocalStorage-injected requestId mixin when a
 *         request-scoped async chain is the culprit
 *       * severity="fatal" so alerting can page on it
 *
 *   - Fail FAST after logging. A process that swallows fatal errors
 *     and limps along with corrupted state (e.g. half-open DB
 *     connections, leaked sessions) is worse than a clean restart
 *     under a process supervisor — orchestrator restarts on exit
 *     but has no signal to act on silent corruption.
 *
 * The exit timeout on uncaughtException is a belt-and-braces: give
 * pino a tick to flush the fatal line to stdout before exiting, but
 * don't wait so long that a wedged logger delays the restart.
 */

import { logger } from "./logger.js";

const EXIT_FLUSH_MS = 500;

export function installCrashHandlers() {
  process.on("uncaughtException", (err, origin) => {
    logger.fatal({
      err,
      origin,                       // "uncaughtException" | "unhandledRejection"
      event: "uncaughtException",
    }, "unhandled synchronous error — exiting");

    // Best-effort flush, then die. If we hang here, the process
    // supervisor (systemd, Docker, pm2, Fly, Render) will SIGKILL us
    // eventually; better to cap it ourselves.
    setTimeout(() => process.exit(1), EXIT_FLUSH_MS).unref();
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.fatal({
      // `reason` might be an Error or any thrown value — pino's
      // serialiser handles both.
      err:     reason instanceof Error ? reason : new Error(String(reason)),
      promise,
      event:   "unhandledRejection",
    }, "unhandled promise rejection — exiting");

    setTimeout(() => process.exit(1), EXIT_FLUSH_MS).unref();
  });

  // Also log graceful shutdowns so the log stream tells us why a
  // process went away (was it a deploy? OOM? crash? SIGINT from dev?).
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      logger.info({ signal: sig, event: "shutdown" }, "received signal — shutting down");
      // Don't exit here — let the HTTP server close gracefully via
      // its own listener. The exit happens when the event loop drains.
    });
  }
}
