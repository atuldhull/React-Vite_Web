import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-obsidian">
          {/* Subtle background glow */}
          <div className="pointer-events-none absolute left-1/2 top-1/3 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-danger/5 blur-[120px]" />

          <div className="relative z-10 mx-4 w-full max-w-md text-center">
            {/* Icon */}
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-danger/20 bg-danger/10">
              <svg
                className="h-10 w-10 text-danger"
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

            {/* Heading */}
            <h1
              className="mt-8 text-3xl font-extrabold tracking-tight text-white"
              style={{ fontFamily: "var(--font-display, sans-serif)" }}
            >
              Something went wrong
            </h1>

            <p className="mt-3 text-sm leading-7 text-white/50">
              An unexpected error occurred. This has been logged and we will look
              into it. You can try reloading the page.
            </p>

            {/* Error details (collapsed) */}
            {this.state.error?.message && (
              <div className="mt-6 rounded-2xl border border-line/10 bg-white/[0.02] px-4 py-3">
                <p
                  className="truncate text-xs text-white/30"
                  style={{ fontFamily: "var(--font-mono, monospace)" }}
                >
                  {this.state.error.message}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                onClick={this.handleReload}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-primary/40 bg-gradient-to-r from-primary via-secondary to-glow px-6 text-xs font-bold uppercase tracking-[0.28em] text-white shadow-orbit transition hover:-translate-y-0.5 hover:shadow-lg"
                style={{ fontFamily: "var(--font-mono, monospace)" }}
              >
                Try Again
              </button>

              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.history.back();
                }}
                className="inline-flex h-12 items-center justify-center rounded-full border border-line/20 bg-white/[0.03] px-6 text-xs font-bold uppercase tracking-[0.28em] text-white/60 transition hover:-translate-y-0.5 hover:text-white"
                style={{ fontFamily: "var(--font-mono, monospace)" }}
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
