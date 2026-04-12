/**
 * Router composition.
 *
 * Actual route definitions live in `./routes/*Routes.jsx` — this file is
 * pure orchestration: router shell, session bootstrap, scroll management,
 * animated transitions, Suspense fallback.
 */

import { AnimatePresence } from "framer-motion";
import { Suspense, useEffect, useRef } from "react";
import {
  BrowserRouter,
  Routes,
  useLocation,
  useNavigationType,
} from "react-router-dom";

import ExperienceShell   from "@/components/experience/ExperienceShell";
import PageTransition    from "@/components/experience/PageTransition";
import MonumentTransition from "@/components/experience/MonumentTransition";
import MonumentRouter    from "@/components/monument/MonumentRouter";
import Loader            from "@/components/ui/Loader";
import { useAuthStore }  from "@/store/auth-store";

import { publicRoutes }     from "./routes/publicRoutes";
import { authRoutes }       from "./routes/authRoutes";
import { teacherRoutes }    from "./routes/teacherRoutes";
import { adminRoutes }      from "./routes/adminRoutes";
import { superAdminRoutes } from "./routes/superAdminRoutes";
import { errorRoutes }      from "./routes/errorRoutes";

/**
 * Scroll management — mirrors the SPA behaviour most users expect:
 *   - PUSH     (clicking a link)      -> scroll to top
 *   - REPLACE  (login redirect etc.)  -> scroll to top
 *   - POP      (browser Back/Forward) -> leave scroll alone; the browser
 *     has already restored the saved scroll position for that history entry
 *
 * The navigation type is the reliable signal; the previous unconditional
 * scroll-to-top jumped the user back to the top of long pages when they
 * pressed Back.
 */
function ScrollManager() {
  const { pathname } = useLocation();
  const navType = useNavigationType(); // "PUSH" | "REPLACE" | "POP"
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (lastPath.current === pathname) return; // query-only change
    lastPath.current = pathname;

    if (navType === "POP") return;             // browser restored the scroll

    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, navType]);

  return null;
}

/** Triggers the initial /auth/me session check on app mount. */
function SessionLoader({ children }) {
  const checkSession = useAuthStore((s) => s.checkSession);
  const status = useAuthStore((s) => s.status);
  useEffect(() => {
    if (status === "idle") checkSession();
  }, [status, checkSession]);
  return children;
}

/** Shown while a lazy-loaded route chunk is being fetched. */
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
              {publicRoutes}
              {authRoutes}
              {teacherRoutes}
              {adminRoutes}
              {superAdminRoutes}
              {errorRoutes}
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
