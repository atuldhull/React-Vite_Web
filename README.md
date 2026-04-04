# Math Collective

**A multi-tenant competitive mathematics platform for university students.**

Built with React 19 + Vite 8 (frontend), Express 5 + Supabase (backend), Three.js (3D), Socket.IO (real-time). Features AI-powered challenges, live quizzes, XP gamification, E2EE messaging, and a cinematic 3D homepage.

> Last updated: April 4, 2026

---

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your keys (see below)

# Run backend (port 3000)
node server.js

# Run frontend (port 5173)
npx vite --host
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
├── server.js                  # Express 5 entry point + Socket.IO
├── config/                    # Supabase, OpenRouter clients
├── controllers/               # All backend logic
│   ├── arenaController.js     # Challenge submission + penalty scoring
│   ├── authController.js      # Register, login, logout
│   ├── challengeController.js # Challenge CRUD
│   ├── messagingController.js # E2EE chat + friendships
│   ├── notificationController.js # Real-time notifications
│   ├── teacherController.js   # AI question generation
│   ├── certificateController.js # PDF certificate generation
│   └── referralController.js  # Referral system
├── middleware/                 # Auth guards (requireAuth, requireTeacher, etc.)
├── routes/                    # Express route files
│
├── frontend/                  # React 19 + Vite 8 SPA
│   ├── src/
│   │   ├── app/               # App.jsx, router.jsx
│   │   ├── features/          # Feature-based pages
│   │   │   ├── home/          # Homepage (3D Earth + cinematic video)
│   │   │   ├── arena/         # Challenge arena (random questions)
│   │   │   ├── student/       # Dashboard, profile, notifications
│   │   │   ├── teacher/       # Challenge manager, quiz hosting
│   │   │   ├── admin/         # User/challenge/event management
│   │   │   └── superadmin/    # Org/subscription management
│   │   ├── components/        # Shared UI (Button, Card, backgrounds)
│   │   ├── hooks/             # useMonument, usePerformanceTier, etc.
│   │   ├── store/             # Zustand stores
│   │   ├── lib/               # API client, crypto, http
│   │   └── styles/            # theme.css, tailwind.css
│   └── public/
│       ├── textures/          # Earth, terrain, sky HDRIs
│       └── videos/            # Cinematic desert video
│
├── docs/                      # SQL schemas
├── PROJECT_CONFIG.md          # Project configuration & conventions
├── PROJECT_BRIEF.md           # Complete project documentation
├── PROGRESS.md                # Full development changelog
└── PROJECT_BRIEF.md           # Complete project documentation
```

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
| `RAZORPAY_KEY_ID` | For payments | Razorpay key |
| `RAZORPAY_SECRET` | For payments | Razorpay secret |
| `PORT` | No | Server port (default: 3000) |

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
npm run dev:frontend   # Vite dev server
npm run build          # Production frontend build → public/app/
npm run lint           # ESLint check
npm run lint:fix       # ESLint auto-fix
npm run format         # Prettier format all files
npm run format:check   # Prettier check (CI)
npm test               # Test placeholder (Vitest installed)
```

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

- **ESLint** — `eslint.config.js` (flat config, React + hooks plugins)
- **Prettier** — `.prettierrc` (120 chars, double quotes, trailing commas)
- **No TypeScript** — JS-only (TS migration planned for Phase 8)
- **Vitest** — installed, test suite planned

---

## License

MIT © 2026 Math Collective, BMSIT
