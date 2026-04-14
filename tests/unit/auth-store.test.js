// @vitest-environment jsdom
/**
 * Tests for frontend/src/store/auth-store.js — the Zustand store that
 * every React component uses to read auth state + drive login/register/
 * logout. The store is pure logic around HTTP calls, so we mock the
 * `http` axios instance and the push-notification helpers and assert
 * on state transitions.
 *
 * Why jsdom: Zustand's `create()` internally reads globalThis and hangs
 * onto a subscription set; jsdom gives it a stable window to bind to
 * and matches the environment components actually run under.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the http module BEFORE importing the store — `vi.doMock` won't
// work here because the store grabs `http` at module-load time.
vi.mock("@/lib/http", () => ({
  default: {
    get:  vi.fn(),
    post: vi.fn(),
  },
}));

// Mock the push-notification helpers so the store doesn't try to
// register a service worker in jsdom (it'd throw).
vi.mock("@/lib/pushNotifications", () => ({
  setupPushNotifications:    vi.fn(() => Promise.resolve()),
  teardownPushNotifications: vi.fn(() => Promise.resolve()),
}));

const http = (await import("@/lib/http")).default;
const { useAuthStore } = await import("@/store/auth-store");

// Reset store state + mocks before each test. Zustand's store is a
// singleton so we need to set it back to the initial shape.
beforeEach(() => {
  useAuthStore.setState({ status: "idle", user: null, error: null });
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// checkSession
// ════════════════════════════════════════════════════════════

describe("checkSession", () => {
  it("sets status='authenticated' + user on /auth/me loggedIn=true", async () => {
    http.get.mockResolvedValueOnce({
      data: { loggedIn: true, user: { id: "u1", email: "a@x.co", role: "student" } },
    });
    await useAuthStore.getState().checkSession();
    const s = useAuthStore.getState();
    expect(s.status).toBe("authenticated");
    expect(s.user).toMatchObject({ id: "u1", email: "a@x.co" });
    expect(s.error).toBeNull();
    expect(http.get).toHaveBeenCalledWith("/auth/me");
  });

  it("sets status='guest' when /auth/me returns loggedIn=false", async () => {
    http.get.mockResolvedValueOnce({ data: { loggedIn: false } });
    await useAuthStore.getState().checkSession();
    const s = useAuthStore.getState();
    expect(s.status).toBe("guest");
    expect(s.user).toBeNull();
  });

  it("treats an HTTP error (e.g. 401 or network failure) as guest, not error", async () => {
    // Intentional: on first load, a 401 just means "not logged in" —
    // we don't want the UI to show an error banner for that.
    http.get.mockRejectedValueOnce(new Error("Network Error"));
    await useAuthStore.getState().checkSession();
    const s = useAuthStore.getState();
    expect(s.status).toBe("guest");
    expect(s.error).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════
// login
// ════════════════════════════════════════════════════════════

describe("login", () => {
  it("sets user + authenticated on successful login", async () => {
    http.post.mockResolvedValueOnce({
      data: {
        message:    "Login successful",
        user:       { id: "u1", email: "a@x.co", role: "admin" },
        redirectTo: "/admin",
      },
    });
    const ret = await useAuthStore.getState().login("a@x.co", "pw");
    const s   = useAuthStore.getState();
    expect(s.status).toBe("authenticated");
    expect(s.user.role).toBe("admin");
    // Login returns the server payload so the caller can use redirectTo.
    expect(ret.redirectTo).toBe("/admin");
    expect(http.post).toHaveBeenCalledWith("/auth/login", { email: "a@x.co", password: "pw" });
  });

  it("sets status='error' + extracts backend error message on failure", async () => {
    http.post.mockRejectedValueOnce({
      response: { data: { error: "Invalid email or password" } },
    });
    await expect(useAuthStore.getState().login("a@x.co", "wrong")).rejects.toThrow(
      "Invalid email or password"
    );
    const s = useAuthStore.getState();
    expect(s.status).toBe("error");
    expect(s.error).toBe("Invalid email or password");
  });

  it("falls back to generic 'Login failed' when the server didn't send an error field", async () => {
    http.post.mockRejectedValueOnce({ response: { data: {} } });
    await expect(useAuthStore.getState().login("a@x.co", "pw")).rejects.toThrow("Login failed");
    expect(useAuthStore.getState().error).toBe("Login failed");
  });

  it("prefers the `message` field when `error` is absent (some endpoints use message)", async () => {
    http.post.mockRejectedValueOnce({
      response: { data: { message: "Your account is suspended" } },
    });
    await expect(useAuthStore.getState().login("a@x.co", "pw")).rejects.toThrow(
      "Your account is suspended"
    );
  });
});

// ════════════════════════════════════════════════════════════
// register
// ════════════════════════════════════════════════════════════

describe("register", () => {
  it("resets to 'guest' after successful registration (user must still log in)", async () => {
    http.post.mockResolvedValueOnce({
      data: { message: "Registered! Check email to verify, then log in." },
    });
    const ret = await useAuthStore.getState().register("Alice", "a@x.co", "secret123");
    expect(useAuthStore.getState().status).toBe("guest");
    expect(useAuthStore.getState().user).toBeNull(); // NOT auto-logged-in
    expect(ret.message).toMatch(/Registered/);
  });

  it("propagates the server error on failure", async () => {
    http.post.mockRejectedValueOnce({
      response: { data: { error: "email already in use" } },
    });
    await expect(
      useAuthStore.getState().register("Alice", "a@x.co", "secret123")
    ).rejects.toThrow("email already in use");
    expect(useAuthStore.getState().status).toBe("error");
  });
});

// ════════════════════════════════════════════════════════════
// logout
// ════════════════════════════════════════════════════════════

describe("logout", () => {
  it("wipes local state to guest even if the server call fails", async () => {
    // Preload a logged-in state.
    useAuthStore.setState({ status: "authenticated", user: { id: "u1" } });
    // Simulate the logout POST failing (e.g. network blip).
    http.post.mockRejectedValueOnce(new Error("net"));
    await useAuthStore.getState().logout();
    const s = useAuthStore.getState();
    expect(s.status).toBe("guest");
    expect(s.user).toBeNull();
  });

  it("wipes state cleanly when the server responds OK", async () => {
    useAuthStore.setState({ status: "authenticated", user: { id: "u1" } });
    http.post.mockResolvedValueOnce({ data: { message: "Logged out" } });
    await useAuthStore.getState().logout();
    const s = useAuthStore.getState();
    expect(s.status).toBe("guest");
    expect(s.user).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════
// handleSessionExpired + clearError
// ════════════════════════════════════════════════════════════

describe("handleSessionExpired", () => {
  it("flips to guest with a user-facing 'session expired' error message", () => {
    useAuthStore.setState({ status: "authenticated", user: { id: "u1" } });
    useAuthStore.getState().handleSessionExpired();
    const s = useAuthStore.getState();
    expect(s.status).toBe("guest");
    expect(s.user).toBeNull();
    expect(s.error).toMatch(/session has expired/i);
  });
});

describe("clearError", () => {
  it("nulls out the error field without touching status or user", () => {
    useAuthStore.setState({
      status: "authenticated",
      user:   { id: "u1" },
      error:  "some prior error",
    });
    useAuthStore.getState().clearError();
    const s = useAuthStore.getState();
    expect(s.error).toBeNull();
    expect(s.status).toBe("authenticated");     // untouched
    expect(s.user).toEqual({ id: "u1" });        // untouched
  });
});
