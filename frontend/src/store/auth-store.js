import { create } from "zustand";
import http from "@/lib/http";

export const useAuthStore = create((set, get) => ({
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
      }
      return data;
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || "Login failed";
      set({ status: "error", error: msg });
      throw new Error(msg);
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
      throw new Error(msg);
    }
  },

  logout: async () => {
    try {
      await http.post("/auth/logout");
    } catch {
      // ignore
    }
    set({ user: null, status: "guest", error: null });
  },

  clearError: () => set({ error: null }),
}));
