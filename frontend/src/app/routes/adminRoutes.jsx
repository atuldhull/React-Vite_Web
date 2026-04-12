/**
 * Admin portal — accessible to admin and super_admin only.
 */

import { lazy } from "react";
import { Route } from "react-router-dom";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import AdminLayout from "@/layouts/AdminLayout";

const AdminOverviewPage   = lazy(() => import("@/features/admin/pages/AdminOverviewPage"));
const AdminUsersPage      = lazy(() => import("@/features/admin/pages/AdminUsersPage"));
const AdminChallengesPage = lazy(() => import("@/features/admin/pages/AdminChallengesPage"));
const AdminEventsPage     = lazy(() => import("@/features/admin/pages/AdminEventsPage"));
const AdminDataPage       = lazy(() => import("@/features/admin/pages/AdminDataPage"));
const AdminSettingsPage   = lazy(() => import("@/features/admin/pages/AdminSettingsPage"));
const AdminFeaturesPage   = lazy(() => import("@/features/admin/pages/AdminFeaturesPage"));

export const adminRoutes = (
  <Route
    path="admin"
    element={
      <ProtectedRoute roles={["admin", "super_admin"]}>
        <AdminLayout />
      </ProtectedRoute>
    }
  >
    <Route index element={<AdminOverviewPage />} />
    <Route path="users"      element={<AdminUsersPage />} />
    <Route path="challenges" element={<AdminChallengesPage />} />
    <Route path="events"     element={<AdminEventsPage />} />
    <Route path="data"       element={<AdminDataPage />} />
    <Route path="settings"   element={<AdminSettingsPage />} />
    <Route path="features"   element={<AdminFeaturesPage />} />
  </Route>
);
