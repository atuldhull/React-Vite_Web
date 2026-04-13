/**
 * usePublicStats — shared hook for the homepage hero + auth-page sidebar.
 *
 * Hits GET /api/stats/public exactly once per page mount and returns
 * { members, challenges, events, loading }. Each value is either the
 * real DB count (`is_active = true` rows in students/challenges/events)
 * or null. Callers should render "—" for null so we never display a
 * fake number while loading or after a request fails.
 */

import { useEffect, useState } from "react";
import http from "@/lib/http";

export function usePublicStats() {
  const [stats, setStats] = useState({
    members:     null,
    challenges:  null,
    events:      null,
    submissions: null,
    loading:     true,
  });

  useEffect(() => {
    let cancelled = false;
    http.get("/stats/public")
      .then((r) => {
        if (cancelled) return;
        setStats({
          members:     r.data?.members     ?? null,
          challenges:  r.data?.challenges  ?? null,
          events:      r.data?.events      ?? null,
          submissions: r.data?.submissions ?? null,
          loading:     false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Soft-fail: leave values null so UI shows "—"
        setStats((s) => ({ ...s, loading: false }));
      });
    return () => { cancelled = true; };
  }, []);

  return stats;
}

/** Render-helper: number -> string for display. null -> em-dash. */
export function formatStat(n) {
  if (n == null) return "\u2014"; // em-dash
  return String(n);
}
