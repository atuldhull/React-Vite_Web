/**
 * 403 + 404 routes — rendered inside MainLayout so they share the site chrome.
 * These are NOT lazy-loaded: they're small, and needing to fetch a chunk just
 * to show "page not found" would be a bad experience on a flaky network.
 */

import { Route } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import NotFoundPage  from "@/features/errors/NotFoundPage";
import ForbiddenPage from "@/features/errors/ForbiddenPage";

export const errorRoutes = (
  <Route element={<MainLayout />}>
    <Route path="403" element={<ForbiddenPage />} />
    <Route path="*"   element={<NotFoundPage />} />
  </Route>
);
