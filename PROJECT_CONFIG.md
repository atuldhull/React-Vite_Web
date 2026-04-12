# Math Collective — Project Configuration

> Last updated: April 13, 2026

## Project Type
Multi-tenant competitive mathematics platform (React + Express + Supabase).

## Quick Commands
- **Dev server:** `npm run dev:frontend` (frontend on :5173)
- **Backend:** `npm start` — runs `node backend/server.js` (API on :3000)
- **Build:** `npm run build` (Vite outputs to `public/app/`; backend serves from there)
- **Both:** Run backend + frontend in separate terminals

## Architecture
- `frontend/` — React 19 + Vite 8 SPA (root for Vite)
- `backend/` — **all Node.js server code** lives here (moved out of project root April 13, 2026)
- `backend/server.js` — Express 5 API + Socket.io entry point
- `backend/services/realtime.js` — Decouples Socket.IO publishing from controllers (break for the old server.js <-> notificationController circular import)
- `backend/{routes,controllers,middleware,config,migrations}/` — Backend
- `backend/controllers/{event,admin,certificate,payment,superAdmin}/` — Per-domain sub-modules; each parent `*Controller.js` is a one-line barrel re-exporting them (keeps route imports stable)
- `frontend/src/features/` — Feature-based page components
- `frontend/src/features/errors/` — 404 + 403 pages
- `frontend/src/components/` — Shared components (ui/, backgrounds/, panda/, monument/, chat/, auth/)
- `frontend/src/components/auth/` — `ProtectedRoute`, `GuestOnlyRoute`
- `frontend/src/components/backgrounds/monument/` — 8 biome scenes + shared keyframes (extracted from the old 672-line `MonumentBackground.jsx`)
- `tests/unit/` + `tests/integration/` — Vitest (plus supertest + jsdom for jsx tests)
- `docs/PAYMENT_SETUP.md` — Razorpay setup guide

## Key Conventions
- **Vite base:** `/app/` — all static assets resolve under `/app/`
- **Static files (dev):** `frontend/public/` (Vite publicDir)
- **Static files (prod):** `public/app/` (build output)
- **Videos:** `frontend/public/videos/desert_monument.mp4` (homepage cinematic)
- **Imports:** Use `@/` alias (maps to `frontend/src/`)
- **Styling:** Tailwind CSS + CSS custom properties in `frontend/src/styles/theme.css`. No hardcoded hex colors in JSX `style` props — use `var(--page-accent)` etc.
- **State:** Zustand stores in `frontend/src/store/`
- **API client:** `frontend/src/lib/api/index.js` (Axios). HTTP 401 is auto-handled by an interceptor in `lib/http.js`.
- **Animations:** Framer Motion for UI, GSAP for scroll. Shared variants live in `frontend/src/lib/animations.js` (fadeUp, fadeUpHero, scaleIn, slideInLeft).
- **Async patterns:** `useFetch(fetcher, { immediate, deps })` and `useAsync(action)` in `frontend/src/hooks/useFetch.js` replace the old setLoading/try/catch/finally/setError boilerplate.
- **Role helper:** `frontend/src/lib/roles.js` — `ROLES` constant, `dashboardForRole(role)`, `hasRole(user, allowed)`. Single source of truth for post-login redirects.
- **Code splitting:** Every page in `router.jsx` is loaded via `React.lazy()`. A `<Suspense>` fallback (orbit loader) shows while the chunk fetches.

## Monument Theme System
Every page uses `useMonument('name')` + `<MonumentBackground monument="name" />`.
8 monuments: desert, pyramid, glacier, jungle, city, abyss, sky, magma.
CSS variables `--page-accent`, `--page-glow`, `--org-primary`, `--org-secondary` auto-set.

## Roles
student < teacher < admin < super_admin (each inherits lower permissions)

## Homepage Architecture
Scroll-synced cinematic video approach:
- `MonumentGround.jsx` — `<video>` element with smooth scroll-to-time sync
- `desert_monument.mp4` — Cinematic video of space → desert monument
- Title overlay, scroll hint, stats bar fade based on scroll progress

## Arena System
- Random question auto-loads (no browsing/choosing)
- Difficulty filter re-fetches random challenge of that difficulty
- Penalty scoring: -5 XP (20pt), -10 XP (50pt), -20 XP (100pt) for wrong answers
- XP floored at 0

## Notification System
- Real-time via Socket.IO
- Friend request / accept notifications
- Student doubt → teacher alerts
- Event notifications

## SQL Migrations (Supabase) — run in order
All in `migrations/` folder:
1. `01_base_tables.sql` — students, challenges, arena_attempts, events
2. `02_extended_columns.sql` — weekly_xp, weekly_winners
3. `03_events_site_settings.sql` — event columns + site_settings table
4. `04_notifications_certificates.sql` — notifications + certificates tables
5. `05_profile_avatar.sql` — avatar/bio columns
6. `06_features_orgs_plans.sql` — feature flags, orgs, plans
7. `07_payment_subscriptions.sql` — payment/subscription tables
8. `08_messaging_friendships.sql` — chat/messaging/friendships tables
9. `09_referral_system.sql` — referral system tables
10. `10_events_upgrade.sql` — event registrations, attendance, leaderboard, achievements
11. `11_notification_types.sql` — expanded notification types
12. `12_qr_checkin.sql` — QR token column for event check-in

## Don't Change (unless asked)
- Existing API endpoint signatures
- Supabase table schemas that already have data
- Zustand store shape
- Socket.io event names
- Route paths in router.jsx

## Fonts
- Space Grotesk — headings (h1-h4)
- JetBrains Mono — numbers, math symbols, XP (class: `math-text`)
- Outfit — body text

## Feature Flag System
- Feature definitions: `frontend/src/config/features.js` (18 features, 7 categories)
- Frontend hook: `frontend/src/hooks/useFeatureFlag.js` (check if feature enabled)
- Upgrade prompt: `frontend/src/components/ui/UpgradePrompt.jsx` (shown when locked)
- Org admin page: `/admin/features` — toggle features within plan
- Super admin page: `/super-admin/access` — override any feature per org
- Backend middleware: `checkFeatureFlag("feature_key")` gates routes by plan
- Gated routes: AI tools, certificates, QR check-in, event leaderboards, analytics, data export

## Key Files
- `PROGRESS.md` — Full development changelog (Phases 1-8)
- `PROJECT_BRIEF.md` — Complete project documentation
- `VISUAL_THEME_SYSTEM.md` — Monument CSS theme system documentation
- `docs/PAYMENT_SETUP.md` — Razorpay env vars + webhook setup
- `frontend/src/config/features.js` — Master feature definitions
- `frontend/src/config/design-tokens.js` — Animation timings, z-index layers, component sizes, event constants (early-bird threshold, winner XP multipliers)
- `frontend/src/lib/roles.js` — Role constants + dashboardForRole + hasRole
- `frontend/src/lib/animations.js` — Shared framer-motion variants
