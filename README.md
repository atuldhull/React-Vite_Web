# Math Collective

**A multi-tenant competitive mathematics platform for university students.**

Built with React 19 + Vite 8 (frontend), Express 5 + Supabase (backend), Three.js (3D), Socket.IO (real-time). Features AI-powered challenges, live quizzes, XP gamification, E2EE messaging, and a cinematic 3D homepage.

> Last updated: April 13, 2026 (backend reorganised into `backend/`)  
> Status: 136/136 tests passing · 0 ESLint issues · production build 3.2s

---

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your keys (see below)

# Run backend (port 3000)
npm start                 # or: node backend/server.js

# Run frontend (port 5173)
npm run dev:frontend      # or: npx vite --host
```

Open [http://localhost:5173/app/](http://localhost:5173/app/)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, Tailwind CSS 3.4, Zustand 5, React Router v7 |
| 3D | Three.js 0.183, @react-three/fiber 9, @react-three/drei 10 |
| Animation | Framer Motion 12, GSAP 3.14 |
| Backend | Express 5, Socket.IO 4.7 |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth (email/password) |
| AI | OpenRouter API (DeepSeek model) |
| Payments | Razorpay |
| Messaging | E2EE (ECDH + AES-GCM) |
| Fonts | Space Grotesk, JetBrains Mono, Outfit |

---

## Project Structure

```
Atul_Web/
├── backend/                       # All server-side code
│   ├── server.js                  # Express 5 entry + Socket.IO
│   ├── config/                    # Supabase, OpenRouter clients
│   ├── services/
│   │   └── realtime.js            # Decouples server.js from controllers
│   │                              # (breaks the old circular import)
│   ├── controllers/
│   │   ├── adminController.js     # barrel -> admin/*.js (8 modules)
│   │   ├── certificateController.js # barrel -> certificate/*.js (5 modules)
│   │   ├── paymentController.js   # barrel -> payment/*.js (7 modules)
│   │   ├── superAdminController.js # barrel -> superAdmin/*.js (5 modules)
│   │   ├── event/                 # eventCrud, registration, attendance,
│   │   │                          #   leaderboard, achievement, siteSettings
│   │   ├── admin/                 # aiQuestions, users, events, stats, xp,
│   │   │                          #   teamsProjects, scheduledTests, dataExport
│   │   ├── certificate/           # assets, latex, batch, download, helpers
│   │   ├── payment/               # config, orders, verification, webhook,
│   │   │                          #   upgrade, billing, invoiceEmail
│   │   ├── superAdmin/            # analytics, organisations, plans,
│   │   │                          #   impersonation, auditLogs
│   │   ├── arenaController.js     # Challenge submission + penalty scoring
│   │   ├── authController.js      # Register, login, logout
│   │   ├── messagingController.js # E2EE chat + friendships
│   │   ├── notificationController.js # Real-time notifications
│   │   └── ...                    # challenge, contact, gallery, insights,
│   │                              #   referral, teacher, user, orgAdmin, ai
│   ├── middleware/                # Auth guards + rate limiters + tenant
│   ├── routes/                    # Express route files (one per domain)
│   └── migrations/                # Numbered SQL migrations
│
├── frontend/                      # React 19 + Vite 8 SPA
│   ├── src/
│   │   ├── app/                   # App.jsx, router.jsx (lazy-loaded routes)
│   │   ├── features/
│   │   │   ├── errors/            # 404 + 403 pages
│   │   │   ├── home/              # Homepage (scroll-synced video)
│   │   │   ├── arena/             # Challenge arena
│   │   │   ├── events/            # Event browser + scanner
│   │   │   ├── student/
│   │   │   │   ├── pages/
│   │   │   │   │   ├── profile/   # 7 sub-components (1068 -> 364 lines)
│   │   │   │   │   └── liveQuiz/  # 6 phase screens (981 -> 332 lines)
│   │   │   ├── teacher/
│   │   │   │   └── pages/teacherQuiz/  # 5 sub-components (937 -> 366)
│   │   │   ├── admin/
│   │   │   └── superadmin/
│   │   ├── components/
│   │   │   ├── auth/              # ProtectedRoute, GuestOnlyRoute
│   │   │   ├── backgrounds/
│   │   │   │   └── monument/      # 8 biome scenes (MonumentBackground
│   │   │   │                      #   was 672 lines, now 53 + sub-files)
│   │   │   └── ui/
│   │   ├── hooks/
│   │   │   ├── useFetch.js        # shared loading/error/data pattern
│   │   │   └── useMonument.js
│   │   ├── lib/
│   │   │   ├── animations.js      # shared framer-motion variants
│   │   │   ├── roles.js           # dashboardForRole, hasRole
│   │   │   └── http.js            # axios + 401 interceptor
│   │   └── styles/
│   └── public/
│
├── tests/
│   ├── unit/                      # roles, auth-guard (jsdom), arena-scoring,
│   │                              #   event-status, feature-flags, security
│   └── integration/               # api-smoke (supertest), payment (supertest),
│                                  #   auth-flow (static analysis)
│
├── public/                        # SPA build output (served by backend)
│   └── app/                       # Vite build target
│
├── docs/
│   ├── PAYMENT_SETUP.md           # Razorpay env vars + webhook setup guide
│   └── ...SQL
├── package.json                   # Single root (no monorepo); scripts point
│                                  # at backend/server.js and vite for frontend
├── PROJECT_CONFIG.md
├── PROJECT_BRIEF.md
├── PROGRESS.md
└── VISUAL_THEME_SYSTEM.md
```

### Layout at a glance

- **`backend/`** — everything Node.js: server, routes, controllers, middleware, services, config, SQL migrations. No UI code here.
- **`frontend/`** — everything React/Vite: components, pages, hooks, stores, styles, static assets. No Express code here.
- **`tests/`** — cross-cutting. Unit tests for pure logic (roles, scoring, status), jsdom-based component tests, and supertest-based API integration tests that import from `backend/`.
- **`public/app/`** — Vite build output consumed by the Express static middleware in production. Safe to delete — `npm run build` regenerates it.
- Root holds only shared configs (`vite.config.js`, `vitest.config.js`, `eslint.config.js`, `tailwind.config.cjs`, `postcss.config.cjs`), the `.env*` files, and documentation.

---

## Key Features

### For Students
- **Challenge Arena** — Random questions with XP rewards and penalties
- **Live Quizzes** — Real-time Socket.IO quiz sessions
- **Dashboard** — XP tracking, streaks, weekly rankings
- **Leaderboards** — Weekly and all-time rankings
- **E2EE Messaging** — End-to-end encrypted friend chat
- **Friend System** — Request/accept with real-time notifications
- **Certificates** — Downloadable PDF certificates
- **Projects** — Team collaboration with voting
- **PANDA Bot** — AI math tutor in every challenge

### For Teachers
- **AI Question Generator** — DeepSeek-powered MCQ generation with preview/regenerate/save
- **Challenge Manager** — Activate/deactivate questions
- **Quiz Hosting** — Create live quiz sessions
- **Student Doubt Notifications** — Get notified when students ask questions

### For Admins
- **User Management** — Create, delete, change roles
- **AI Question Generator** — Same as teacher, with bulk operations
- **Data Operations** — Clear attempts, reset XP, weekly reset
- **Event Management** — Create/edit events, view registrations, attendance tracking, CSV export
- **Event Health Metrics** — Fill rate, attendance rate, cancel rate, check-in method breakdown
- **Platform Insights** — Active users, registration trends, top events, achievement stats
- **Feature Management** — Toggle platform features ON/OFF within subscription plan
- **Data Export** — Download all platform data as ZIP with 11 CSV files
- **Site Settings** — Registration gate, org branding

### For Super Admins
- **Organisation Management** — Create, suspend, activate, delete orgs
- **Subscription Plans** — Starter / Professional / Enterprise with feature-based gating
- **Feature Flags** — Per-org feature overrides (enable/disable any feature for any org)
- **Impersonation** — Log into any org as admin for debugging
- **Audit Logs** — Track all admin actions across platform
- **Payment History** — Razorpay payment records

### Homepage
- **Scroll-synced video** — Cinematic desert monument journey, controlled by scroll
- **Title overlay** — "Math Collective" with stats bar and scroll indicator

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key (for AI) |
| `SESSION_SECRET` | Yes | Random 32+ char string |
| `CONTACT_EMAIL` | Yes | Gmail account used to send contact + invoice emails |
| `CONTACT_APP_PASSWORD` | Yes | Gmail app password for `CONTACT_EMAIL` |
| `RAZORPAY_KEY_ID` | For payments | Razorpay public key id (safe to expose to frontend) |
| `RAZORPAY_KEY_SECRET` | For payments | Razorpay API secret (server-only) |
| `RAZORPAY_WEBHOOK_SECRET` | For payments | HMAC key for webhook — **required in production** |
| `PUBLIC_URL` | No | Base URL used in invoice emails (falls back to relative URLs) |
| `FRONTEND_URL` | Prod | CORS allow-list when `NODE_ENV=production` |
| `PORT` | No | Server port (default: 3000) |

See [docs/PAYMENT_SETUP.md](docs/PAYMENT_SETUP.md) for the full Razorpay setup walkthrough.

---

## User Roles

```
super_admin > admin > teacher > student
```

Each higher role inherits all lower role permissions.

---

## Arena Scoring

| Difficulty | Points (correct) | Penalty (wrong) |
|-----------|-------------------|-----------------|
| Easy | +20 XP | -5 XP |
| Medium | +50 XP | -10 XP |
| Hard | +100 XP | -20 XP |
| Extreme | +100 XP | -20 XP |

XP is floored at 0 (can never go negative total).

---

## Subscription Plans & Feature Flags

| Feature | Starter | Professional | Enterprise |
|---------|---------|-------------|-----------|
| Arena + Leaderboard | Yes | Yes | Yes |
| Events + Notifications | Yes | Yes | Yes |
| AI Question Generator | - | Yes | Yes |
| Certificates | - | Yes | Yes |
| Live Quiz | - | Yes | Yes |
| Team Projects | - | Yes | Yes |
| Achievements | - | Yes | Yes |
| QR Check-in | - | Yes | Yes |
| E2EE Messaging | - | - | Yes |
| Referral System | - | - | Yes |
| Advanced Analytics | - | - | Yes |
| Custom Branding | - | - | Yes |
| Data Export | - | - | Yes |
| API Access | - | - | Yes |

Super admins can override any feature per org. Org admins can toggle features within their plan.

---

## Monument Theme System

Every page uses `useMonument('name')` + `<MonumentBackground monument="name" />`.
8 themed biomes: desert, pyramid, glacier, jungle, city, abyss, sky, magma.
CSS variables auto-set: `--page-accent`, `--page-glow`, `--org-primary`, `--org-secondary`.

---

## SQL Migrations

All in `migrations/` folder — run in Supabase SQL editor in numbered order (01 through 12).

---

## Scripts

```bash
npm start              # Production server (node server.js)
npm run dev            # Dev server with auto-reload (nodemon)
npm run dev:frontend   # Vite dev server (port 5173)
npm run build          # Production frontend build -> public/app/
npm run lint           # ESLint check (0 errors, 0 warnings on main)
npm run lint:fix       # ESLint auto-fix
npm run format         # Prettier format all files
npm run format:check   # Prettier check (CI)
npm test               # Vitest run — 136 tests
npm run test:watch     # Vitest watch mode
```

## Testing

136 tests across 10 files (2.5s total):

| Layer | Files | Count | Coverage |
|-------|-------|-------|----------|
| Unit | `tests/unit/` | 110 | Pure logic: arena scoring, event status, feature flags, role helpers, security config, route guards |
| Integration | `tests/integration/` | 26 | Real HTTP via `supertest`: auth flow, bot auth, payment (create/verify/webhook), 404 handling |
| Component | `tests/unit/auth-guard.test.jsx` | 10 | React + jsdom: ProtectedRoute, GuestOnlyRoute across every role/state |

Run a single file: `npx vitest run tests/integration/payment.test.js`

---

## CI/CD

- **GitHub Actions** runs on every push/PR to `main`: lint + build
- **Dependabot** checks npm dependencies weekly for security updates
- Config: `.github/workflows/ci.yml`, `.github/dependabot.yml`

---

## Deployment

### Render (Recommended — Free Tier)

**Backend:**
1. Create new Web Service → connect GitHub repo
2. Build command: `npm install --legacy-peer-deps`
3. Start command: `node server.js`
4. Add environment variables (SUPABASE_URL, keys, etc.)

**Frontend:**
1. Create new Static Site → connect same repo
2. Build command: `npm run build`
3. Publish directory: `public/app`
4. Add rewrite rule: `/*` → `/index.html` (SPA routing)

### Railway / Fly.io
1. Connect GitHub repo
2. Set build + start commands same as above
3. Add env vars in dashboard

### Manual VPS
```bash
git clone https://github.com/atuldhull/React-Vite_Web.git
cd React-Vite_Web
npm install --legacy-peer-deps
cp .env.example .env.local   # Fill in your keys
npm run build                 # Build frontend
npm start                     # Start backend (serves frontend from public/app/)
```

---

## Architecture

```
Client (React SPA)
  │ HTTP + WebSocket
  ▼
Express 5 Server (:3000)
  ├── REST API (/api/*)
  ├── Socket.IO (quiz, chat, notifications)
  ├── Session middleware (express-session)
  ├── Tenant middleware (auto org_id injection)
  ├── Auth middleware (role-based: student/teacher/admin/super_admin)
  └── Feature flag middleware (plan-based gating)
        │
        ▼
  Supabase PostgreSQL
  ├── 15+ tables (students, challenges, events, etc.)
  ├── Service role key (server-side only)
  └── Auth (email/password)
```

---

## Development Log

See [PROGRESS.md](PROGRESS.md) for the complete changelog (Phases 1–7).

---

## Code Quality

- **ESLint** — `eslint.config.js` (flat config, React + hooks plugins). 0 errors, 0 warnings.
- **Prettier** — `.prettierrc` (120 chars, double quotes, trailing commas)
- **No TypeScript** — JS-only. TS migration is still the single largest architectural gap.
- **Vitest** — 136 tests across unit, integration (supertest), and component (jsdom) layers.

### Architectural Highlights

- **Barrel-split controllers** — every previously-God controller (event, admin, certificate, payment, superAdmin) is now one-line barrel files re-exporting from per-domain sub-modules. Largest remaining: `messagingController.js` at 537 lines.
- **Route-based code splitting** — 34 page components load via `React.lazy()` with a Suspense fallback. Initial bundle no longer ships admin/teacher code to guests.
- **Auth hardening** — HTTP 401 interceptor + `ProtectedRoute` + `GuestOnlyRoute` + `dashboardForRole` helper. 403 / 404 pages render in place so the URL stays accurate.
- **Payment security** — webhook signature verified against raw request bytes (not re-serialized JSON), timing-safe HMAC compare, refuses to boot unsigned webhooks in production. Idempotent via shared `applyPlanUpgrade` helper. See `docs/PAYMENT_SETUP.md`.
- **Decoupled realtime** — `services/realtime.js` breaks the old circular import between `server.js` and the notification controller. Controllers no longer reach back into `server.js` for `pushNotification`.

---

## License

MIT © 2026 Math Collective, BMSIT
