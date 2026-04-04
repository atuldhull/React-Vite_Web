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
- **Event Management** — Create/manage competitions
- **Site Settings** — Registration gate, org branding

### Homepage
- **3D Earth** — Photorealistic globe with spaceships, day/night, atmosphere
- **Scroll-synced video** — Cinematic desert monument journey, controlled by scroll
- **Cross-fade transition** — White atmospheric flash between Earth and video

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

## Monument Theme System

Every page uses `useMonument('name')` + `<MonumentBackground monument="name" />`.
8 themed biomes: desert, pyramid, glacier, jungle, city, abyss, sky, magma.
CSS variables auto-set: `--page-accent`, `--page-glow`, `--org-primary`, `--org-secondary`.

---

## SQL Schemas

Run these in Supabase SQL editor:
- `docs/messaging-schema.sql` — Chat, friendships, encryption tables
- `docs/referral-schema.sql` — Referral system tables

---

## Development Log

See [PROGRESS.md](PROGRESS.md) for the complete session-by-session changelog with every file created/modified.

---

## Build

```bash
npx vite build    # Outputs to public/app/
```

```
Build time: ~3.5s
app.js:            2,322 KB (749 KB gzip)
CinematicScene.js: 1,090 KB (332 KB gzip) — lazy-loaded
app.css:             91 KB (22 KB gzip)
```

---

## License

MIT © 2026 Math Collective, BMSIT
