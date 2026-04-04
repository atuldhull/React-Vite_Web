import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth-store";
import Loader from "@/components/ui/Loader";

export default function ProtectedRoute({ children, roles }) {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader variant="orbit" size="lg" label="Loading..." />
      </div>
    );
  }

  if (status !== "authenticated" || !user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
