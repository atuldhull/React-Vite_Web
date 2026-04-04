# Math Collective — Project Configuration

> Last updated: April 4, 2026

## Project Type
Multi-tenant competitive mathematics platform (React + Express + Supabase).

## Quick Commands
- **Dev server:** `npx vite --host` (frontend on :5173 or :5174)
- **Backend:** `node server.js` (API on :3000)
- **Build:** `npx vite build` (outputs to public/app/)
- **Both:** Run backend + frontend in separate terminals

## Architecture
- `frontend/` — React 19 + Vite 8 SPA (root for Vite)
- `server.js` — Express 5 API + Socket.io
- `routes/` + `controllers/` + `middleware/` — Backend
- `frontend/src/features/` — Feature-based page components
- `frontend/src/components/` — Shared components (ui/, backgrounds/, panda/, monument/, chat/)

## Key Conventions
- **Vite base:** `/app/` — all static assets resolve under `/app/`
- **Static files (dev):** `frontend/public/` (Vite publicDir)
- **Static files (prod):** `public/app/` (build output)
- **Videos:** `frontend/public/videos/desert_monument.mp4` (homepage cinematic)
- **Imports:** Use `@/` alias (maps to `frontend/src/`)
- **Styling:** Tailwind CSS + CSS custom properties in `frontend/src/styles/theme.css`
- **State:** Zustand stores in `frontend/src/store/`
- **API client:** `frontend/src/lib/api/index.js` (Axios)
- **Animations:** Framer Motion for UI, GSAP for scroll

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
- `PROGRESS.md` — Full development changelog (Phases 1–7)
- `PROJECT_BRIEF.md` — Complete project documentation
- `VISUAL_THEME_SYSTEM.md` — Monument CSS theme system documentation
- `frontend/src/config/features.js` — Master feature definitions
