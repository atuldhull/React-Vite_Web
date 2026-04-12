# Math Collective — Development Progress Log

> **Last Updated:** April 2, 2026
> **Sessions:** Multiple development sessions across Prompts 1–9 (UI reskin) + Parts 1–8 (3D monument system)

---

## Phase 1: Visual Theme System (Prompts 1–9)

### Prompt 1 — Theme Foundation
**What changed:** Added the monument CSS variable system to `theme.css`.
**Files modified:**
- `frontend/src/styles/theme.css` — Added 8 monument accent colors (`--monument-desert` through `--monument-magma`), 4 math clip-path shapes (`--clip-hex`, `--clip-para`, `--clip-notch`, `--clip-diamond`), `--page-accent`/`--page-glow` system, `[data-monument]` attribute overrides, heading font (Space Grotesk), `.math-text` utility class (JetBrains Mono)
- `frontend/src/styles/tailwind.css` — Unchanged (fonts imported in main.jsx)
- `frontend/src/main.jsx` — Added `@fontsource/space-grotesk` and `@fontsource/jetbrains-mono` imports

### Prompt 2 — UI Primitives Reskin
**What changed:** Restyled Button, Card, InputField with math-themed shapes.
**Files modified:**
- `frontend/src/components/ui/Button.jsx` — Hex clip-path for primary, parallelogram for secondary, diamond for danger. Hover glow via `--page-glow`. Removed all border-radius.
- `frontend/src/components/ui/Card.jsx` — Notch clip-path, accent triangle in top-right corner, top border in `--page-accent`.
- `frontend/src/components/ui/InputField.jsx` — Bottom-border-only style, left accent bar (`--page-accent`), focus glow.

### Prompt 3A + 3B — Monument Backgrounds (8 biomes)
**What changed:** Created all 8 animated CSS biome backgrounds + the `useMonument` hook.
**Files created:**
- `frontend/src/components/backgrounds/MonumentBackground.jsx` — 673 lines. 8 sub-components (DesertBg, PyramidBg, GlacierBg, JungleBg, CityBg, AbyssBg, SkyBg, MagmaBg) with CSS keyframe animations for floating symbols, aurora bands, ice crystals, vines, fireflies, neon scan lines, caustic lights, bio-glow, twinkling stars, floating islands, ember particles, lava flow.
- `frontend/src/hooks/useMonument.js` — Sets `data-monument` attribute on `<body>` for CSS scoping.

### Prompt 4 — Three.js Earth Homepage
**What changed:** Built the 3D rotating Earth hero for the homepage.
**Files created:**
- `frontend/src/components/experience/EarthHero.jsx` — Three.js Earth with clouds, atmosphere, stars, GSAP scroll-zoom + fade.
**Files modified:**
- `frontend/src/features/home/pages/HomePage.jsx` — Full-viewport Earth hero section, desert monument content below.
**Assets added:**
- `public/textures/earth.jpg`, `public/textures/clouds.png`

### Prompt 5 — Page Transition System
**What changed:** Created the monument-themed page transition overlay.
**Files created:**
- `frontend/src/components/experience/MonumentTransition.jsx` — Route-to-monument mapping, math symbol overlay (∑ ∫ △ ∞ λ Ω φ ∇), Framer Motion enter/exit animations.
**Files modified:**
- `frontend/src/app/router.jsx` — Wired MonumentTransition + AnimatePresence + PageTransition.

### Prompt 6 — Student Pages Reskin
**What changed:** Added monument backgrounds to all student-facing pages, replaced bare `<button>` elements.
**Files modified (6):**
- `ArenaPage.jsx` — desert monument, difficulty badges with `--clip-para`, timer `math-text`, XP popup scale animation, option buttons notch clip, filter/comment/AI buttons → Button component
- `DashboardPage.jsx` — pyramid monument, stat values `math-text`, Space Grotesk headings
- `LeaderboardPage.jsx` — glacier monument, rank numbers `math-text`, top-3 podium glow, tab buttons → Button
- `EventsPage.jsx` — jungle monument, filter buttons → Button
- `TestHistoryPage.jsx` — pyramid monument, stat numbers `math-text`
- `ProjectsPage.jsx` — sky monument, filter buttons → Button, vote count `math-text`

### Prompt 7 — Auth & Profile Pages Reskin
**What changed:** Reskinned auth forms and profile/settings pages.
**Files modified (6):**
- `LoginPage.jsx` — city monument, notch clip form, `λ` background symbol, Space Grotesk title, bare buttons → Button, bare input → InputField
- `RegisterPage.jsx` — city monument, `∑` background symbol
- `ProfilePage.jsx` — sky monument, avatar sky-colored border + glow, XP bar shimmer animation, title badge `--clip-para` with sky bg
- `CertificatesPage.jsx` — sky monument, stat numbers `math-text`
- `NotificationsPage.jsx` — sky monument, unread rows left border + tint
- `BillingPage.jsx` — city monument, Space Grotesk heading, plan name `math-text`

### Prompt 8 — Admin & Teacher Pages Reskin
**What changed:** Added magma monument to all admin/teacher/superadmin pages.
**Files modified (15):**
- **6 Admin pages:** monument background, Space Grotesk headings, table row orange hover border, danger zone red glow, `math-text` stats, bare buttons → Button
- **5 Teacher pages:** monument background, quiz code styled (3rem, JetBrains Mono, city color), AI generate button → primary variant
- **4 Super Admin pages:** monument background (intensity 0.08)

### Prompt 9 — PANDA Bot Reskin
**What changed:** Restyled the floating AI chat bot with abyss theme.
**Files modified (2):**
- `PandaBot.jsx` — Hex-shaped trigger button (#000d1a bg, abyss border + glow), scaled emoji
- `PandaChatPanel.jsx` — Full rewrite: notch clip panel, abyss dark bg, header with ∞ symbol + "Math Intelligence Unit", user messages → para clip, bot messages → notch clip, typing dots → abyss color, quick chips → para clip with hover, send button → hex clip

---

## Phase 2: 3D Monument Experience (Parts 1–8)

### Part 1 — Foundation Layer
**What changed:** Built the core infrastructure for the 3D system.
**Files created (6):**
- `frontend/src/config/monuments.js` — All 8 monument configs (climate, weather, audio, fog, accent, coords), PAGE_TO_MONUMENT map, `getMonumentForPath()` helper
- `frontend/src/hooks/usePerformanceTier.js` — GPU detection (WebGL probe + cores + memory), 3-tier scoring (high/mid/low)
- `frontend/src/hooks/useDayNight.js` — Time-of-day manager with light configs for 10 phases, sun position formula, variable vs fixed time
- `frontend/src/components/monument/MouseLookCamera.jsx` — Orbit camera: drag, scroll, touch, pinch. All state in refs. Damped lerp.
- `frontend/src/systems/DayNightSystem.jsx` — R3F lighting: directional + ambient + hemisphere + drei Sky + twinkling starfield (GLSL shader). 3-second smooth transitions.
- `frontend/src/components/monument/MonumentScene.jsx` — Master wrapper: fixed Canvas, ACESFilmic, demand frameloop, GPU-adaptive DPR. `MonumentPageWrapper` for CSS.

### Part 2 — Homepage Earth Experience
**What changed:** Built the photorealistic Earth with scroll descent.
**Files created (3):**
- `frontend/src/features/home/hooks/useScrollProgress.js` — Scroll 0→1 over 3×vh, rAF-based 60fps tracking
- `frontend/src/features/home/components/EarthLoadingScreen.jsx` — R3F Suspense fallback (wireframe icosahedron + pulsing core)
- `frontend/src/features/home/components/EarthHero.jsx` — 420 lines. Custom GLSL day/night Earth shader, Fresnel atmosphere, 5000 twinkling stars, orbiting moon with glow, Catmull-Rom camera spline (6 waypoints), re-entry plasma FBM shader, scroll-driven postprocessing (bloom, chromatic aberration, vignette), DOM overlay (hero text, stats, scroll indicator)
**Files modified:**
- `HomePage.jsx` — Rewired to use new EarthHero with error boundary + lazy loading

### Part 3 — Desert Winds Observatory
**What changed:** Built the complete desert monument 3D scene.
**Files created (2):**
- `frontend/src/systems/noiseTexture.js` — Simplex noise DataTexture generator (multi-octave, seedable)
- `frontend/src/features/monuments/DesertObservatory.jsx` — 430 lines. Procedural sand dune terrain (displacement shader), 5-tier sandstone ziggurat, copper dome + armillary sphere, 4 archways + 8 math symbols, 8 flickering torches, 50K instanced sandstorm particles, heat shimmer custom postprocessing, exponential fog

### Part 4 — Shared Systems
**What changed:** Built 3 systems shared by all 8 monuments.
**Files created (3):**
- `frontend/src/systems/WeatherSystem.jsx` — 380 lines. Weather context + orchestrator (3-8 min random cycling, 15s crossfade). 8 effect components: Rain (40K), NeonRain (+puddles), Snowfall (30K), Blizzard (80K), EmberRain (8K spiral), Aurora (GLSL shader plane), ParticleDrift (3K bioluminescent)
- `frontend/src/systems/NPCSystem.jsx` — 280 lines. FSM (IDLE→WALKING→STOPPING→ACTION), primitive mesh NPCs with LOD (full<30u, body 30-80u, culled>80u), collision avoidance, speech bubble easter eggs via React portal
- `frontend/src/systems/MonumentTransitionSystem.jsx` — 290 lines. 3-phase cinematic transition: Phase 1 (dissolve + spiral-in particles), Phase 2 (black void + spinning math symbol), Phase 3 (assemble + spiral-out). TransitionProvider context.

### Part 5 — Monuments 2, 3, 4
**What changed:** Built Pyramid, Glacier, and Jungle monuments.
**Files created (3):**
- `frontend/src/features/monuments/GreatPyramidTheorem.jsx` — 340 lines. Glass pyramid (MeshPhysical, transmission 0.85), aurora edge tubes (GLSL pulse), floating math constants (e π φ i ∞), 8000-star night sky, moon with glow, star-chart plaza, meteor shower easter egg (5% chance)
- `frontend/src/features/monuments/GlacialCitadel.jsx` — 310 lines. Ice castle (keep + 4 spires + battlements, MeshPhysical transmission 0.92, ior 1.31), aurora borealis (3 sine-band GLSL), frozen terrain (noise displacement), frozen ocean (subtle ripple), snow caps, 3 penguin easter eggs (waddle animation)
- `frontend/src/features/monuments/JungleRuins.jsx` — 380 lines. Angkor-style temple (3 tiers + towers), 40 banyan trees + 20 palms (wind vertex shader), waterfall (scrolling UV + mist sprites), 200 fireflies (instanced, active dusk/night), jungle terrain (soil/moss gradient + 30 root cylinders), golden hour lighting

### Part 6A — Monuments 5, 6
**What changed:** Built Neon City and Abyssal Library monuments.
**Files created (2):**
- `frontend/src/features/monuments/NeonSpireCity.jsx` — 380 lines. 300 seeded procedural buildings (glass/concrete), 400u central spire with 16 equation-scrolling strips (canvas-rendered math text → GLSL UV scroll), 30 flying vehicles on orbital paths, wet street (roughness 0.05) + 20 ripple puddles (GLSL), 4 holographic billboards (GLSL scanline + scroll), hemisphere neon bleed lighting
- `frontend/src/features/monuments/AbyssalLibrary.jsx` — 420 lines. 5 fake volumetric god rays, cavern walls + 200 instanced bookshelves + 400 glowing tomes, PANDA ROV (sphere + camera + thrusters + LED ring), 80 bioluminescent coral (instanced, pulsing emissive), 3000 plankton drift particles, 80 fish boids (cohesion + separation + alignment), anglerfish easter egg, water surface from below (shimmer shader)

### Part 6B — Monuments 7, 8
**What changed:** Built Sky Archipelago and Magma Forge monuments.
**Files created (2):**
- `frontend/src/features/monuments/SkyArchipelago.jsx` — 380 lines. 6 floating islands (levitation sine wave, cylinder + cone + roots), crystal palace (MeshPhysical transmission 0.8, 5 spires, math symbols), 4 light bridges (QuadraticBezier, additive purple), 60 clouds (3 altitude layers), 200 impossible flowers (instanced, pulsing), 300 sparkle particles under islands, faint daytime stars (2000, opacity 0.15), drei Sky (high altitude)
- `frontend/src/features/monuments/MagmaForge.jsx` — 420 lines. Volcano terrain (caldera shape via smoothstep, torus rim, glowing lava pool), 3 lava rivers (CatmullRom → Tube, FBM noise GLSL flow, 15 flickering pointLights), 3 forge buildings (obsidian, animated piston press arms with axiom symbols, stamp flash), 8000 embers (spiral upward, shrink), 300 smoke sprites (5 vents, rise + expand + drift), ashen sky (inverted sphere gradient + sun disc), 2000 ash fall particles

### Part 7 — Audio + Loading Screens
**What changed:** Built the Howler.js audio system and per-monument loading screens.
**Files created (2):**
- `frontend/src/systems/AudioManager.jsx` — 230 lines. Howler singleton context provider. Monument ambient crossfade (1.5s), 11 weather layer sounds, 3 UI sound effects, localStorage persistence (mute + volume), browser autoplay policy compliance, prefers-reduced-motion respect, mobile volume reduction
- `frontend/src/components/monument/LoadingEnvironment.jsx` — 240 lines. Per-monument themed loading: rotating + pulsing math symbol (200px), monument name + unique tagline, fake progress bar (0→85% timed, 100% on resolve), 200 themed CSS particles (sand/stars/snow/fireflies/rain/plankton/wisps/embers), slide-up exit animation

### Part 8 — Final Integration + Polish
**What changed:** Route integration, performance hooks, accessibility, dev tools.
**Files created (7):**
- `frontend/src/components/monument/MonumentRouter.jsx` — Route→monument context provider, WebGL detection, audio triggering on monument change
- `frontend/src/hooks/useProgressiveTexture.js` — Low-res→high-res texture swap with disposal
- `frontend/src/hooks/usePointLightBudget.js` — Max 15 active PointLights, nearest-to-camera priority sorting
- `frontend/src/hooks/useSceneDisposal.js` — Traverses group ref on unmount, disposes all Three.js resources
- `frontend/src/hooks/useReducedMotion.js` — Detects `prefers-reduced-motion` + `prefers-contrast: high`
- `frontend/src/components/monument/MonumentErrorBoundary.jsx` — Catches WebGL crashes, CSS fallback with monument theme
- `frontend/src/components/monument/LevaDebugPanel.jsx` — Dev-only Leva controls: time override, weather selector, tier, wireframe, NPC hitboxes
**Files modified:**
- `MouseLookCamera.jsx` — Added keyboard controls (Arrow keys rotate, +/- zoom, PageUp/Down, R reset)

---

## Phase 3: Bug Fixes & Infrastructure

### Earth Texture Fix
- Created `frontend/public/textures/` directory with `earth.jpg` + `clouds.png` (copied from `public/textures/`)
- Vite's root is `frontend/`, so static files must be in `frontend/public/`
- Added `EarthErrorBoundary` class component in HomePage to prevent 3D failures from crashing the page

### Homepage Full-Bleed Fix
- Earth hero section breaks out of MainLayout's `max-w-7xl` container using `width: 100vw; marginLeft: calc(-50vw + 50%)`
- Added dark space gradient background behind the 3D canvas
- Added bottom fade gradient for smooth transition into content

### CSS Theme Extension
- Extended `[data-monument]` rules in `theme.css` with `--monument-3d`, `--ui-overlay-bg`, `--ui-text-shadow` variables
- Added `.monument-page-content` and `.monument-canvas-wrapper` utility classes

### Assets Downloaded
- **Earth textures (5):** daymap 8K, nightmap 8K, clouds 2K, normal map, specular map (Solar System Scope, public domain)
- **PBR terrain (4 sets):** Sand (Ground037), Rock023, Snow004, Ice002 — each with Color, NormalGL, Roughness (ambientCG, CC0)
- **HDRI sky maps (3):** kloppenheim_06 (desert), moonlit_golf (night), industrial_sunset (volcano) (Polyhaven, CC0)
- **Audio placeholders (8):** desert_wind, desert_night, arctic_wind, jungle_ambience, city_rain_night, underwater_ambient, sky_winds, volcano_forge (silent placeholders — replace with real loops from freesound.org)

### Packages Installed
- `@react-three/postprocessing`, `postprocessing` — Bloom, chromatic aberration, vignette, DOF
- `@react-three/rapier` — Physics engine
- `three-custom-shader-material` — Custom GLSL injection into Three.js materials
- `simplex-noise`, `alea` — Procedural noise generation
- `react-spring`, `@react-spring/three` — Physics-based animations
- `howler` — Audio management
- `leva` — Dev-only GUI controls

### Project Config Files Created
- Project config files for development tooling
- `PROJECT_BRIEF.md` — Complete project documentation (all endpoints, schemas, flows)
- `MONUMENT_CHECKLIST.md` — Status table for all 8 monuments + 20 systems

---

## File Inventory Summary

### New Files Created (Total: 37)

| Category | Count | Key Files |
|----------|-------|-----------|
| Config | 1 | `config/monuments.js` |
| Hooks | 8 | `usePerformanceTier`, `useDayNight`, `useScrollProgress`, `useProgressiveTexture`, `usePointLightBudget`, `useSceneDisposal`, `useReducedMotion`, `useReducedMotionPreference` (existing) |
| Systems | 6 | `DayNightSystem`, `WeatherSystem`, `NPCSystem`, `MonumentTransitionSystem`, `AudioManager`, `noiseTexture` |
| Monument Scenes | 8 | `DesertObservatory`, `GreatPyramidTheorem`, `GlacialCitadel`, `JungleRuins`, `NeonSpireCity`, `AbyssalLibrary`, `SkyArchipelago`, `MagmaForge` |
| Monument Components | 6 | `MonumentScene`, `MouseLookCamera`, `MonumentRouter`, `MonumentErrorBoundary`, `LoadingEnvironment`, `LevaDebugPanel` |
| Earth Experience | 3 | `EarthHero` (new), `EarthLoadingScreen`, `useScrollProgress` |
| Test/Docs | 4 | `__TEST_EXAMPLE__`, `PROJECT_BRIEF.md`, `MONUMENT_CHECKLIST.md`, `PROGRESS.md` |

### Existing Files Modified (Total: ~35)

| Category | Count | What Changed |
|----------|-------|-------------|
| Student pages | 6 | Monument backgrounds, `math-text`, clip-path badges, Button replacements |
| Auth pages | 2 | City monument, notch clip forms, background symbols |
| Profile pages | 4 | Sky/city monuments, avatar glow, XP shimmer, unread borders |
| Admin pages | 6 | Magma monument, Space Grotesk headings, table hover, danger glow |
| Teacher pages | 5 | Magma monument, quiz code styling, AI button variant |
| Super Admin pages | 4 | Magma monument (intensity 0.08) |
| UI components | 3 | Button, Card, InputField — clip-paths + accent colors |
| Styles | 2 | theme.css, tailwind.css |
| Other | 3 | HomePage, router.jsx, main.jsx |

### Total Lines of New Code: ~8,500+

---

## Build Status

```
✅ Build passes: 0 errors
⏱  Build time: 3.1 seconds
📦 app.js: 926 KB (261 KB gzip) — all pages + UI + state
📦 EarthHero.js: 1,046 KB (320 KB gzip) — Three.js + postprocessing (lazy-loaded)
📦 app.css: 89 KB (21 KB gzip) — Tailwind + theme + monuments
📦 3D monument scenes: tree-shaken (not yet wired to pages)
```

---

## What's Ready vs What Needs Wiring

### ✅ Fully Functional Now (no wiring needed)
- All 27 page UI reskins (monuments, clip-paths, fonts, backgrounds)
- PANDA bot reskin
- CSS variable system (`data-monument`, `--page-accent`, etc.)
- Page transitions (existing MonumentTransition.jsx)
- Homepage Earth hero (scroll descent, postprocessing)

### ⬜ Built But Needs Wiring to Router
- 8 monument 3D scenes (need lazy-import into page components)
- WeatherSystem (wrap monument scenes)
- NPCSystem (add waypoint configs per monument)
- AudioProvider (wrap app in AudioProvider)
- MonumentRouter (wrap AnimatedRoutes)
- TransitionProvider (replace or augment existing transitions)
- LoadingEnvironment (replace current Suspense fallbacks)
- LevaDebugPanel (add to dev mode)

### ⬜ Needs Real Assets
- Replace 8 placeholder audio files with real ambient loops
- Convert Earth 8K textures to KTX2 for faster loading
- Add real UI sound effects (whoosh, pop, arrive)

---

## Phase 4: Cinematic Homepage Experience (April 2–3, 2026)

### Earth-to-Video Scroll Journey
**What changed:** Rebuilt the homepage as a scroll-driven cinematic experience.
**Files created:**
- `frontend/src/features/home/components/CinematicEarth.jsx` — Custom GLSL Earth with day/night terminator, city lights, Fresnel atmosphere, twinkling stars, moon
- `frontend/src/features/home/components/CinematicCamera.jsx` — CatmullRom spline camera with phase detection
- `frontend/src/features/home/components/CinematicScene.jsx` — Orchestrator with Earth→video cross-fade
- `frontend/src/features/home/components/CinematicPostProcessing.jsx` — Phase-aware bloom + vignette
- `frontend/src/features/home/components/CinematicOverlay.jsx` — Phase-aware DOM overlay (title, scroll hint, stats)
- `frontend/src/features/home/components/CinematicLoadingScreen.jsx` — Premium loading wireframe globe
- `frontend/src/features/home/components/MonumentGround.jsx` — Scroll-synced video player (smooth lerp, 15fps seek throttle)
- `frontend/src/features/home/hooks/useHomepagePerf.js` — 3-tier GPU quality settings + mobile detection

**Final architecture:**
- Scroll 0–60%: Original EarthHero (3D Earth with spaceships, overlay, stats)
- Scroll 60–75%: White atmospheric flash crossfade
- Scroll 75–100%: Cinematic desert monument video (Cloudinary), scroll-synced with smooth interpolation
- Content sections below (features, how it works, CTA)

**Assets downloaded:**
- 3× 4K HDRIs from Poly Haven (goegap desert, goegap road, roofless ruins) — CC0
- 1× Cinematic desert monument video (Cloudinary, 6.5MB)

**Files modified:**
- `frontend/src/features/home/pages/HomePage.jsx` — Complete rewrite: video-first, no CinematicScene wrapper, single Canvas

---

## Phase 5: Arena, Teacher, Admin & Notifications Fixes (April 3, 2026)

### Arena — Random Questions + Penalty System
**What changed:** Students no longer browse/choose challenges. A random question loads automatically.
**Files modified:**
- `frontend/src/features/arena/pages/ArenaPage.jsx` — Complete rewrite:
  - Auto-loads random challenge on page load
  - Difficulty filter re-fetches random challenge of that difficulty
  - "Skip" button loads another random question
  - Shows correct answer + solution on wrong answers
  - Shows red "-X XP penalty" for wrong answers
  - Handles empty options gracefully
- `controllers/arenaController.js` — Penalty scoring:
  - 20pt question → -5 XP penalty
  - 50pt question → -10 XP penalty
  - 100pt question → -20 XP penalty
  - XP floored at 0 (can't go negative total)
  - Both `xp` and `weekly_xp` updated on correct AND incorrect

### Teacher — Regenerate Button
**What changed:** Teachers can regenerate AI questions without starting over.
**Files modified:**
- `frontend/src/features/teacher/pages/TeacherChallengesPage.jsx`:
  - Added "Regenerate" button in preview (reuses same topic/difficulty)
  - Fixed correct answer highlighting (`correct_index` field name)
  - Fixed explanation display (checks both `explanation` and `solution` fields)

### Admin — AI Question Generator
**What changed:** Admins can now generate questions with AI, same as teachers.
**Files modified:**
- `frontend/src/features/admin/pages/AdminChallengesPage.jsx`:
  - Added full AI Question Generator section (topic, difficulty, generate, preview)
  - Preview shows correct answer highlighted, explanation
  - Save to Bank / Regenerate / Discard buttons
  - Manual creation form still available below

### Comment System → Student-Teacher Doubt Notifications
**What changed:** When a student posts a doubt, all teachers get notified.
**Files modified:**
- `routes/commentRoutes.js`:
  - Imported `sendNotification` from notification controller
  - After student comment saved: queries all teachers/admins, sends notification with student name + first 80 chars of doubt
  - Notification links to `/arena`

### Friend Request Notifications
**What changed:** Friend requests now create real-time notifications.
**Files modified:**
- `controllers/messagingController.js`:
  - Imported `sendNotification`
  - `sendFriendRequest()`: sends notification to recipient — "New Friend Request" with requester name
  - `respondFriendRequest()`: on accept, sends notification to requester — "Friend Request Accepted" with link to acceptor's profile

### Notifications Page Overhaul
**What changed:** Notifications page now handles friend requests and fixes field mismatches.
**Files modified:**
- `frontend/src/features/student/pages/NotificationsPage.jsx`:
  - Fixed `is_read` vs `read` field mismatch (DB uses `is_read`)
  - Fixed `body` vs `message` field (DB uses `body`)
  - Added link navigation — clicking notification with `link` marks read + navigates
  - Shows "Click to view →" on actionable notifications
  - Added **Pending Friend Requests** section at top with Accept/Decline buttons
  - Accept: marks notification read, redirects to friend's profile (`/student/:userId`)
  - Decline: removes request, keeps notification as history
  - Read notifications stay visible (dimmed) as history

---

## Phase 6: Codebase Cleanup (April 4, 2026)

### Orphaned File Removal
**What changed:** Removed ~110MB of unused files from failed 3D experiments.
**Files deleted (33 total):**

| Category | Files Deleted |
|----------|--------------|
| Cinematic components | CinematicEarth.jsx, CinematicCamera.jsx, CinematicPostProcessing.jsx, CinematicOverlay.jsx, CinematicLoadingScreen.jsx, CinematicScene.jsx, OrbitCamera.jsx, useHomepagePerf.js |
| Earth Hero | EarthHero.jsx (home/components), EarthLoadingScreen.jsx, EarthHero.jsx (experience/) |
| Monument scenes | DesertObservatory, GreatPyramidTheorem, GlacialCitadel, JungleRuins, NeonSpireCity, AbyssalLibrary, SkyArchipelago, MagmaForge |
| HDRI maps (77MB) | goegap_4k.hdr, goegap_road_4k.hdr, roofless_ruins_4k.hdr, kloppenheim_06_1k.hdr, industrial_sunset_1k.hdr, moonlit_golf_1k.hdr |
| Terrain textures | Ice002_1K-JPG/, Rock023_1K-JPG/, Snow004/, Sand_Ground037/ (each with Color/Normal/Roughness) |
| Broken textures | earth_normal.jpg (TIFF), earth_specular.jpg (TIFF) |
| Stale docs | MONUMENT_CHECKLIST.md, SETUP.md, PROJECT_REFERENCE.md |
| Test file | __TEST_EXAMPLE__.jsx |

**What was kept:**
- MonumentGround.jsx (video player — active homepage)
- useScrollProgress.js (used by MonumentGround)
- Earth textures (daymap, nightmap, clouds — for potential future use)
- Monument infrastructure (MonumentRouter, MonumentBackground, theme.css — provides CSS themes for all pages)
- desert_monument.mp4 video (6.5MB — the actual homepage experience)

### Documentation Updates
**Files updated:**
- `README.md` — Complete rewrite reflecting current React+Express architecture
- `PROGRESS.md` — Added Phases 4, 5, 6
- Project documentation updated with current architecture
- `VISUAL_THEME_SYSTEM.md` — Updated to reflect video homepage, removed references to deleted files
- `PROJECT_BRIEF.md` — Added Section 15 with all April 2–4 updates

### Build Status (post-cleanup)

```
✅ Build passes: 0 errors
⏱  Build time: 3.12 seconds (was 4.1s before cleanup)
📦 app.js: 2,322 KB (749 KB gzip)
📦 app.css: 91 KB (22 KB gzip)
📦 No more lazy-loaded 3D chunks (CinematicScene removed)
```

---

## Phase 7: Feature Flag & SaaS Subscription System (April 4, 2026)

### Feature Flag Architecture
**What changed:** Built a complete plan-based feature gating system for multi-tenant SaaS.
**Files created:**
- `frontend/src/config/features.js` — Master feature definitions (18 features, 7 categories, plan-to-feature mapping)
- `frontend/src/hooks/useFeatureFlag.js` — React hook for frontend feature gating with 60s cache
- `frontend/src/components/ui/UpgradePrompt.jsx` — Upgrade prompt (inline/fullpage/badge variants)
- `frontend/src/features/admin/pages/AdminFeaturesPage.jsx` — Org admin feature toggle dashboard

**Files modified:**
- `controllers/orgAdminController.js` — Added `getOrgFeatures` + `toggleOrgFeature`
- `routes/orgAdminRoutes.js` — Added `GET/PATCH /org-admin/features`
- `routes/eventRoutes.js` — Gated QR scan + event leaderboard behind feature flags
- `routes/certificateRoutes.js` — Gated certificate creation behind `certificates` flag
- `routes/teacherRoutes.js` — Gated AI generation behind `ai_tools` flag
- `routes/insightsRoutes.js` — Gated analytics behind `analytics` flag
- `routes/adminRoutes.js` — Gated data export behind `data_export` flag
- `frontend/src/lib/api/index.js` — Added `orgAdmin.features()` + `orgAdmin.toggleFeature()`
- `frontend/src/app/router.jsx` — Added `/admin/features` route
- `frontend/src/features/superadmin/pages/SAAccessPage.jsx` — Updated to use centralized feature definitions

### Feature Gating Summary
| Feature Flag | Gated Routes |
|-------------|-------------|
| `ai_tools` | Teacher AI generate + save |
| `certificates` | Certificate batch creation |
| `qr_checkin` | Event QR scan |
| `event_leaderboard` | Event score update + publish |
| `analytics` | Event health + admin insights |
| `data_export` | Admin ZIP export |

### Plan Tiers
- **Starter:** arena, leaderboard, events, notifications (4 features)
- **Professional:** + AI tools, certificates, quiz, projects, gallery, achievements, QR check-in, event leaderboards (12 features)
- **Enterprise:** + E2EE messaging, referrals, analytics, custom branding, data export, API access (18 features)

### Org Admin Flow
- Org admins see all features grouped by category
- Can toggle ON/OFF features within their plan
- Cannot enable features NOT in their plan (shows lock + upgrade link)
- Plan limits shown (max users, challenges, events)

### Bug Fixed
- `useFeatureFlag` hook was calling `orgAdmin.stats()` and reading wrong field paths — features always appeared enabled. Fixed to call `orgAdmin.features()` with correct response parsing.

---

## Phase 8: Architecture, Security, and Test-Coverage Pass (April 11-13, 2026)

This phase was a focused audit + remediation of the whole codebase. Commits `ad0ecd3` through `8851af7` on `main`.

### Modularization

| Before | After | Result |
|--------|-------|--------|
| `eventcontrollers.js` (1,007 lines) | `controllers/event/` with 8 sub-modules + barrel | Largest sub-module 239 lines |
| `adminController.js` (651 lines) | `controllers/admin/` with 8 sub-modules + 15-line barrel | Largest sub-module 154 lines |
| `certificateController.js` (622 lines) | `controllers/certificate/` with 5 sub-modules + 18-line barrel | Largest sub-module 323 lines (latex + xelatex pipeline) |
| `superAdminController.js` (569 lines) | `controllers/superAdmin/` with 5 sub-modules + 23-line barrel | Largest sub-module 211 lines |
| `paymentController.js` (421 lines) | `controllers/payment/` with 7 sub-modules + 11-line barrel | All under 200 lines |
| `ProfilePage.jsx` (1,068 lines) | `profile/` with 7 sub-components | Container 364 lines |
| `LiveQuizPage.jsx` (981 lines) | `liveQuiz/` with 6 phase screens | Container 332 lines |
| `TeacherQuizPage.jsx` (937 lines) | `teacherQuiz/` with 5 sub-components | Container 366 lines |
| `MonumentBackground.jsx` (672 lines) | `backgrounds/monument/` with 8 biome files + keyframes | Main file 53 lines |

Every split preserves the original imports via barrel re-exports — no route file, no consumer had to change.

### Security Fixes

- **`/api/bot/chat` requires auth.** Previously unauthenticated — abuse vector against the OpenRouter AI API. Added `requireAuth` + message count and payload size limits. Regression-tested in `tests/integration/api-smoke.test.js`.
- **Contact form XSS patched.** `controllers/contactController.js` now HTML-escapes every user-controlled string before interpolating into email HTML, and validates email format + length caps.
- **Hardcoded `localhost:3000` removed** from contact email template — uses `PUBLIC_URL` / `FRONTEND_URL` env var instead.
- **Socket.IO presence event trusts only session-verified `userId`.** Previously accepted a client-supplied id, allowing presence spoofing. `register_user` had already been fixed; `presence` now matches.
- **Payment webhook signature verification was broken** — it signed `JSON.stringify(req.body)` which is NOT byte-stable vs what Razorpay signed. Now preserves the raw request bytes via `express.json({ verify })` and verifies against those. Added timing-safe HMAC compare on both webhook and client-verify paths.
- **Payment webhook refuses to accept unsigned requests in production.** Previously it printed a console warning and silently accepted — a forgery vector if the secret env var was ever accidentally unset.
- **`getRazorpay()` async bug fixed** — was being called without `await` in `createOrder`, which would have surfaced as a runtime failure the first time a real order was attempted.
- **Payment idempotency** via shared `applyPlanUpgrade` helper — `verify` and `webhook` race paths now re-read the payment row and skip mutation if already paid.

### Auth + Routing Hardening

- `frontend/src/lib/roles.js`: new `ROLES`, `dashboardForRole`, `hasRole` helpers. Single source of truth.
- `frontend/src/components/auth/GuestOnlyRoute.jsx`: new guard — `/login` and `/register` now redirect authenticated users to their role-specific dashboard.
- `ProtectedRoute`: preserves the intended path in `location.state.from`, renders the 403 page in place (URL stays accurate) instead of a silent redirect to `/dashboard`.
- `LoginPage`: returns to `state.from` after login, uses `{replace: true}` so back button can't re-expose `/login`.
- `RegisterPage`: now navigates with `{replace: true}` after registration.
- `MainLayout.handleLogout`: awaits backend session destroy, then `navigate("/login", {replace: true})` — prevents back-button leaks.
- `frontend/src/lib/http.js`: axios 401 interceptor calls `handleSessionExpired()` on the auth store so protected routes redirect on the next render when the server session expires.
- `frontend/src/features/errors/NotFoundPage.jsx` + `ForbiddenPage.jsx`: new dedicated error pages (previous router just `Navigate`'d to `/`).

### Circular Import Fixed

- `services/realtime.js` introduced — `server.js` registers its `pushNotification` + `getActiveUsers` implementations; controllers and routes import from this service instead of reaching back into `server.js`. Breaks the old `server.js <-> notificationController.js` cycle, which made isolated controller imports fail.

### Navigation Fluency

- **Route-based code splitting.** All 34 page components in `router.jsx` converted to `React.lazy()`. Initial bundle no longer ships admin / teacher / super-admin code to guests. A `<Suspense>` fallback (orbit loader) shows while a chunk fetches.
- **Scroll management overhaul.** The previous `ScrollToTop` scrolled on every pathname change — including Back presses, which jumped the user to the top of any page they returned to. Replaced with a `ScrollManager` that relies on the browser's native scroll restoration for POP (back/forward) navigations.
- Production build restored to green (was failing with rolldown resolve errors). `vite build` now completes in ~3.2s and produces 137 chunks.

### Shared Utilities

- `frontend/src/hooks/useFetch.js`: `useFetch(fetcher, { immediate, deps })` + `useAsync(action)` replace the 15+ duplicated `setLoading/try/catch/finally/setError/setData` patterns across components. Cancels stale responses on unmount / refetch.
- `frontend/src/lib/animations.js`: shared `fadeUp`, `fadeUpHero`, `scaleIn`, `slideInLeft` variants. Previously redefined inline in 11+ components.
- `frontend/src/config/design-tokens.js`: centralized constants (animation timings, z-index layers, component sizes, early-bird threshold, winner XP multipliers).
- `frontend/src/lib/roles.js`: role utilities (described above).

### Test Suite Expansion

Started at 88 tests, mostly static code analysis (`fs.readFileSync` + string matching, no actual HTTP). Finished at **136 tests across three layers**:

- **Unit (110):** existing + new `tests/unit/roles.test.js` (15 tests), `tests/unit/auth-guard.test.jsx` (10 tests, jsdom + React Testing Library).
- **Integration (26):** new `tests/integration/api-smoke.test.js` (12 tests, real HTTP via supertest) + `tests/integration/payment.test.js` (14 tests — create-order validation, signature rejection, verify idempotency, webhook happy path + replay + failed event).
- Mocks: Supabase via in-memory store, Razorpay client, nodemailer — all via `vi.mock()` so no external service is touched.
- Added `supertest` and `@testing-library/dom` as dev dependencies.

### Lint + Theme Cleanup

- Fixed every ESLint issue (159 at start, now 0): `catch(err)` with unused `err` -> bare `catch`, removed dead imports, added explanatory comments to 4 intentional empty-catch blocks in the cert LaTeX pipeline, fixed scoping bug in `routes/quizRoutes.js` (`rest` was `no-undef`), declared service-worker globals in `frontend/public/sw.js`, properly ignored `frontend/dist/`.
- 123 hardcoded hex colors across 17 JSX files replaced with `var(--color-*)` / `var(--monument-*)` references. Canvas/WebGL code (where CSS vars aren't readable) intentionally left alone.

### Documentation

- `docs/PAYMENT_SETUP.md`: end-to-end guide covering env vars, webhook dashboard configuration, flow diagram, and the 503 fallback when keys aren't set.
- `README.md`, `PRODUCTION_CHECKLIST.md`, `PROJECT_CONFIG.md`, `VISUAL_THEME_SYSTEM.md` updated to reflect the new architecture.

### What's Still Open

- No TypeScript (single biggest architectural gap — would catch an entire class of bugs the test suite can't).
- `ProfilePage.js` chunk is 470 kB gzipped — needs deferred tsparticles / emoji-picker loading.
- Frontend component test coverage is still thin (10 of 97 components).
- `messagingController.js` (537 lines) flagged as acceptable single-purpose but could be split for consistency.

### Verified End-to-End (April 13, 2026)

- `npm run lint` — 0 errors, 0 warnings across 248 files.
- `npm test` — 136/136 passing in 2.55s.
- `npm run build` — production build succeeds in 3.20s, 137 chunks.
- `npm start` — backend boots clean, all endpoints return expected status (200/401/400/404).
- `npm run dev:frontend` — Vite ready in 464ms, serves modules cleanly.
- SPA deep links work through the backend (`/dashboard`, `/admin`, `/super-admin` all 200 -> index.html).
