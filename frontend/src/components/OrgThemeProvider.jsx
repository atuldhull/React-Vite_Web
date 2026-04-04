/**
 * OrgThemeProvider — Applies organization branding dynamically.
 *
 * Reads org_color, org_name from auth store (set at login).
 * Optionally fetches full branding (logo, secondary color) from API.
 * Injects CSS custom properties on :root for dynamic theming.
 *
 * CSS variables set:
 *   --org-primary: #hexcolor
 *   --org-secondary: #hexcolor
 *   --org-name: "Org Name"
 */

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth-store";

export default function OrgThemeProvider({ children }) {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const [branding, setBranding] = useState(null);

  // Apply org color from auth session (instant, no API call)
  useEffect(() => {
    if (!user?.org_color) return;

    const root = document.documentElement;
    root.style.setProperty("--org-primary", user.org_color);

    // Also update theme-color meta tag
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", user.org_color);

    return () => {
      root.style.removeProperty("--org-primary");
    };
  }, [user?.org_color]);

  // Fetch full branding for logo/secondary color (only if logged into an org)
  useEffect(() => {
    if (status !== "authenticated" || !user?.org_id) return;

    import("@/lib/http").then(({ default: http }) => {
      http.get("/org-admin/branding")
        .then((res) => {
          const data = res.data;
          setBranding(data);

          const root = document.documentElement;
          if (data.primary_color) root.style.setProperty("--org-primary", data.primary_color);
          if (data.secondary_color) root.style.setProperty("--org-secondary", data.secondary_color);
        })
        .catch(() => { /* not an org admin, or no branding — ignore */ });
    });
  }, [status, user?.org_id]);

  return children;
}

/**
 * Hook to access org branding in any component.
 */
export function useOrgBranding() {
  const user = useAuthStore((s) => s.user);
  return {
    orgName: user?.org_name || null,
    orgColor: user?.org_color || "#7c3aed",
    orgSlug: user?.org_slug || null,
    orgPlan: user?.org_plan || "free",
    orgId: user?.org_id || null,
  };
}
