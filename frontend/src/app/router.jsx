import { AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import ExperienceShell from "@/components/experience/ExperienceShell";
import PageTransition from "@/components/experience/PageTransition";
import MonumentTransition from "@/components/experience/MonumentTransition";
import MonumentRouter from "@/components/monument/MonumentRouter";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth-store";

// Layouts
import MainLayout from "@/layouts/MainLayout";
import AuthLayout from "@/layouts/AuthLayout";
import AdminLayout from "@/layouts/AdminLayout";
import TeacherLayout from "@/layouts/TeacherLayout";
import SuperAdminLayout from "@/layouts/SuperAdminLayout";

// Public pages
import HomePage from "@/features/home/pages/HomePage";
import LeaderboardPage from "@/features/public/pages/LeaderboardPage";
import GalleryPage from "@/features/public/pages/GalleryPage";
import ContactPage from "@/features/public/pages/ContactPage";

// Auth pages
import LoginPage from "@/features/auth/pages/LoginPage";
import RegisterPage from "@/features/auth/pages/RegisterPage";

// Student pages (under MainLayout, auth required)
import ArenaPage from "@/features/arena/pages/ArenaPage";
import DashboardPage from "@/features/dashboard/pages/DashboardPage";
import EventsPage from "@/features/events/pages/EventsPage";
import ProfilePage from "@/features/student/pages/ProfilePage";
import CertificatesPage from "@/features/student/pages/CertificatesPage";
import ProjectsPage from "@/features/student/pages/ProjectsPage";
import NotificationsPage from "@/features/student/pages/NotificationsPage";
import ReferralPage from "@/features/student/pages/ReferralPage";
import StudentProfilePage from "@/features/student/pages/StudentProfilePage";
import BillingPage from "@/features/student/pages/BillingPage";
import LiveQuizPage from "@/features/student/pages/LiveQuizPage";
import TestHistoryPage from "@/features/student/pages/TestHistoryPage";

// Teacher pages
import TeacherDashboardPage from "@/features/teacher/pages/TeacherDashboardPage";
import TeacherStudentsPage from "@/features/teacher/pages/TeacherStudentsPage";
import TeacherChallengesPage from "@/features/teacher/pages/TeacherChallengesPage";
import TeacherCertificatesPage from "@/features/teacher/pages/TeacherCertificatesPage";
import TeacherQuizPage from "@/features/teacher/pages/TeacherQuizPage";
import EventScannerPage from "@/features/events/pages/EventScannerPage";

// Admin pages
import AdminOverviewPage from "@/features/admin/pages/AdminOverviewPage";
import AdminUsersPage from "@/features/admin/pages/AdminUsersPage";
import AdminChallengesPage from "@/features/admin/pages/AdminChallengesPage";
import AdminEventsPage from "@/features/admin/pages/AdminEventsPage";
import AdminDataPage from "@/features/admin/pages/AdminDataPage";
import AdminSettingsPage from "@/features/admin/pages/AdminSettingsPage";

// Super Admin pages
import SAAnalyticsPage from "@/features/superadmin/pages/SAAnalyticsPage";
import SAOrganisationsPage from "@/features/superadmin/pages/SAOrganisationsPage";
import SAPlansPage from "@/features/superadmin/pages/SAPlansPage";
import SAAccessPage from "@/features/superadmin/pages/SAAccessPage";

function ScrollToTop() {
  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  return null;
}

function SessionLoader({ children }) {
  const checkSession = useAuthStore((s) => s.checkSession);
  const status = useAuthStore((s) => s.status);
  useEffect(() => { if (status === "idle") checkSession(); }, [status, checkSession]);
  return children;
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <MonumentRouter>
      <ScrollToTop />
      <MonumentTransition />
      <AnimatePresence mode="wait" initial={false}>
        <PageTransition key={location.pathname}>
          <Routes location={location}>
            {/* ── Public (MainLayout) ── */}
            <Route element={<MainLayout />}>
              <Route index element={<HomePage />} />
              <Route path="leaderboard" element={<LeaderboardPage />} />
              <Route path="events" element={<EventsPage />} />
              <Route path="gallery" element={<GalleryPage />} />
              <Route path="contact" element={<ContactPage />} />

              {/* ── Student routes (auth required) ── */}
              <Route path="arena" element={<ProtectedRoute><ArenaPage /></ProtectedRoute>} />
              <Route path="dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="certificates" element={<ProtectedRoute><CertificatesPage /></ProtectedRoute>} />
              <Route path="projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
              <Route path="notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
              <Route path="billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
              <Route path="referrals" element={<ProtectedRoute><ReferralPage /></ProtectedRoute>} />
              <Route path="student/:userId" element={<ProtectedRoute><StudentProfilePage /></ProtectedRoute>} />
              <Route path="live-quiz" element={<ProtectedRoute><LiveQuizPage /></ProtectedRoute>} />
              <Route path="history" element={<ProtectedRoute><TestHistoryPage /></ProtectedRoute>} />
            </Route>

            {/* ── Auth ── */}
            <Route element={<AuthLayout />}>
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />
            </Route>

            {/* ── Teacher ── */}
            <Route
              path="teacher"
              element={
                <ProtectedRoute roles={["teacher", "admin", "super_admin"]}>
                  <TeacherLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<TeacherDashboardPage />} />
              <Route path="students" element={<TeacherStudentsPage />} />
              <Route path="challenges" element={<TeacherChallengesPage />} />
              <Route path="certificates" element={<TeacherCertificatesPage />} />
              <Route path="quiz" element={<TeacherQuizPage />} />
              <Route path="scanner" element={<EventScannerPage />} />
            </Route>

            {/* ── Admin ── */}
            <Route
              path="admin"
              element={
                <ProtectedRoute roles={["admin", "super_admin"]}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminOverviewPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="challenges" element={<AdminChallengesPage />} />
              <Route path="events" element={<AdminEventsPage />} />
              <Route path="data" element={<AdminDataPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
            </Route>

            {/* ── Super Admin ── */}
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
              <Route path="plans" element={<SAPlansPage />} />
              <Route path="access" element={<SAAccessPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PageTransition>
      </AnimatePresence>
    </MonumentRouter>
  );
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <SessionLoader>
        <ExperienceShell>
          <AnimatedRoutes />
        </ExperienceShell>
      </SessionLoader>
    </BrowserRouter>
  );
}
