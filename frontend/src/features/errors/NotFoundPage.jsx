import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth-store";
import { dashboardForRole } from "@/lib/roles";

export default function NotFoundPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const isAuth = status === "authenticated" && user;
  const homePath = isAuth ? dashboardForRole(user.role) : "/";

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary/80">
        Error 404
      </p>
      <h1 className="mt-4 font-display text-5xl font-extrabold tracking-tight sm:text-6xl">
        Lost in the void
      </h1>
      <p className="mt-4 max-w-md text-sm leading-7 text-text-muted">
        This route doesn&rsquo;t exist on the Math Collective. Let&rsquo;s get you back.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full border border-line/15 bg-white/[0.03] px-5 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted transition hover:text-white"
        >
          Go back
        </button>
        <Link
          to={homePath}
          className="rounded-full border border-primary/30 bg-primary/12 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white transition hover:bg-primary/20"
        >
          {isAuth ? "To dashboard" : "Home"}
        </Link>
      </div>
    </div>
  );
}
