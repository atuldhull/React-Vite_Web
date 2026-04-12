import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/auth-store";
import Loader from "@/components/ui/Loader";
import ForbiddenPage from "@/features/errors/ForbiddenPage";

/**
 * ProtectedRoute — guards authenticated routes.
 *
 * Behavior:
 * - While session is being checked (idle/loading): shows spinner, never
 *   flashes protected content or redirects prematurely.
 * - If not authenticated: redirects to /login with the intended URL preserved
 *   in location.state so the user returns to the right page after login.
 * - If authenticated but lacking the required role: renders a 403 page
 *   in place (no redirect) so the browser URL stays accurate and the back
 *   button behaves predictably.
 * - All redirects use `replace` so the back button does not loop.
 */
export default function ProtectedRoute({ children, roles }) {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader variant="orbit" size="lg" label="Loading..." />
      </div>
    );
  }

  if (status !== "authenticated" || !user) {
    // Preserve the path the user originally wanted, so LoginPage can
    // bounce them back after successful authentication.
    const from = location.pathname + location.search;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  if (roles && roles.length && !roles.includes(user.role)) {
    return <ForbiddenPage />;
  }

  return children;
}
