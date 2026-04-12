import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/auth-store";
import Loader from "@/components/ui/Loader";
import { dashboardForRole } from "@/lib/roles";

/**
 * GuestOnlyRoute — wraps pages that only make sense when logged out
 * (login, register). If an authenticated user lands here, redirect them
 * to their role-specific dashboard instead of letting them see the login form.
 *
 * Prevents:
 * - Logged-in users seeing the login page (confusing UX)
 * - Back-button exposing login page after successful auth
 */
export default function GuestOnlyRoute({ children }) {
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

  if (status === "authenticated" && user) {
    // If they were bounced here from a protected route, return to it;
    // otherwise drop them at their role-appropriate dashboard.
    const target = location.state?.from || dashboardForRole(user.role);
    return <Navigate to={target} replace />;
  }

  return children;
}
