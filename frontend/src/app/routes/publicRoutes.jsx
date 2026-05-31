/**
 * Public routes rendered inside MainLayout.
 * Also hosts the student routes because they share the same layout.
 */

import { lazy } from "react";
import { Route, Navigate, useParams } from "react-router-dom";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import MainLayout from "@/layouts/MainLayout";

// Public pages
const HomePage        = lazy(() => import("@/features/home/pages/HomePage"));
const LeaderboardPage = lazy(() => import("@/features/public/pages/LeaderboardPage"));
const GalleryPage     = lazy(() => import("@/features/public/pages/GalleryPage"));
const ContactPage     = lazy(() => import("@/features/public/pages/ContactPage"));
const VerifyCertificatePage = lazy(() => import("@/features/public/pages/VerifyCertificatePage"));

// Student pages (MainLayout, auth required)
const ArenaPage          = lazy(() => import("@/features/arena/pages/ArenaPage"));
const DashboardPage      = lazy(() => import("@/features/dashboard/pages/DashboardPage"));
const EventsPage         = lazy(() => import("@/features/events/pages/EventsPage"));
const ProfilePage        = lazy(() => import("@/features/student/pages/ProfilePage"));
const CertificatesPage   = lazy(() => import("@/features/student/pages/CertificatesPage"));
const ProjectsPage       = lazy(() => import("@/features/student/pages/ProjectsPage"));
const NotificationsPage  = lazy(() => import("@/features/student/pages/NotificationsPage"));
const ReferralPage       = lazy(() => import("@/features/student/pages/ReferralPage"));
// Rich public profile for /profile/:userId — replaces the legacy
// /student/:userId path which now just redirects here.
const RichProfilePage    = lazy(() => import("@/features/profile/pages/RichProfilePage"));
const BillingPage        = lazy(() => import("@/features/student/pages/BillingPage"));
const LiveQuizPage       = lazy(() => import("@/features/student/pages/LiveQuizPage"));
const TestHistoryPage    = lazy(() => import("@/features/student/pages/TestHistoryPage"));
// Problem-statement catalogue — auth-gated browse of SIH / GSoC /
// Kaggle / MLH / open-source problems. List + detail pages.
const ProblemsListPage   = lazy(() => import("@/features/problems/pages/ProblemsListPage"));
const ProblemDetailPage  = lazy(() => import("@/features/problems/pages/ProblemDetailPage"));
const SubmitProblemPage  = lazy(() => import("@/features/problems/pages/SubmitProblemPage"));
const SubmitThanksPage   = lazy(() => import("@/features/problems/pages/SubmitThanksPage"));
// Roadmaps — sequenced learning bundles, sister-concept to problem
// statements. Same auth gate.
const RoadmapsListPage   = lazy(() => import("@/features/roadmaps/pages/RoadmapsListPage"));
const RoadmapDetailPage  = lazy(() => import("@/features/roadmaps/pages/RoadmapDetailPage"));
const RoadmapEditorPage  = lazy(() => import("@/features/roadmaps/pages/RoadmapEditorPage"));
// Public portfolio — /u/:handle. AUTH-FREE so it works for LinkedIn /
// résumé recipients. The backend returns 404 unless the owner opted in.
const PublicPortfolioPage = lazy(() => import("@/features/portfolio/pages/PublicPortfolioPage"));
// Personal "saved" feed — /saved. Auth-gated, viewer's own bookmarks
// across problems / writeups / roadmaps.
const SavedPage          = lazy(() => import("@/features/bookmarks/pages/SavedPage"));

/**
 * Phase 15 — redirect the legacy /student/:userId route onto
 * /profile/:userId. Every inbound link (old notifications, old
 * bookmarks, hard-coded nav entries) now lands on the rich page
 * without us having to grep every reference. Old StudentProfilePage
 * stays in the repo for now; we can delete it in a follow-up once
 * we're confident nothing else references it.
 */
function StudentUserIdRedirect() {
  const { userId } = useParams();
  return <Navigate to={`/profile/${userId}`} replace />;
}

export const publicRoutes = (
  <Route element={<MainLayout />}>
    <Route index element={<HomePage />} />
    <Route path="leaderboard" element={<LeaderboardPage />} />
    <Route path="events" element={<EventsPage />} />
    <Route path="gallery" element={<GalleryPage />} />
    <Route path="contact" element={<ContactPage />} />
    {/* Public certificate verification — no auth, anyone with the
        token (scanned from QR on a printed cert) can confirm it's
        genuine. The token is in ?token=... query param. */}
    <Route path="verify" element={<VerifyCertificatePage />} />

    {/* ── Student routes (auth required) ── */}
    <Route path="arena"         element={<ProtectedRoute><ArenaPage /></ProtectedRoute>} />
    <Route path="dashboard"     element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
    <Route path="profile"       element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
    {/* Phase 15 — rich profile for any user (self included) */}
    <Route path="profile/:userId" element={<ProtectedRoute><RichProfilePage /></ProtectedRoute>} />
    <Route path="certificates"  element={<ProtectedRoute><CertificatesPage /></ProtectedRoute>} />
    <Route path="projects"      element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
    <Route path="notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
    <Route path="billing"       element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
    <Route path="referrals"     element={<ProtectedRoute><ReferralPage /></ProtectedRoute>} />
    {/* Legacy alias — redirects to /profile/:userId for Phase 15. */}
    <Route path="student/:userId" element={<ProtectedRoute><StudentUserIdRedirect /></ProtectedRoute>} />
    <Route path="live-quiz"     element={<ProtectedRoute><LiveQuizPage /></ProtectedRoute>} />
    <Route path="history"       element={<ProtectedRoute><TestHistoryPage /></ProtectedRoute>} />

    {/* ── Problem-statement catalogue (auth-gated browse) ── */}
    <Route path="problems"               element={<ProtectedRoute><ProblemsListPage /></ProtectedRoute>} />
    <Route path="problems/submit"        element={<ProtectedRoute><SubmitProblemPage /></ProtectedRoute>} />
    <Route path="problems/submit/thanks" element={<ProtectedRoute><SubmitThanksPage /></ProtectedRoute>} />
    <Route path="problems/:slugOrId"     element={<ProtectedRoute><ProblemDetailPage /></ProtectedRoute>} />

    {/* ── Roadmaps (auth-gated; sequenced learning paths) ── */}
    <Route path="roadmaps"               element={<ProtectedRoute><RoadmapsListPage /></ProtectedRoute>} />
    <Route path="roadmaps/:slug/edit"    element={<ProtectedRoute><RoadmapEditorPage /></ProtectedRoute>} />
    <Route path="roadmaps/:slug"         element={<ProtectedRoute><RoadmapDetailPage /></ProtectedRoute>} />

    {/* ── Public portfolio — AUTH-FREE shareable page. ── */}
    <Route path="u/:handle"            element={<PublicPortfolioPage />} />

    {/* ── Personal saved feed (bookmarks) ── */}
    <Route path="saved"                element={<ProtectedRoute><SavedPage /></ProtectedRoute>} />
  </Route>
);
