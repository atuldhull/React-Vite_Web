/**
 * Teacher portal — accessible to teacher, admin, super_admin.
 */

import { lazy } from "react";
import { Route } from "react-router-dom";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import TeacherLayout from "@/layouts/TeacherLayout";

const TeacherDashboardPage    = lazy(() => import("@/features/teacher/pages/TeacherDashboardPage"));
const TeacherStudentsPage     = lazy(() => import("@/features/teacher/pages/TeacherStudentsPage"));
const TeacherChallengesPage   = lazy(() => import("@/features/teacher/pages/TeacherChallengesPage"));
const TeacherCertificatesPage = lazy(() => import("@/features/teacher/pages/TeacherCertificatesPage"));
const TeacherQuizPage         = lazy(() => import("@/features/teacher/pages/TeacherQuizPage"));
const EventScannerPage        = lazy(() => import("@/features/events/pages/EventScannerPage"));

export const teacherRoutes = (
  <Route
    path="teacher"
    element={
      <ProtectedRoute roles={["teacher", "admin", "super_admin"]}>
        <TeacherLayout />
      </ProtectedRoute>
    }
  >
    <Route index element={<TeacherDashboardPage />} />
    <Route path="students"     element={<TeacherStudentsPage />} />
    <Route path="challenges"   element={<TeacherChallengesPage />} />
    <Route path="certificates" element={<TeacherCertificatesPage />} />
    <Route path="quiz"         element={<TeacherQuizPage />} />
    <Route path="scanner"      element={<EventScannerPage />} />
  </Route>
);
