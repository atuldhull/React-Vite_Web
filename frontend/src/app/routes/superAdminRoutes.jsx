/**
 * Super-admin portal — accessible to super_admin only.
 */

import { lazy } from "react";
import { Route } from "react-router-dom";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import SuperAdminLayout from "@/layouts/SuperAdminLayout";

const SAAnalyticsPage     = lazy(() => import("@/features/superadmin/pages/SAAnalyticsPage"));
const SAOrganisationsPage = lazy(() => import("@/features/superadmin/pages/SAOrganisationsPage"));
const SAPlansPage         = lazy(() => import("@/features/superadmin/pages/SAPlansPage"));
const SAAccessPage        = lazy(() => import("@/features/superadmin/pages/SAAccessPage"));

export const superAdminRoutes = (
  <Route
    path="super-admin"
    element={
      <ProtectedRoute roles={["super_admin"]}>
        <SuperAdminLayout />
      </ProtectedRoute>
    }
  >
    <Route index element={<SAAnalyticsPage />} />
    <Route path="organisations" element={<SAOrganisationsPage />} />
    <Route path="plans"         element={<SAPlansPage />} />
    <Route path="access"        element={<SAAccessPage />} />
  </Route>
);
