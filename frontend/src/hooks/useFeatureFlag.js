/**
 * useFeatureFlag — Hook to check if a feature is enabled for the current org.
 *
 * Usage:
 *   const { enabled, loading, upgrade } = useFeatureFlag("ai_tools");
 *   if (!enabled) return <UpgradePrompt feature="ai_tools" />;
 *
 * Logic:
 *   1. Super admins always get all features
 *   2. Fetches org's active features from backend
 *   3. Caches in Zustand store (avoids re-fetching per component)
 *   4. Returns { enabled, loading, currentPlan }
 */

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/auth-store";
import { orgAdmin } from "@/lib/api";

// Module-level cache to avoid fetching per component
let featureCache = null;
let fetchPromise = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

async function fetchOrgFeatures() {
  const now = Date.now();
  if (featureCache && (now - cacheTime) < CACHE_TTL) return featureCache;
  if (fetchPromise) return fetchPromise;

  fetchPromise = orgAdmin.features()
    .then(res => {
      const data = res.data || {};
      // Build effective features map from the merged view
      const effective = {};
      Object.entries(data.features || {}).forEach(([key, val]) => {
        effective[key] = val.effective ?? true;
      });
      // Also include plan features not in overrides
      Object.entries(data.plan_features || {}).forEach(([key, val]) => {
        if (!(key in effective)) effective[key] = val;
      });
      featureCache = {
        features: effective,
        plan: data.plan_name || "starter",
        limits: data.plan_limits || {},
      };
      cacheTime = Date.now();
      fetchPromise = null;
      return featureCache;
    })
    .catch(() => {
      fetchPromise = null;
      return { features: {}, plan: "starter", limits: {} };
    });

  return fetchPromise;
}

// Clear cache (call when org changes)
export function clearFeatureCache() {
  featureCache = null;
  cacheTime = 0;
}

export default function useFeatureFlag(featureKey) {
  const user = useAuthStore(s => s.user);
  const role = user?.role;
  const [state, setState] = useState({ enabled: true, loading: true, currentPlan: "" });

  useEffect(() => {
    // Super admins get everything
    if (role === "super_admin") {
      setState({ enabled: true, loading: false, currentPlan: "enterprise" });
      return;
    }

    // Not logged in — features are enabled (public pages work)
    if (!user) {
      setState({ enabled: true, loading: false, currentPlan: "" });
      return;
    }

    fetchOrgFeatures().then(cache => {
      const enabled = cache.features[featureKey] !== false; // default to true if not explicitly disabled
      setState({ enabled, loading: false, currentPlan: cache.plan });
    });
  }, [featureKey, user, role]);

  return state;
}
