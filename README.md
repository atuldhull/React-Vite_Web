# Math Collective

**A multi-tenant competitive mathematics platform for university students.**

React 19 + Vite 7 frontend, Express 5 + Supabase backend, Three.js for the 3D homepage,
Socket.IO for live quiz + real-time chat. AI-assisted challenges via OpenRouter, XP
gamification, end-to-end encrypted messaging, rich profile pages, and a monument-themed
visual system.

> **Status:** 571 tests passing · 0 ESLint issues · production build < 15s

---

## Quick Start

```bash
# 1. Install dependencies (legacy-peer-deps needed for the Three.js + zustand overrides)
npm install --legacy-peer-deps

# 2. Configure environment — copy the template and fill in real values
cp .env.example .env.local

# 3. Run both servers — backend on :3000, Vite dev server on :5173
npm run dev

# Individually, if you prefer two terminals:
npm run dev:server     # nodemon backend/server.js
npm run dev:frontend   # vite on :5173 with /api + /socket.io proxied

# Production build + serve
npm run build          # builds frontend -> public/app/
npm start              # node backend/server.js serves API + built SPA
```

Open **http://localhost:5173/app/** in dev, or **http://localhost:3000/** for the built
SPA served by Express.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS 3.4, Zustand 5, React Router v7 |
| 3D | Three.js 0.183, @react-three/fiber 9, @react-three/drei 10 |
| Animation | Framer Motion 12, GSAP 3.14 |
| Backend | Express 5, Socket.IO 4.7 |
| Database | Supabase PostgreSQL (multi-tenant with RLS) |
| Auth | Supabase Auth (email/password) + express-session |
| AI | OpenRouter API (DeepSeek model) — question generation + tutor bot |
| Payments | Razorpay (subscriptions) + manual UPI/QR (paid events) |
| Messaging | E2EE (ECDH-P256 + AES-GCM, keys derived from a 12-word recovery phrase) |
| Identity | Deterministic keypair + visual math sigils from a custom 2048-word wordlist |
| Social | Rich profile pages with hovercards, FriendButton state machine, privacy tiers |
| Monitoring | UptimeRobot (liveness) + Sentry (errors — optional, feature-gated) |
| Fonts | Space Grotesk, JetBrains Mono, Outfit |

---

## Features

### For Students
- **Challenge Arena** — randomised questions with XP rewards/penalties and streak tracking.
- **Live Quizzes** — Socket.IO-backed real-time quiz sessions with host controls.
- **Leaderboards** — weekly, all-time, and per-event rankings.
- **Rich Profile Pages** — own + peer profiles at `/profile/:userId` with Overview,
  Achievements, Friends, and Activity tabs. Respects per-user privacy settings.
- **Identity Ceremony** — first-time E2EE setup forges a unique math sigil from a
  12-word recovery phrase. Same phrase → same identity across devices.
- **E2EE Messaging** — end-to-end encrypted chat with deterministic keys, restore flow,
  and WhatsApp-style durability across browser / device switches.
- **Friend System** — request / accept / cancel / unfriend with optimistic UI, mutual-
  friends discovery, and hovercards everywhere a name appears.
- **Certificates** — downloadable PDFs for attended events and achievements.
- **Projects** — team collaboration with voting.
- **PANDA Bot** — AI math tutor embedded in every challenge.

### For Teachers / Admins
- **AI Question Generator** — DeepSeek-powered MCQ generation with preview / regenerate
  / save. Bulk generation for admins.
- **Event Management** — create, edit, toggle registration, view registrations +
  attendance, CSV export, event-health metrics.
- **Paid Events** — manual UPI/QR reconciliation: teacher uploads a QR or types a VPA,
  students submit payment reference, admin verifies against their bank app. Supports
  mark-paid, reject (with reason), re-submit.
- **Data Operations** — clear attempts, reset XP, delete teams/tests, weekly reset.
- **Platform Insights** — active users, registration trends, top events, achievement
  stats, and per-event health.
- **Feature Management** — toggle platform features on/off within a subscription plan.

### For Super Admins
- **Organisation Management** — create, suspend, activate, delete orgs.
- **Subscription Plans** — Starter / Professional / Enterprise with feature-based gating.
- **Per-Org Feature Flags** — override any feature for any org from a central UI.
- **Impersonation** — log in as any org's admin for support debugging.
- **Audit Logs** — durable record of every admin action across the platform.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase service role key (server-only) |
| `SESSION_SECRET` | yes | Random 32+ char string — used for express-session signing |
| `FRONTEND_URL` | prod | CORS allow-list origin in production |
| `SESSION_DB_URL` or `REDIS_URL` | prod | Postgres or Redis backing store for sessions |
| `OPENROUTER_API_KEY` | feature | Enables AI question generation + PANDA tutor |
| `CONTACT_EMAIL` / `CONTACT_APP_PASSWORD` | feature | Gmail + app password for contact form + invoice emails |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | feature | Razorpay (for org subscriptions) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_CONTACT` | feature | Web push notifications. Generate with `node backend/scripts/generateVapidKeys.js` |
| `SENTRY_DSN` | feature | Sentry error reporting (any free-tier DSN works) |
| `PORT` | no | Server port (default 3000) |

Missing a feature-gated var? Feature silently disables at boot with a warning log. Missing
a required var in production → process exits immediately with a clear error (see
`backend/config/env.js`).

---

## User Roles

```
super_admin > admin > teacher > student
```

Higher roles inherit every lower-role permission. Protection is enforced at three layers:
`ProtectedRoute` in the router, role-specific Express middleware on each `/api/*` route,
and database-level Row Level Security policies on every tenant table.

---

## Architecture

```
Client (React 19 SPA, Vite 7)
  │ HTTPS + WebSocket
  ▼
Express 5 server (:3000)
  ├── REST API (/api/*)
  ├── Socket.IO (quiz engine, chat relays, notifications, presence)
  ├── express-session with Postgres-backed store in production
  ├── Tenant middleware — auto-injects org_id into every Supabase query
  ├── Auth middleware — role-based route guards
  ├── CSRF middleware — double-submit cookie pattern (csrf-csrf)
  ├── Zod validation on every mutating request body
  ├── Pino structured logging with request-ID tagging (AsyncLocalStorage)
  └── Global error handler → pino + optional Sentry capture
        │
        ▼
  Supabase PostgreSQL
  ├── 20+ tables (students, orgs, challenges, events, messages, …)
  ├── Row Level Security: default-deny on every tenant table
  └── Service-role key for backend writes (service-role bypasses RLS by design)
```

---

## Scripts

```bash
npm start              # Production server — node backend/server.js
npm run dev            # concurrently — backend (nodemon) + frontend (vite)
npm run build          # Production frontend build → public/app/
npm run lint           # ESLint check
npm run typecheck      # TypeScript check (JSDoc + checkJs — no compile)
npm test               # Vitest run — 571 tests
npm run test:coverage  # Vitest with coverage gate (CI)
npm run e2e            # Playwright E2E smoke tests
```

---

## Testing

**571 tests across 54 files**:

| Layer | What it covers |
|-------|----------------|
| **Unit** | Pure logic — roles, feature flags, crypto primitives, mnemonic/sigil derivation, relationship state helpers, arena scoring |
| **Integration** | Express routes via `supertest` — auth, payment, messaging, chat settings, relationship endpoints, profile aggregation, paid events |
| **Component (jsdom)** | React components with mocked stores — FriendButton state machine, MessageButton, ProfileTabs, tab content, IdentityGlyph |
| **E2E (Playwright)** | 7 browser-level smoke tests against a production build — health probes, CSRF, SPA shell, security headers |

Coverage thresholds enforced in `vitest.config.js` (55 / 45 / 55 / 55 baseline, actual
numbers consistently 10+ points above). Pre-commit hook runs lint + typecheck +
`test:coverage` so regressions never reach `main`.

---

## CI / CD

GitHub Actions workflow at `.github/workflows/ci.yml`:

1. `npm ci --legacy-peer-deps`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test:coverage` (fails the job if coverage drops below threshold)
5. `npm run build`
6. `npx playwright install chromium --with-deps`
7. `npm run e2e`

Every push to `main` + every PR runs the full pipeline. Dependabot checks npm deps
weekly.

---

## Deployment

### Render (recommended — free tier)

1. **New Web Service** → connect your GitHub repo.
2. **Build command:** `npm install --legacy-peer-deps && npm run build`
3. **Start command:** `npm start`
4. Add env vars from the table above.
5. First deploy takes 3–4 minutes. Hit `/api/health` to verify.

UptimeRobot pinging `/api/health` every 5 min keeps the free-tier dyno warm during
active hours.

### Other platforms

Any host that runs a persistent Node process + supports WebSockets works: Fly.io,
Railway, Oracle Cloud free VM. **Vercel does not** — the app needs a persistent Socket.IO
connection which serverless functions can't provide.

---

## Subscription Plans & Feature Flags

| Feature | Starter | Professional | Enterprise |
|---------|---------|--------------|------------|
| Arena + Leaderboard | ✓ | ✓ | ✓ |
| Events + Notifications | ✓ | ✓ | ✓ |
| AI Question Generator | — | ✓ | ✓ |
| Certificates | — | ✓ | ✓ |
| Live Quiz | — | ✓ | ✓ |
| Team Projects | — | ✓ | ✓ |
| Achievements | — | ✓ | ✓ |
| QR Check-in | — | ✓ | ✓ |
| E2EE Messaging | — | — | ✓ |
| Referral System | — | — | ✓ |
| Advanced Analytics | — | — | ✓ |
| Custom Branding | — | — | ✓ |
| Data Export | — | — | ✓ |
| API Access | — | — | ✓ |

Super-admins can override any feature for any org from the Feature Flags UI.

---

## Monument Theme System

Every page calls `useMonument('name')` + renders `<MonumentBackground monument="name" />`.
Eight themed biomes (desert, pyramid, glacier, jungle, city, abyss, sky, magma) each set
CSS variables `--page-accent`, `--page-glow`, `--org-primary`, `--org-secondary` so
buttons and cards automatically match the current scene.

---

## License

MIT © 2026 Math Collective, BMSIT
