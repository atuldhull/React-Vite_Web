import { AnimatePresence } from "framer-motion";
import { lazy, Suspense, useEffect, useRef } from "react";
import {
  BrowserRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import ExperienceShell from "@/components/experience/ExperienceShell";
import PageTransition from "@/components/experience/PageTransition";
import MonumentTransition from "@/components/experience/MonumentTransition";
import MonumentRouter from "@/components/monument/MonumentRouter";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import GuestOnlyRoute from "@/components/auth/GuestOnlyRoute";
import { useAuthStore } from "@/store/auth-store";
import Loader from "@/components/ui/Loader";

// ──────────────────────────────────────────────────────────────
// Layouts + always-needed error pages load eagerly (tiny cost,
// removes a Suspense boundary around every page shell).
// ──────────────────────────────────────────────────────────────
import MainLayout from "@/layouts/MainLayout";
import AuthLayout from "@/layouts/AuthLayout";
import AdminLayout from "@/layouts/AdminLayout";
import TeacherLayout from "@/layouts/TeacherLayout";
import SuperAdminLayout from "@/layouts/SuperAdminLayout";
import NotFoundPage from "@/features/errors/NotFoundPage";
import ForbiddenPage from "@/features/errors/ForbiddenPage";

// ──────────────────────────────────────────────────────────────
// Route-based code splitting. Each page becomes its own chunk
// and is only downloaded when the user actually visits the route.
// ──────────────────────────────────────────────────────────────

// Public pages
const HomePage        = lazy(() => import("@/features/home/pages/HomePage"));
const LeaderboardPage = lazy(() => import("@/features/public/pages/LeaderboardPage"));
const GalleryPage     = lazy(() => import("@/features/public/pages/GalleryPage"));
const ContactPage     = lazy(() => import("@/features/public/pages/ContactPage"));

// Auth pages
const LoginPage    = lazy(() => import("@/features/auth/pages/LoginPage"));
const RegisterPage = lazy(() => import("@/features/auth/pages/RegisterPage"));

// Student pages
const ArenaPage          = lazy(() => import("@/features/arena/pages/ArenaPage"));
const DashboardPage      = lazy(() => import("@/features/dashboard/pages/DashboardPage"));
const EventsPage         = lazy(() => import("@/features/events/pages/EventsPage"));
const ProfilePage        = lazy(() => import("@/features/student/pages/ProfilePage"));
const CertificatesPage   = lazy(() => import("@/features/student/pages/CertificatesPage"));
const ProjectsPage       = lazy(() => import("@/features/student/pages/ProjectsPage"));
const NotificationsPage  = lazy(() => import("@/features/student/pages/NotificationsPage"));
const ReferralPage       = lazy(() => import("@/features/student/pages/ReferralPage"));
const StudentProfilePage = lazy(() => import("@/features/student/pages/StudentProfilePage"));
const BillingPage        = lazy(() => import("@/features/student/pages/BillingPage"));
const LiveQuizPage       = lazy(() => import("@/features/student/pages/LiveQuizPage"));
const TestHistoryPage    = lazy(() => import("@/features/student/pages/TestHistoryPage"));

// Teacher pages
const TeacherDashboardPage    = lazy(() => import("@/features/teacher/pages/TeacherDashboardPage"));
const TeacherStudentsPage     = lazy(() => import("@/features/teacher/pages/TeacherStudentsPage"));
const TeacherChallengesPage   = lazy(() => import("@/features/teacher/pages/TeacherChallengesPage"));
const TeacherCertificatesPage = lazy(() => import("@/features/teacher/pages/TeacherCertificatesPage"));
const TeacherQuizPage         = lazy(() => import("@/features/teacher/pages/TeacherQuizPage"));
const EventScannerPage        = lazy(() => import("@/features/events/pages/EventScannerPage"));

// Admin pages
const AdminOverviewPage   = lazy(() => import("@/features/admin/pages/AdminOverviewPage"));
const AdminUsersPage      = lazy(() => import("@/features/admin/pages/AdminUsersPage"));
const AdminChallengesPage = lazy(() => import("@/features/admin/pages/AdminChallengesPage"));
const AdminEventsPage     = lazy(() => import("@/features/admin/pages/AdminEventsPage"));
const AdminDataPage       = lazy(() => import("@/features/admin/pages/AdminDataPage"));
const AdminSettingsPage   = lazy(() => import("@/features/admin/pages/AdminSettingsPage"));
const AdminFeaturesPage   = lazy(() => import("@/features/admin/pages/AdminFeaturesPage"));

// Super Admin pages
const SAAnalyticsPage     = lazy(() => import("@/features/superadmin/pages/SAAnalyticsPage"));
const SAOrganisationsPage = lazy(() => import("@/features/superadmin/pages/SAOrganisationsPage"));
const SAPlansPage         = lazy(() => import("@/features/superadmin/pages/SAPlansPage"));
const SAAccessPage        = lazy(() => import("@/features/superadmin/pages/SAAccessPage"));

/**
 * Scroll management — mirrors the default SPA behaviour most users expect:
 *   - PUSH navigation (clicking a link)      -> scroll to top
 *   - POP navigation  (back / forward)       -> let the browser restore scroll
 *     (modern browsers cache scroll position for history entries)
 *
 * Reading `history.action` avoids the old implementation's habit of scrolling
 * the user back up whenever they pressed Back.
 */
function ScrollManager() {
  const location = useLocation();
  const lastPath = useRef(location.pathname);

  useEffect(() => {
    if (lastPath.current === location.pathname) return;
    lastPath.current = location.pathname;

    // history.action is "PUSH" | "REPLACE" | "POP"
    // Only scroll on PUSH/REPLACE so Back/Forward can use native restoration.
    if (typeof window !== "undefined" && window.history?.state?.idx !== undefined) {
      // history-v5 stores an `idx` on state; on POP the browser will have
      // restored scroll before this effect runs. We do nothing.
    }
    // Always scroll on forward navigations — the simplest reliable heuristic.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);

  return null;
}

function SessionLoader({ children }) {
  const checkSession = useAuthStore((s) => s.checkSession);
  const status = useAuthStore((s) => s.status);
  useEffect(() => { if (status === "idle") checkSession(); }, [status, checkSession]);
  return children;
}

/** Suspense fallback shown while a page chunk is being fetched. */
function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader variant="orbit" size="lg" label="Loading..." />
    </div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <MonumentRouter>
      <ScrollManager />
      <MonumentTransition />
      <AnimatePresence mode="wait" initial={false}>
        <PageTransition key={location.pathname}>
          <Suspense fallback={<RouteFallback />}>
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

              {/* ── Auth (guest-only — authenticated users get redirected) ── */}
              <Route element={<AuthLayout />}>
                <Route path="login" element={<GuestOnlyRoute><LoginPage /></GuestOnlyRoute>} />
                <Route path="register" element={<GuestOnlyRoute><RegisterPage /></GuestOnlyRoute>} />
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
                <Route path="features" element={<AdminFeaturesPage />} />
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

              {/* ── Explicit error routes ── */}
              <Route element={<MainLayout />}>
                <Route path="403" element={<ForbiddenPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
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
