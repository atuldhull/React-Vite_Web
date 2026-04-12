// @vitest-environment jsdom
/**
 * Component tests for ProtectedRoute + GuestOnlyRoute using React Testing
 * Library + MemoryRouter. Verifies the full auth-guard decision matrix.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "../../frontend/src/components/auth/ProtectedRoute.jsx";
import GuestOnlyRoute from "../../frontend/src/components/auth/GuestOnlyRoute.jsx";
import { useAuthStore } from "../../frontend/src/store/auth-store.js";

// Helper: render the guarded element at a chosen starting path, with stub
// destination routes for every place the guards might redirect to. We put
// the "tested element" at a SEPARATE distinct path (/__tested) so it never
// conflicts with the /login or /dashboard stubs we want to see as redirect
// targets. Then we start navigation at that tested path.
function renderAt(startPath, element) {
  render(
    <MemoryRouter initialEntries={[startPath]}>
      <Routes>
        <Route path={startPath}     element={element} />
        <Route path="/login"        element={<div>LOGIN PAGE</div>} />
        <Route path="/dashboard"    element={<div>STUDENT DASHBOARD</div>} />
        <Route path="/admin"        element={<div>ADMIN DASHBOARD</div>} />
        <Route path="/super-admin"  element={<div>SA DASHBOARD</div>} />
        <Route path="/teacher"      element={<div>TEACHER DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function setAuth({ status, user }) {
  useAuthStore.setState({ status, user, error: null });
}

beforeEach(() => {
  useAuthStore.setState({ status: "idle", user: null, error: null });
});

// ────────────────────────────────────────────────────────────
// ProtectedRoute
// ────────────────────────────────────────────────────────────

describe("ProtectedRoute", () => {
  it("shows the loader while auth is still being checked", () => {
    setAuth({ status: "loading", user: null });
    renderAt("/arena", <ProtectedRoute><div>ARENA</div></ProtectedRoute>);
    // Neither the protected content nor the redirect target should render.
    expect(screen.queryByText("ARENA")).toBeNull();
    expect(screen.queryByText("LOGIN PAGE")).toBeNull();
  });

  it("redirects unauthenticated users to /login", () => {
    setAuth({ status: "guest", user: null });
    renderAt("/arena", <ProtectedRoute><div>ARENA</div></ProtectedRoute>);
    expect(screen.queryByText("LOGIN PAGE")).not.toBeNull();
    expect(screen.queryByText("ARENA")).toBeNull();
  });

  it("renders children when authenticated and no role restriction", () => {
    setAuth({ status: "authenticated", user: { id: "u1", role: "student" } });
    renderAt("/arena", <ProtectedRoute><div>ARENA</div></ProtectedRoute>);
    expect(screen.queryByText("ARENA")).not.toBeNull();
  });

  it("renders 403 when authenticated but role is not allowed", () => {
    setAuth({ status: "authenticated", user: { id: "u1", role: "student" } });
    renderAt(
      "/admin",
      <ProtectedRoute roles={["admin", "super_admin"]}><div>ADMIN PANEL</div></ProtectedRoute>,
    );
    expect(screen.queryByText("ADMIN PANEL")).toBeNull();
    // ForbiddenPage renders "Error 403" + "Access denied"
    expect(screen.queryByText(/403/i)).not.toBeNull();
  });

  it("renders children when authenticated role IS in the allow list", () => {
    setAuth({ status: "authenticated", user: { id: "u1", role: "admin" } });
    renderAt(
      "/admin",
      <ProtectedRoute roles={["admin", "super_admin"]}><div>ADMIN PANEL</div></ProtectedRoute>,
    );
    expect(screen.queryByText("ADMIN PANEL")).not.toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// GuestOnlyRoute
// ────────────────────────────────────────────────────────────

describe("GuestOnlyRoute", () => {
  it("renders children when user is a guest (not logged in)", () => {
    setAuth({ status: "guest", user: null });
    renderAt("/login", <GuestOnlyRoute><div>LOGIN FORM</div></GuestOnlyRoute>);
    expect(screen.queryByText("LOGIN FORM")).not.toBeNull();
  });

  it("redirects a logged-in student to /dashboard", () => {
    setAuth({ status: "authenticated", user: { id: "u1", role: "student" } });
    renderAt("/login", <GuestOnlyRoute><div>LOGIN FORM</div></GuestOnlyRoute>);
    expect(screen.queryByText("LOGIN FORM")).toBeNull();
    expect(screen.queryByText("STUDENT DASHBOARD")).not.toBeNull();
  });

  it("redirects a logged-in admin to /admin", () => {
    setAuth({ status: "authenticated", user: { id: "u1", role: "admin" } });
    renderAt("/login", <GuestOnlyRoute><div>LOGIN FORM</div></GuestOnlyRoute>);
    expect(screen.queryByText("ADMIN DASHBOARD")).not.toBeNull();
  });

  it("redirects a logged-in super_admin to /super-admin", () => {
    setAuth({ status: "authenticated", user: { id: "u1", role: "super_admin" } });
    renderAt("/login", <GuestOnlyRoute><div>LOGIN FORM</div></GuestOnlyRoute>);
    expect(screen.queryByText("SA DASHBOARD")).not.toBeNull();
  });

  it("redirects a logged-in teacher to /teacher", () => {
    setAuth({ status: "authenticated", user: { id: "u1", role: "teacher" } });
    renderAt("/login", <GuestOnlyRoute><div>LOGIN FORM</div></GuestOnlyRoute>);
    expect(screen.queryByText("TEACHER DASHBOARD")).not.toBeNull();
  });
});
