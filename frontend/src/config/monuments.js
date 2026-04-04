/**
 * Monument Configuration
 *
 * Each monument defines a complete 3D environment: climate, lighting,
 * weather effects, audio, fog, and accent colors. Pages are mapped
 * to monuments via PAGE_TO_MONUMENT.
 */

export const MONUMENTS = {
  desert: {
    id: "desert",
    name: "Desert Winds Observatory",
    accent: "#D4A017",
    symbol: "∑",
    climate: "arid",
    timeOfDay: "variable", // uses real system clock
    coords: { lat: 23, lon: 13 },
    weather: ["clear", "sandstorm", "heatwave"],
    ambientSound: "desert_wind.mp3",
    fogColor: "#3d1f00",
    fogDensity: 0.003,
    skyTint: "#D4A017",
    groundColor: "#2a1500",
    pages: ["/arena", "/"],
  },

  pyramid: {
    id: "pyramid",
    name: "Great Pyramid Theorem",
    accent: "#7B4FE0",
    symbol: "∫",
    climate: "arid_night",
    timeOfDay: "night",
    coords: { lat: 29.9, lon: 31.1 },
    weather: ["clear_night", "dusty"],
    ambientSound: "desert_night.mp3",
    fogColor: "#080020",
    fogDensity: 0.002,
    skyTint: "#7B4FE0",
    groundColor: "#12004a",
    pages: ["/dashboard", "/history"],
  },

  glacier: {
    id: "glacier",
    name: "Glacial Citadel of Limits",
    accent: "#00CFFF",
    symbol: "ε",
    climate: "arctic",
    timeOfDay: "aurora",
    coords: { lat: 64, lon: -18 },
    weather: ["snowfall", "blizzard", "clear_arctic", "aurora"],
    ambientSound: "arctic_wind.mp3",
    fogColor: "#001428",
    fogDensity: 0.004,
    skyTint: "#00CFFF",
    groundColor: "#002244",
    pages: ["/leaderboard"],
  },

  jungle: {
    id: "jungle",
    name: "Jungle Ruins of Infinity",
    accent: "#2ECC71",
    symbol: "∞",
    climate: "tropical",
    timeOfDay: "golden_hour",
    coords: { lat: -3, lon: -60 },
    weather: ["rain", "humid_haze", "clear_tropical"],
    ambientSound: "jungle_ambience.mp3",
    fogColor: "#002a0a",
    fogDensity: 0.005,
    skyTint: "#2ECC71",
    groundColor: "#001208",
    pages: ["/events", "/projects"],
  },

  neon: {
    id: "neon",
    name: "Neon Spire City of Proofs",
    accent: "#FF2D78",
    symbol: "λ",
    climate: "urban_night",
    timeOfDay: "night",
    coords: { lat: 35.6, lon: 139.7 },
    weather: ["neon_rain", "clear_night", "fog"],
    ambientSound: "city_rain_night.mp3",
    fogColor: "#04000f",
    fogDensity: 0.006,
    skyTint: "#FF2D78",
    groundColor: "#120030",
    pages: ["/login", "/register", "/billing"],
  },

  abyss: {
    id: "abyss",
    name: "Abyssal Library of Constants",
    accent: "#00FFC8",
    symbol: "∂",
    climate: "underwater",
    timeOfDay: "bioluminescent",
    coords: { lat: -11, lon: -175 },
    weather: ["current_flow", "particle_drift"],
    ambientSound: "underwater_ambient.mp3",
    fogColor: "#000d1a",
    fogDensity: 0.008,
    skyTint: "#00FFC8",
    groundColor: "#001f3a",
    pages: ["/gallery"],
  },

  sky: {
    id: "sky",
    name: "Sky Archipelago of Transformations",
    accent: "#B695F8",
    symbol: "φ",
    climate: "aerial",
    timeOfDay: "variable",
    coords: { lat: 0, lon: 0 },
    weather: ["clear_sky", "drifting_clouds", "starfield"],
    ambientSound: "sky_winds.mp3",
    fogColor: "#0f0025",
    fogDensity: 0.001,
    skyTint: "#B695F8",
    groundColor: "#1a0840",
    pages: ["/profile", "/certificates", "/notifications"],
  },

  magma: {
    id: "magma",
    name: "Magma Forge of Axioms",
    accent: "#FF6B35",
    symbol: "∀",
    climate: "volcanic",
    timeOfDay: "ashen_twilight",
    coords: { lat: 37.7, lon: 15 },
    weather: ["ember_rain", "smoke", "lava_glow"],
    ambientSound: "volcano_forge.mp3",
    fogColor: "#200800",
    fogDensity: 0.005,
    skyTint: "#FF6B35",
    groundColor: "#100200",
    pages: ["/admin", "/teacher", "/super-admin"],
  },
};

/**
 * Maps every route path to its monument ID.
 * Includes both exact matches and prefix matches for nested routes.
 */
export const PAGE_TO_MONUMENT = {
  // Desert — Arena & Home
  "/": "desert",
  "/arena": "desert",

  // Pyramid — Dashboard & History
  "/dashboard": "pyramid",
  "/history": "pyramid",

  // Glacier — Leaderboard
  "/leaderboard": "glacier",

  // Jungle — Events & Projects
  "/events": "jungle",
  "/projects": "jungle",

  // Neon — Auth & Billing
  "/login": "neon",
  "/register": "neon",
  "/billing": "neon",

  // Abyss — Gallery & PANDA
  "/gallery": "abyss",

  // Sky — Profile, Certs, Notifs
  "/profile": "sky",
  "/certificates": "sky",
  "/notifications": "sky",
  "/live-quiz": "sky",

  // Magma — Admin, Teacher, Super Admin
  "/admin": "magma",
  "/teacher": "magma",
  "/super-admin": "magma",

  // Contact & fallback
  "/contact": "desert",
};

/**
 * Resolves a pathname to a monument ID.
 * Tries exact match first, then prefix match for nested routes
 * (e.g. /admin/users → /admin → magma).
 *
 * @param {string} pathname - The current route path
 * @returns {string} Monument ID (defaults to 'desert')
 */
export function getMonumentForPath(pathname) {
  // Exact match
  if (PAGE_TO_MONUMENT[pathname]) {
    return PAGE_TO_MONUMENT[pathname];
  }

  // Prefix match — try progressively shorter prefixes
  // e.g. "/admin/users/123" → "/admin/users" → "/admin"
  const segments = pathname.split("/").filter(Boolean);
  while (segments.length > 0) {
    const prefix = "/" + segments.join("/");
    if (PAGE_TO_MONUMENT[prefix]) {
      return PAGE_TO_MONUMENT[prefix];
    }
    segments.pop();
  }

  return "desert"; // fallback
}

/**
 * Quick access to monument config by ID.
 * @param {string} id - Monument ID
 * @returns {object|undefined}
 */
export function getMonument(id) {
  return MONUMENTS[id];
}
