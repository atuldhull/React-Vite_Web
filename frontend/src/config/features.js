/**
 * Feature Definitions — Master list of all toggleable platform features.
 *
 * Each feature has:
 *   - key: unique identifier (used in DB feature_flags JSONB)
 *   - label: human-readable name
 *   - description: what it does
 *   - icon: emoji
 *   - category: grouping for UI
 *   - plans: which plans include it by default
 *
 * This is the SINGLE SOURCE OF TRUTH for feature names.
 * Backend checkFeatureFlag() uses the same keys.
 */

export const FEATURE_DEFINITIONS = [
  // Core (included in all plans)
  { key: "arena",          label: "Challenge Arena",       description: "Math challenge solving with XP rewards",           icon: "🧮", category: "Core",          plans: ["starter", "professional", "enterprise"] },
  { key: "leaderboard",    label: "Leaderboards",          description: "Weekly and all-time XP rankings",                 icon: "🏆", category: "Core",          plans: ["starter", "professional", "enterprise"] },
  { key: "events",         label: "Events",                description: "Event creation, registration, and management",     icon: "📅", category: "Core",          plans: ["starter", "professional", "enterprise"] },
  { key: "notifications",  label: "Notifications",         description: "Real-time push notifications via Socket.IO",       icon: "🔔", category: "Core",          plans: ["starter", "professional", "enterprise"] },

  // Professional features
  { key: "ai_tools",       label: "AI Question Generator", description: "Generate math questions using DeepSeek AI",        icon: "🤖", category: "AI & Content",  plans: ["professional", "enterprise"] },
  { key: "certificates",   label: "Certificates",          description: "PDF certificate generation with LaTeX templates",  icon: "📜", category: "AI & Content",  plans: ["professional", "enterprise"] },
  { key: "quiz",           label: "Live Quiz",             description: "Real-time quiz sessions via Socket.IO",            icon: "⚡", category: "Engagement",    plans: ["professional", "enterprise"] },
  { key: "projects",       label: "Team Projects",         description: "Student teams, project submissions, voting",       icon: "🛠️", category: "Engagement",    plans: ["professional", "enterprise"] },
  { key: "gallery",        label: "Photo Gallery",         description: "Event photo gallery with categories",              icon: "🖼️", category: "Engagement",    plans: ["professional", "enterprise"] },
  { key: "achievements",   label: "Achievements",          description: "Badge system with auto-unlocking milestones",      icon: "🏅", category: "Engagement",    plans: ["professional", "enterprise"] },
  { key: "qr_checkin",     label: "QR Check-in",           description: "QR code generation and scanner for events",        icon: "📱", category: "Events",        plans: ["professional", "enterprise"] },
  { key: "event_leaderboard", label: "Event Leaderboards", description: "Per-event scoring and rankings",                   icon: "📊", category: "Events",        plans: ["professional", "enterprise"] },

  // Enterprise features
  { key: "messaging",      label: "E2EE Messaging",        description: "End-to-end encrypted chat between students",      icon: "💬", category: "Communication", plans: ["enterprise"] },
  { key: "referrals",      label: "Referral System",        description: "Referral codes with QR and XP bonuses",           icon: "🎁", category: "Growth",        plans: ["enterprise"] },
  { key: "analytics",      label: "Advanced Analytics",     description: "Insights, recommendations, health metrics",       icon: "📈", category: "Analytics",     plans: ["enterprise"] },
  { key: "custom_branding", label: "Custom Branding",       description: "Custom colors, logo, domain for your org",        icon: "🎨", category: "Customization", plans: ["enterprise"] },
  { key: "data_export",    label: "Data Export",            description: "Export all platform data as CSV/ZIP",              icon: "📦", category: "Analytics",     plans: ["enterprise"] },
  { key: "api_access",     label: "API Access",             description: "REST API access for integrations",                icon: "🔗", category: "Customization", plans: ["enterprise"] },
];

// Group by category
export const FEATURE_CATEGORIES = [...new Set(FEATURE_DEFINITIONS.map(f => f.category))];

// Quick lookup
export const FEATURES_BY_KEY = Object.fromEntries(FEATURE_DEFINITIONS.map(f => [f.key, f]));

// Get features for a plan
export function getFeaturesForPlan(planName) {
  const name = (planName || "starter").toLowerCase();
  return FEATURE_DEFINITIONS.filter(f => f.plans.includes(name));
}

// Check if a feature is in a plan
export function isPlanFeature(featureKey, planName) {
  const f = FEATURES_BY_KEY[featureKey];
  return f ? f.plans.includes((planName || "starter").toLowerCase()) : false;
}
