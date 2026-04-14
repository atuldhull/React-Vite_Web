import { Component } from "react";

/**
 * RouteErrorBoundary — catches render errors inside a specific route
 * so a single broken page shows a contained error UI while the
 * surrounding app (navigation, layout, theme) stays intact.
 *
 * Distinct from components/ErrorBoundary.jsx which is the APP-LEVEL
 * boundary with a full-screen fallback used as the final backstop.
 * That one is the "something went wrong" page you end up on when
 * even the router itself blew up. This one sits inside the router,
 * underneath Suspense, and only affects the route outlet.
 *
 * Caveats:
 *   - Only catches errors thrown during RENDER, lifecycle methods,
 *     or constructors. Async throws inside event handlers or
 *     useEffect callbacks still bubble past React; those need
 *     handler-level try/catch or the global unhandled-rejection
 *     listener (which pino already logs at fatal via config/crash.js).
 *   - Reset behaviour: clicking "Try again" clears the internal
 *     flag. That re-mounts the children with fresh state, so a
 *     transient bug (failed fetch, stale data) often recovers.
 *     If the bug is deterministic, the same error will re-throw and
 *     the user sees the boundary again — which is the right thing.
 */
export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Route boundary — log but don't crash the whole app. Matches the
    // console contract of the app-level boundary for consistency;
    // future work could wire this through the pino logger via a
    // `/api/client-errors` endpoint.
    console.error("[RouteErrorBoundary] Caught:", error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-line/10 bg-white/[0.02] p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-danger/20 bg-danger/10">
            <svg
              className="h-7 w-7 text-danger"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-white">This page hit a snag</h2>
          <p className="mt-2 text-sm text-white/50">
            The rest of the app is still working — try again, or head elsewhere
            using the navigation.
          </p>

          {this.state.error?.message && (
            <div className="mt-4 rounded-lg border border-line/10 bg-black/20 px-3 py-2">
              <p
                className="truncate text-xs text-white/40"
                style={{ fontFamily: "var(--font-mono, monospace)" }}
              >
                {this.state.error.message}
              </p>
            </div>
          )}

          <button
            onClick={this.reset}
            className="mt-6 inline-flex h-10 items-center justify-center rounded-full border border-primary/40 bg-gradient-to-r from-primary via-secondary to-glow px-5 text-[10px] font-bold uppercase tracking-[0.28em] text-white shadow-orbit transition hover:-translate-y-0.5"
            style={{ fontFamily: "var(--font-mono, monospace)" }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }
}
