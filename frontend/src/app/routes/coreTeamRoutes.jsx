/**
 * Core Team portal routes (/core/*).
 *
 * Auth-gated by ProtectedRoute; core-membership is gated one level
 * deeper inside CoreTeamLayout (which shows the access gate to
 * authenticated non-members).
 */

import { lazy } from "react";
import { Route } from "react-router-dom";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import CoreTeamLayout from "@/layouts/CoreTeamLayout";

const CorePortalPage   = lazy(() => import("@/features/coreTeam/pages/CorePortalPage"));
const CoreTasksPage    = lazy(() => import("@/features/coreTeam/pages/CoreTasksPage"));
const CoreFeedbackPage = lazy(() => import("@/features/coreTeam/pages/CoreFeedbackPage"));
const CoreIdeasPage    = lazy(() => import("@/features/coreTeam/pages/CoreIdeasPage"));
const CoreTrendsPage   = lazy(() => import("@/features/coreTeam/pages/CoreTrendsPage"));
const CoreRosterPage   = lazy(() => import("@/features/coreTeam/pages/CoreRosterPage"));

export const coreTeamRoutes = (
  <Route
    path="core"
    element={
      <ProtectedRoute>
        <CoreTeamLayout />
      </ProtectedRoute>
    }
  >
    <Route index element={<CorePortalPage />} />
    <Route path="tasks"    element={<CoreTasksPage />} />
    <Route path="feedback" element={<CoreFeedbackPage />} />
    <Route path="ideas"    element={<CoreIdeasPage />} />
    <Route path="trends"   element={<CoreTrendsPage />} />
    <Route path="roster"   element={<CoreRosterPage />} />
  </Route>
);
