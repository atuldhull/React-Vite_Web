import axios from "axios";

const http = axios.create({
  baseURL: "/api",
  withCredentials: true,
  timeout: 15000,
  headers: {
    "X-Requested-With": "XMLHttpRequest",
  },
});

// ── CSRF token (Phase 7) ──
// Fetched once on first need, then attached as `x-csrf-token` on every
// mutating request. The token is paired with a httpOnly cookie set by
// the server; the lib validates header-vs-cookie on each mutation.
//
// We fetch lazily (not at module load) so the bundle doesn't make a
// network call on import — the first POST/PUT/PATCH/DELETE pays the
// one-time cost, then it's cached for the lifetime of the page.

let csrfTokenPromise = null;

function loadCsrfToken() {
  if (!csrfTokenPromise) {
    // Use a bare axios call (NOT the `http` instance) so we don't
    // recurse through the request interceptor.
    csrfTokenPromise = axios
      .get("/api/csrf-token", { withCredentials: true })
      .then((r) => r.data?.csrfToken)
      .catch((err) => {
        // If we can't get a token (server down, network, CORS), let
        // the actual request fail with the real error rather than
        // pretending we have a token. Reset so a retry can try again.
        csrfTokenPromise = null;
        throw err;
      });
  }
  return csrfTokenPromise;
}

// Methods that mutate state and therefore need the CSRF token.
const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);

http.interceptors.request.use(async (config) => {
  const method = (config.method || "get").toLowerCase();
  if (!MUTATING_METHODS.has(method)) return config;
  // Don't recurse on the token endpoint itself if anything ever
  // routes through `http` to fetch it.
  if ((config.url || "").includes("/csrf-token")) return config;
  try {
    const token = await loadCsrfToken();
    config.headers = config.headers || {};
    config.headers["x-csrf-token"] = token;
  } catch {
    // Let the request go without a token; the server will 403, and
    // the response interceptor below logs/handles it.
  }
  return config;
});

// Paths that legitimately return 401 without meaning "session expired"
// (e.g., login endpoint itself, or the session-probe endpoint).
const IGNORE_401 = [
  "/auth/me",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
];

// Response interceptor:
//   - 401 (session expired) → reset auth state so ProtectedRoute redirects
//   - 403 with CSRF code   → invalidate token + retry ONCE (handles cases
//     where the server-side hash rotated, e.g. server restart with a new
//     SESSION_SECRET)
//
// We intentionally do NOT call navigate() here: keeping this module free
// of React-Router lets us use it in non-React contexts too.
http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || "";
    const isIgnored = IGNORE_401.some((p) => url.includes(p));

    if (status === 401 && !isIgnored) {
      // Lazily import to avoid a circular store <-> http dependency at module load.
      import("@/store/auth-store").then(({ useAuthStore }) => {
        const state = useAuthStore.getState();
        if (state.status === "authenticated") {
          state.handleSessionExpired?.();
        }
      });
    }

    // CSRF-specific recovery: invalidate cached token + retry once.
    // Guard against an infinite loop with a request-config flag.
    if (
      status === 403
      && error?.response?.data?.code === "CSRF_INVALID"
      && !error.config?._csrfRetried
    ) {
      csrfTokenPromise = null;          // force a fresh fetch
      error.config._csrfRetried = true; // ensure we retry exactly once
      return http.request(error.config);
    }

    return Promise.reject(error);
  },
);

export default http;
