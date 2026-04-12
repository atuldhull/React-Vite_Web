/**
 * Login / Register — guest-only (authenticated users bounce to their
 * role-specific dashboard via GuestOnlyRoute).
 */

import { lazy } from "react";
import { Route } from "react-router-dom";
import AuthLayout from "@/layouts/AuthLayout";
import GuestOnlyRoute from "@/components/auth/GuestOnlyRoute";

const LoginPage    = lazy(() => import("@/features/auth/pages/LoginPage"));
const RegisterPage = lazy(() => import("@/features/auth/pages/RegisterPage"));

export const authRoutes = (
  <Route element={<AuthLayout />}>
    <Route path="login"    element={<GuestOnlyRoute><LoginPage /></GuestOnlyRoute>} />
    <Route path="register" element={<GuestOnlyRoute><RegisterPage /></GuestOnlyRoute>} />
  </Route>
);
