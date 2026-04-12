/**
 * Public routes rendered inside MainLayout.
 * Also hosts the student routes because they share the same layout.
 */

import { lazy } from "react";
import { Route } from "react-router-dom";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import MainLayout from "@/layouts/MainLayout";

// Public pages
const HomePage        = lazy(() => import("@/features/home/pages/HomePage"));
const LeaderboardPage = lazy(() => import("@/features/public/pages/LeaderboardPage"));
const GalleryPage     = lazy(() => import("@/features/public/pages/GalleryPage"));
const ContactPage     = lazy(() => import("@/features/public/pages/ContactPage"));

// Student pages (MainLayout, auth required)
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

export const publicRoutes = (
  <Route element={<MainLayout />}>
    <Route index element={<HomePage />} />
    <Route path="leaderboard" element={<LeaderboardPage />} />
    <Route path="events" element={<EventsPage />} />
    <Route path="gallery" element={<GalleryPage />} />
    <Route path="contact" element={<ContactPage />} />

    {/* ── Student routes (auth required) ── */}
    <Route path="arena"         element={<ProtectedRoute><ArenaPage /></ProtectedRoute>} />
    <Route path="dashboard"     element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
    <Route path="profile"       element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
    <Route path="certificates"  element={<ProtectedRoute><CertificatesPage /></ProtectedRoute>} />
    <Route path="projects"      element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
    <Route path="notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
    <Route path="billing"       element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
    <Route path="referrals"     element={<ProtectedRoute><ReferralPage /></ProtectedRoute>} />
    <Route path="student/:userId" element={<ProtectedRoute><StudentProfilePage /></ProtectedRoute>} />
    <Route path="live-quiz"     element={<ProtectedRoute><LiveQuizPage /></ProtectedRoute>} />
    <Route path="history"       element={<ProtectedRoute><TestHistoryPage /></ProtectedRoute>} />
  </Route>
);
