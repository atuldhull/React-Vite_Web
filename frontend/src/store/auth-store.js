import { create } from "zustand";
import http from "@/lib/http";
import { setupPushNotifications, teardownPushNotifications } from "@/lib/pushNotifications";

// Best-effort, fire-and-forget. Never throw back to the auth flow.
function tryPushSetup(opts) {
  setupPushNotifications(opts).catch(() => {});
}

export const useAuthStore = create((set, _get) => ({
  status: "idle", // idle | loading | authenticated | guest | error
  user: null,
  error: null,

  // Check session on app load — uses /api/auth/me which returns { loggedIn, user }
  checkSession: async () => {
    try {
      set({ status: "loading" });
      const { data } = await http.get("/auth/me");
      if (data.loggedIn && data.user) {
        set({ user: data.user, status: "authenticated", error: null });
        // If permission was granted on a previous visit, silently refresh
        // the push subscription so it stays bound to this session user.
        tryPushSetup({ promptIfDefault: false });
      } else {
        set({ user: null, status: "guest", error: null });
      }
    } catch {
      // 401 or network error = not logged in
      set({ user: null, status: "guest", error: null });
    }
  },

  login: async (email, password) => {
    try {
      set({ status: "loading", error: null });
      const { data } = await http.post("/auth/login", { email, password });
      // Backend returns { message, user, redirectTo }
      if (data.user) {
        set({ user: data.user, status: "authenticated", error: null });
        // Prompt for notification permission once, on first successful login.
        // If the user dismisses, we won't re-prompt on subsequent logins —
        // setupPushNotifications inspects Notification.permission first.
        tryPushSetup({ promptIfDefault: true });
      }
      return data;
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || "Login failed";
      set({ status: "error", error: msg });
      throw new Error(msg, { cause: err });
    }
  },

  register: async (name, email, password) => {
    try {
      set({ status: "loading", error: null });
      const { data } = await http.post("/auth/register", { name, email, password });
      set({ status: "guest", error: null });
      return data;
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || "Registration failed";
      set({ status: "error", error: msg });
      throw new Error(msg, { cause: err });
    }
  },

  logout: async () => {
    // Tear down the push subscription BEFORE destroying the server session —
    // otherwise the unsubscribe POST would 401.
    try { await teardownPushNotifications(); } catch { /* non-fatal */ }
    try {
      await http.post("/auth/logout");
    } catch {
      // ignore — local state reset below runs regardless
    }
    set({ user: null, status: "guest", error: null });
  },

  /**
   * Called by the HTTP 401 interceptor when an authenticated request is
   * rejected — means the server session expired. Wipes local state so
   * ProtectedRoute redirects to /login on the next render.
   */
  handleSessionExpired: () => {
    set({ user: null, status: "guest", error: "Your session has expired. Please sign in again." });
  },

  clearError: () => set({ error: null }),
}));
