import axios from "axios";

const http = axios.create({
  baseURL: "/api",
  withCredentials: true,
  timeout: 15000,
  headers: {
    "X-Requested-With": "XMLHttpRequest",
  },
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

// Response interceptor — if the server tells us the session is gone,
// reset the client auth state so ProtectedRoute can redirect to /login.
// We intentionally do NOT call navigate() here: keeping this module free
// of React-Router lets us use it in non-React contexts too. The auth store
// state change is enough for ProtectedRoute to react on the next render.
http.interceptors.response.use(
  (response) => response,
  (error) => {
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
    return Promise.reject(error);
  },
);

export default http;
