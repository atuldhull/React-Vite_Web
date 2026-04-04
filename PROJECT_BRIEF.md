# Math Collective — Complete Project Brief

> **Generated:** April 2026
> **Purpose:** Reference document for generating frontend prompts, understanding architecture, and onboarding contributors.

---

## 1. Project Overview

**Math Collective** is a multi-tenant, competitive mathematics platform built for university students (originally for BMSIT). It combines live quizzes, challenge arenas, XP-based gamification, AI question generation, team projects, certificate issuing, and a full admin/teacher panel into a single SaaS product.

**Core Value Proposition:** "Kahoot meets LeetCode for math" — students solve challenges, compete in real-time quizzes, earn XP, climb leaderboards, form teams, and earn certificates.

**Business Model:** Multi-tenant SaaS with Razorpay-based subscription plans (Free / Professional / Enterprise). Each organisation (university/college) gets an isolated tenant with its own branding, users, and feature flags.

---

## 2. Tech Stack

### Backend
| Component | Technology |
|-----------|-----------|
| Runtime | Node.js (v18+) |
| Framework | Express.js 5 |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth (email/password) |
| Real-time | Socket.io 4.7 |
| AI | OpenRouter API (DeepSeek model) |
| Payments | Razorpay (Indian payment gateway) |
| Email | Nodemailer (Gmail SMTP) |
| PDF/Certs | XeLaTeX compilation, PDFKit, Sharp (image processing) |
| File Upload | Multer |
| Rate Limiting | express-rate-limit |
| Sessions | express-session (memory store) |

### Frontend
| Component | Technology |
|-----------|-----------|
| Framework | React 19.2 |
| Build Tool | Vite 8 |
| Routing | React Router v7 |
| State | Zustand 5 |
| Styling | Tailwind CSS 3.4 |
| Animations | Framer Motion 12, GSAP 3.14 |
| 3D Graphics | Three.js 0.183, @react-three/fiber 9, @react-three/drei 10 |
| HTTP Client | Axios |
| Real-time | Socket.io Client |
| Fonts | Space Grotesk (headings), JetBrains Mono (numbers/math), Outfit (body) |
| Smooth Scroll | Lenis |

### Third-Party Services
1. **Supabase** — PostgreSQL database, Auth, Row-Level Security
2. **OpenRouter** — AI question generation + LaTeX certificate template design (DeepSeek model)
3. **Razorpay** — Payment processing (test mode: `rzp_test_*`)
4. **Gmail SMTP** — Transactional emails (contact form, password reset, auto-replies)
5. **Cloudinary** — Image hosting (gallery images are hardcoded Cloudinary URLs)
6. **XeLaTeX** — PDF certificate compilation (requires system install)

---

## 3. User Roles & Permissions

| Role | Inherits | Unique Capabilities |
|------|----------|-------------------|
| **student** | — | Arena, Live Quiz, Dashboard, Projects, Certificates, Leaderboard, Gallery, Events, PANDA Bot |
| **teacher** | student | Student management, Challenge CRUD, AI question generation, Quiz hosting, Certificate batch generation, Project approval, Scheduled tests |
| **admin** | teacher | User CRUD (create/delete/role change), Site settings, Data ops (clear attempts, reset XP, weekly reset), Event management |
| **super_admin** | admin | Organisation CRUD, Subscription plan management, Feature flags per org, Impersonation, Platform-wide analytics, Force-suspend users |

### Role Hierarchy
```
super_admin > admin > teacher > student
```

Each higher role can do everything the lower roles can, plus their own capabilities.

---

## 4. Database Schema (Supabase PostgreSQL)

### Core Tables

#### `students`
```
id              UUID (PK)
user_id         UUID (Supabase Auth UID)
email           TEXT (unique per org)
name            TEXT
role            TEXT ('student' | 'teacher' | 'admin' | 'super_admin')
xp              INTEGER (total lifetime XP)
weekly_xp       INTEGER (resets each week cycle)
title           TEXT (current rank title)
bio             TEXT
avatar_letter   TEXT
avatar_emoji    TEXT
avatar_color    TEXT
avatar_config   JSONB
department      TEXT (for teachers)
subject         TEXT (for teachers)
org_id          UUID (FK → organisations)
is_active       BOOLEAN
created_at      TIMESTAMP
updated_at      TIMESTAMP
last_seen_at    TIMESTAMP
```

#### `challenges`
```
id              UUID (PK)
title           TEXT
question        TEXT (the math problem)
options         TEXT[] (array of exactly 4 options)
correct_index   INTEGER (0-3)
difficulty      TEXT ('easy' | 'medium' | 'hard' | 'extreme')
points          INTEGER (XP awarded on correct answer)
solution        TEXT (explanation shown after answering)
is_active       BOOLEAN
created_at      TIMESTAMP
```

#### `arena_attempts`
```
id              UUID (PK)
user_id         UUID (FK → students)
challenge_id    UUID (FK → challenges)
selected_index  INTEGER (0-3)
correct         BOOLEAN
xp_earned       INTEGER
created_at      TIMESTAMP
UNIQUE(user_id, challenge_id) — one attempt per challenge per user
```

#### `scheduled_tests`
```
id              UUID (PK)
title           TEXT
description     TEXT
challenge_ids   UUID[] (array of challenge IDs)
created_by      UUID (teacher who created)
starts_at       TIMESTAMP
ends_at         TIMESTAMP
is_active       BOOLEAN
created_at      TIMESTAMP
```

#### `test_attempts`
```
id              UUID (PK)
test_id         UUID (FK → scheduled_tests)
user_id         UUID (FK → students)
answers         JSONB (student's answers)
score           INTEGER
max_score       INTEGER
submitted       BOOLEAN
submitted_at    TIMESTAMP
started_at      TIMESTAMP
```

#### `events`
```
id              UUID (PK)
title           TEXT
description     TEXT
date            TIMESTAMP
location        TEXT
time            TEXT
registration_form_url   TEXT
registration_deadline   TIMESTAMP
registration_open       BOOLEAN
max_registrations       INTEGER
event_type      TEXT
organiser       TEXT
tags            TEXT[]
banner_color    TEXT
is_active       BOOLEAN
```

#### `notifications`
```
id              UUID (PK)
user_id         UUID (FK → students)
title           TEXT
body            TEXT
type            TEXT
link            TEXT
is_read         BOOLEAN
created_at      TIMESTAMP
```

#### `certificate_batches`
```
id              UUID (PK)
title           TEXT
event_name      TEXT
event_date      TEXT
issued_by       TEXT
signatory_name  TEXT
signatory_title TEXT
template_type   TEXT
recipients      JSONB (array of {name, email})
created_by      UUID
created_at      TIMESTAMP
```

#### `certificates`
```
id              UUID (PK)
batch_id        UUID (FK → certificate_batches)
user_id         UUID (FK → students, nullable)
recipient_name  TEXT
recipient_email TEXT
event_name      TEXT
issued_at       TIMESTAMP
```

#### `teams`
```
id              UUID (PK)
name            TEXT
members         UUID[] (array of user IDs, 3-6 members)
leader_id       UUID (team creator)
created_at      TIMESTAMP
```

#### `projects`
```
id              UUID (PK)
team_id         UUID (FK → teams)
title           TEXT
description     TEXT
category        TEXT
github_url      TEXT
demo_url        TEXT
is_approved     BOOLEAN
total_points    INTEGER
votes           INTEGER
created_at      TIMESTAMP
```

#### `project_categories`
```
id              UUID (PK)
name            TEXT
```

#### `weekly_winners`
```
week_start      DATE
user_id         UUID
rank            INTEGER
xp              INTEGER
```

#### `announcements`
```
id              UUID (PK)
title           TEXT
content         TEXT
created_by      UUID
created_at      TIMESTAMP
```

### Multi-Tenancy Tables

#### `organisations`
```
id              UUID (PK)
name            TEXT
slug            TEXT (URL-friendly identifier)
primary_color   TEXT (hex color for branding)
plan_name       TEXT ('free' | 'professional' | 'enterprise')
feature_flags   JSONB (per-org overrides)
status          TEXT ('active' | 'suspended' | 'trial')
plan_expires_at TIMESTAMP
created_at      TIMESTAMP
```

#### `subscription_plans`
```
id              UUID (PK)
name            TEXT (internal key)
display_name    TEXT (shown to users)
price_monthly   INTEGER (in INR)
features        JSONB (feature booleans)
```

#### `payment_history`
```
id              UUID (PK)
org_id          UUID (FK → organisations)
user_id         UUID (who paid)
plan_name       TEXT
razorpay_order_id   TEXT
razorpay_payment_id TEXT
amount          INTEGER (in paise)
currency        TEXT
status          TEXT
paid_at         TIMESTAMP
plan_expires_at TIMESTAMP
```

---

## 5. API Endpoints (67 Total)

### Authentication (8 endpoints)
```
POST   /api/auth/register              — Signup (supports org invite token)
POST   /api/auth/login                 — Login → returns session + role-based redirectTo
POST   /api/auth/logout                — Destroy session
GET    /api/auth/logout                — Redirect-based logout
POST   /api/auth/resend-verification   — Resend email verification
POST   /api/auth/forgot-password       — Send password reset email
POST   /api/auth/reset-password        — Complete reset using Supabase token
GET    /api/auth/me                    — Check auth status (returns user or 401)
```

### Challenge Arena (12 endpoints)
```
GET    /api/challenge/current          — Get active challenge (most recent)
GET    /api/challenge/next             — Random unsolved challenge (?difficulty=hard)
GET    /api/challenge/all              — List all challenges
GET    /api/challenge/:id              — Single challenge
POST   /api/challenge                  — Create (admin/teacher)
PATCH  /api/challenge/:id              — Update (admin/teacher)
DELETE /api/challenge/:id              — Delete (admin/teacher)
PATCH  /api/challenge/:id/toggle       — Toggle active (admin/teacher)

POST   /api/arena/submit               — Submit answer {challengeId, selectedIndex}
GET    /api/arena/history              — User's attempt history
GET    /api/arena/stats                — {total, correct, accuracy, totalXP}
```

### Quiz System (9 endpoints)
```
POST   /api/quiz/ai-generate-bulk      — AI generate N questions by topic/difficulty
POST   /api/quiz/upload-csv            — Parse questions from CSV file
POST   /api/quiz/scheduled             — Create scheduled test
GET    /api/quiz/scheduled             — List all tests
GET    /api/quiz/active                — Get currently active tests
GET    /api/quiz/scheduled/:id         — Get test with questions
POST   /api/quiz/scheduled/:id/submit  — Submit test answers
DELETE /api/quiz/scheduled/:id         — Delete test
GET    /api/quiz/challenges            — Get challenges for quiz picker
```

### Leaderboard (4 endpoints)
```
GET    /api/leaderboard                — Weekly top 20 by weekly_xp
GET    /api/leaderboard/alltime        — All-time top 20 by xp
GET    /api/leaderboard/winners        — Hall of fame (historical weekly winners)
GET    /api/leaderboard/week-info      — {weekStart, weekEnd, timeLeftStr}
```

### User Profile (5 endpoints)
```
GET    /api/user/profile               — Full profile with avatar, bio, org info
PATCH  /api/user/profile               — Update name, bio, avatar (supports file upload)
GET    /api/user/stats                 — XP, rank, title, accuracy, streaks, xpTitles ladder
POST   /api/user/change-password       — Change password
GET    /api/user/test-history          — Test attempt history
```

### Teacher (11 endpoints)
```
GET    /api/teacher/profile            — Teacher info with department/subject
GET    /api/teacher/stats              — {totalStudents, totalChallenges, avgAccuracy}
GET    /api/teacher/students           — All students sorted by XP
GET    /api/teacher/performance        — Per-challenge accuracy breakdown
GET    /api/teacher/activity           — Recent student activity
GET    /api/teacher/generate           — AI generate single question preview
POST   /api/teacher/save-question      — Save question to challenge bank
GET    /api/teacher/challenges         — Teacher's own questions
PATCH  /api/teacher/challenges/:id/toggle — Toggle question active
GET    /api/teacher/leaderboard        — Class rankings
```

### Certificates (9 endpoints)
```
POST   /api/certificates/upload-asset  — Upload logo/signature image
POST   /api/certificates/preview       — AI-design + compile preview PDF
POST   /api/certificates/match-students — Match emails to registered users
POST   /api/certificates/create        — Batch generate all certs
GET    /api/certificates/batches       — List certificate batches
DELETE /api/certificates/batches/:id   — Delete batch
GET    /api/certificates/batch/:id/zip — Download all as ZIP
GET    /api/certificates/download/:id  — Download single cert PDF
GET    /api/certificates/mine          — Student's earned certificates
```

### Projects (10 endpoints)
```
GET    /api/projects                   — List approved projects with vote counts
GET    /api/projects/categories        — Get project categories
GET    /api/projects/my-team           — Current user's team
POST   /api/projects/teams             — Create team (3-6 members by email)
POST   /api/projects                   — Submit project
POST   /api/projects/:id/vote          — Vote on project (one per user)
PATCH  /api/projects/:id/approve       — Approve project (teacher)
GET    /api/projects/pending           — List unapproved (teacher)
POST   /api/projects/categories        — Create category (teacher)
DELETE /api/projects/categories/:id    — Delete category (admin)
```

### Events (8 endpoints)
```
GET    /api/events                     — List all events
GET    /api/events/:id                 — Single event
POST   /api/events                     — Create (teacher+)
PATCH  /api/events/:id                 — Update (teacher+)
DELETE /api/events/:id                 — Delete (teacher+)
PATCH  /api/events/:id/toggle-reg      — Toggle registration open/closed
GET    /api/events/settings            — Get site settings
PATCH  /api/events/settings/:key       — Update setting (admin)
```

### Gallery (4 endpoints)
```
GET    /api/gallery                    — All images grouped by category
POST   /api/gallery/upload             — Upload image (teacher)
DELETE /api/gallery                    — Delete image (admin)
POST   /api/gallery/category           — Create folder/category (admin)
```

### Notifications (5 endpoints)
```
GET    /api/notifications              — User's notifications
PATCH  /api/notifications/:id/read     — Mark one as read
PATCH  /api/notifications/read-all     — Mark all as read
DELETE /api/notifications/clear        — Clear all
POST   /api/notifications/broadcast    — Send to all users (admin)
```

### Announcements (3 endpoints)
```
GET    /api/announcements              — List announcements
POST   /api/announcements              — Create (admin)
DELETE /api/announcements/:id          — Delete (admin)
```

### Admin (16 endpoints)
```
GET    /api/admin/stats                — {totalStudents, totalChallenges, totalAttempts, totalEvents, topStudents, recentActivity}
GET    /api/admin/active-users         — Currently online users (from Socket.io presence)
GET    /api/admin/users?page=1&limit=20 — Paginated user list
POST   /api/admin/users/create         — Create user with role
DELETE /api/admin/users/:id            — Delete user
POST   /api/admin/users/:id/reset-password — Force password reset
PATCH  /api/admin/users/:id/role       — Change role
POST   /api/admin/reset-week           — Archive weekly standings, reset weekly_xp
GET    /api/admin/generate             — AI question preview
POST   /api/admin/save                 — Save AI question
GET    /api/admin/data/teams           — List all teams
DELETE /api/admin/data/teams/:id       — Delete team
GET    /api/admin/data/tests           — List all scheduled tests
DELETE /api/admin/data/tests/:id       — Delete test
DELETE /api/admin/data/attempts/:userId — Clear user's attempts
PATCH  /api/admin/data/reset-xp/:userId — Reset user's XP to 0
DELETE /api/admin/data/all-attempts    — Clear ALL attempts (danger)
```

### Super Admin (15 endpoints)
```
GET    /api/super-admin/analytics      — Platform-wide metrics
GET    /api/super-admin/organisations  — List all orgs
POST   /api/super-admin/organisations  — Create org
PATCH  /api/super-admin/organisations/:id — Update org
DELETE /api/super-admin/organisations/:id — Delete org
POST   /api/super-admin/organisations/:id/suspend  — Suspend org
POST   /api/super-admin/organisations/:id/activate — Activate org
POST   /api/super-admin/organisations/:id/plan     — Assign plan
PUT    /api/super-admin/organisations/:id/features  — Set feature flags
GET    /api/super-admin/organisations/:id/stats     — Org statistics
POST   /api/super-admin/organisations/:id/force-suspend-users — Suspend all org users
POST   /api/super-admin/impersonate/:orgId — Impersonate org admin
DELETE /api/super-admin/impersonate        — Stop impersonation
GET    /api/super-admin/plans              — List subscription plans
```

### Payments (4 endpoints)
```
GET    /api/payment/plans              — Public plan listing
POST   /api/payment/create-order       — Create Razorpay order
POST   /api/payment/verify             — Verify payment HMAC + upgrade plan
POST   /api/payment/webhook            — Razorpay webhook (no auth)
GET    /api/payment/history            — Org billing history
```

### Contact (1 endpoint)
```
POST   /api/contact/send               — Submit contact form → email to admin + auto-reply
```

### Bot (1 endpoint)
```
POST   /api/bot/chat                   — PANDA AI chat (sends conversation to OpenRouter)
```

---

## 6. Real-Time Features (Socket.io)

### Live Quiz System
The most complex real-time feature. Teacher creates a quiz session, students join via 6-character code.

**Session Lifecycle:**
```
Teacher: create_session → gets code "A1B2C3"
Students: join_session(code, name) → enter lobby
Teacher: next_question → broadcasts question to all students
Students: submit_answer(index) → server grades instantly
System: auto-reveal when all answered OR timer expires
Teacher: reveal_answer (manual) → broadcasts correct answer + leaderboard
Teacher: next_question → repeat
Teacher: end_session → final leaderboard + cleanup
```

**Socket Events — Teacher Side:**
```
EMIT:   create_session          → returns {code}
EMIT:   next_question({id, q, options, points, timeLimit})
EMIT:   reveal_answer           → triggers result broadcast
EMIT:   end_session             → closes quiz
LISTEN: lobby_update            → updated player list
LISTEN: answer_received         → student submitted
LISTEN: all_answered            → everyone done
```

**Socket Events — Student Side:**
```
EMIT:   join_session({code, name})
EMIT:   submit_answer({questionId, selectedIndex, timeTaken})
LISTEN: joined                  → success
LISTEN: join_error              → invalid code / already started
LISTEN: lobby_update            → player list
LISTEN: question_start          → new question (no correct_index!)
LISTEN: answer_received         → confirm submitted
LISTEN: question_result         → correct answer + leaderboard + solution
LISTEN: quiz_finished           → final scores
LISTEN: session_ended           → teacher ended
```

**Scoring Formula:**
```javascript
if (correct) {
  timeBonus = Math.max(0, ((timeLimit - timeTaken) / timeLimit) * points)
  xpEarned = points + Math.round(timeBonus)
} else {
  xpEarned = 0
}
```

### Notifications
```
Server: io.to(`user:${userId}`).emit('notification', {title, body, type, link})
Client: socket.on('notification', handler) — real-time push
```

### Presence Tracking (Admin)
```
Client: socket.emit('presence', {name, page, userId})
Admin:  socket.on('active_users_update', handler) — sees who's online
```

---

## 7. Gamification System

### XP Awards
- **Arena:** Correct answer → `challenge.points` XP (typically 25-100)
- **Live Quiz:** Correct answer → `points + timeBonus` (time bonus rewards speed)
- **Scheduled Tests:** Correct answers → points per question

### XP Title Progression
| XP Threshold | Title |
|-------------|-------|
| 0 | Axiom Scout |
| 200 | Proof Reader |
| 500 | Theorem Hunter |
| 1,000 | Series Solver |
| 2,000 | Integral Warrior |
| 3,500 | Conjecture Master |
| 5,000 | Prime Theorist |
| 7,500 | Euler's Heir |
| 10,000 | Math Collective Legend |

### Leaderboard Cycles
- **Weekly:** Ranked by `weekly_xp`. Resets via admin action (`POST /api/admin/reset-week`). Top player recorded in `weekly_winners`.
- **All-Time:** Ranked by total `xp`. Never resets.
- **Hall of Fame:** Historical weekly winners.

### Challenge Difficulty → Time Limits (Arena)
| Difficulty | Time Limit | Typical Points |
|-----------|-----------|---------------|
| Easy | 120s | 25 |
| Medium | 180s | 50 |
| Hard | 300s | 75 |
| Extreme | 600s | 100 |

---

## 8. Multi-Tenancy Architecture

### How It Works
1. Each organisation has a row in `organisations` table
2. Every `students` row has an `org_id` foreign key
3. `tenantMiddleware.injectTenant()` reads `req.session.org_id` and injects into all queries
4. Controllers scope ALL queries with `WHERE org_id = req.orgId`
5. Super admin has `org_id = null` (can see everything)

### Organisation Onboarding Flow
1. Super admin creates org → gets `id`, `slug`, invite URL
2. Users register with org invite token → auto-assigned to org
3. Org admin manages users, challenges, events within their tenant
4. Org admin upgrades plan via Razorpay → unlocks features

### Feature Flags
Stored as JSONB in `subscription_plans.features` and overridden per-org in `organisations.feature_flags`.

Middleware `checkFeatureFlag('live_quiz')` verifies before allowing access.

---

## 9. Frontend Architecture

### Directory Structure
```
frontend/src/
├── app/                        # Router, navigation config, App entry
│   ├── App.jsx                 # Root component (ErrorBoundary wrapper)
│   ├── router.jsx              # All routes, layouts, protected routes
│   └── navigation.js           # Nav items per role
├── components/
│   ├── ui/                     # Button, Card, InputField, Loader
│   ├── backgrounds/            # MonumentBackground (8 biomes), older backgrounds
│   ├── experience/             # EarthHero, PageTransition, MonumentTransition, InteractiveCursor
│   ├── panda/                  # PandaBot, PandaChatPanel, PandaAnimations
│   ├── auth/                   # ProtectedRoute
│   ├── navigation/             # BrandMark
│   └── layout/                 # Layout utilities
├── features/
│   ├── home/pages/             # HomePage (Earth hero + stats + CTA)
│   ├── auth/pages/             # LoginPage, RegisterPage
│   ├── arena/pages/            # ArenaPage
│   ├── dashboard/pages/        # DashboardPage
│   ├── events/pages/           # EventsPage
│   ├── student/pages/          # ProfilePage, CertificatesPage, NotificationsPage, BillingPage, ProjectsPage, TestHistoryPage, LiveQuizPage
│   ├── public/pages/           # LeaderboardPage, GalleryPage, ContactPage
│   ├── teacher/pages/          # TeacherDashboardPage, TeacherStudentsPage, TeacherChallengesPage, TeacherCertificatesPage, TeacherQuizPage
│   ├── admin/pages/            # AdminOverviewPage, AdminUsersPage, AdminChallengesPage, AdminEventsPage, AdminDataPage, AdminSettingsPage
│   └── superadmin/pages/       # SAAnalyticsPage, SAOrganisationsPage, SAPlansPage, SAAccessPage
├── hooks/                      # useMonument, useScrollEffects, useSmoothScroll, useReducedMotionPreference
├── layouts/                    # MainLayout, AuthLayout, AdminLayout, TeacherLayout, SuperAdminLayout
├── lib/                        # api/index.js (Axios client), cn.js (classNames), http.js (Axios instance)
├── store/                      # auth-store.js (Zustand), ui-store.js (Zustand)
└── styles/                     # theme.css (CSS variables), tailwind.css
```

### Routing Structure
```
/                       → HomePage              (MainLayout, public)
/arena                  → ArenaPage             (MainLayout, auth required)
/dashboard              → DashboardPage         (MainLayout, auth required)
/leaderboard            → LeaderboardPage       (MainLayout, public)
/events                 → EventsPage            (MainLayout, public)
/gallery                → GalleryPage           (MainLayout, public)
/contact                → ContactPage           (MainLayout, public)
/profile                → ProfilePage           (MainLayout, auth required)
/certificates           → CertificatesPage      (MainLayout, auth required)
/projects               → ProjectsPage          (MainLayout, auth required)
/notifications          → NotificationsPage     (MainLayout, auth required)
/billing                → BillingPage           (MainLayout, auth required)
/live-quiz              → LiveQuizPage          (MainLayout, public)
/history                → TestHistoryPage       (MainLayout, auth required)

/login                  → LoginPage             (AuthLayout)
/register               → RegisterPage          (AuthLayout)

/teacher                → TeacherDashboardPage  (TeacherLayout, teacher+)
/teacher/students       → TeacherStudentsPage
/teacher/challenges     → TeacherChallengesPage
/teacher/certificates   → TeacherCertificatesPage
/teacher/quiz           → TeacherQuizPage

/admin                  → AdminOverviewPage     (AdminLayout, admin+)
/admin/users            → AdminUsersPage
/admin/challenges       → AdminChallengesPage
/admin/events           → AdminEventsPage
/admin/data             → AdminDataPage
/admin/settings         → AdminSettingsPage

/super-admin            → SAAnalyticsPage       (SuperAdminLayout, super_admin only)
/super-admin/organisations → SAOrganisationsPage
/super-admin/plans      → SAPlansPage
/super-admin/access     → SAAccessPage
```

### State Management (Zustand)

**auth-store:**
```javascript
{
  status: "idle" | "loading" | "authenticated" | "guest" | "error",
  user: {
    id, email, name, role, org_id, org_name, org_slug,
    org_color, org_plan, xp, title, is_active
  },
  error: string | null,
  
  checkSession()    // GET /api/auth/me on app load
  login(email, pw)  // POST /api/auth/login
  register(name, email, pw)
  logout()
  clearError()
}
```

**ui-store:**
```javascript
{
  theme: "cosmic" | "light" | "eclipse",  // persisted to localStorage
  navOpen: boolean,
  cursorMode: string,
  
  setTheme(theme)
  toggleTheme()     // cycles cosmic → light → eclipse → cosmic
  setNavOpen(bool)
  setCursorMode(mode)
}
```

---

## 10. Visual Theme System (Monument System)

### Concept
Every page is visually themed around one of 8 hypothetical "mathematical monuments." The theme is applied via a CSS variable system using `data-monument` attribute on `<body>`.

### Monument → Page Mapping

| Monument | Biome | Accent Color | Pages |
|----------|-------|-------------|-------|
| Desert Winds Observatory | Sand dunes, floating math symbols | `#D4A017` | Arena, Home hero |
| Great Pyramid Theorem | Fractal glass pyramid, starfield | `#7B4FE0` | Dashboard, Test History |
| Glacial Citadel of Limits | Ice geometry, aurora bands | `#00CFFF` | Leaderboard |
| Jungle Ruins of Infinity | Overgrown temple, fireflies | `#2ECC71` | Events, Projects |
| Neon Spire City of Proofs | Cyberpunk skyline, scan lines | `#FF2D78` | Login, Register, Billing |
| Abyssal Library of Constants | Underwater, bioluminescence | `#00FFC8` | Gallery, PANDA Bot |
| Sky Archipelago of Transformations | Floating islands, stars | `#B695F8` | Profile, Certificates, Notifications |
| Magma Forge of Axioms | Volcanic, ember particles | `#FF6B35` | Admin, Teacher, Super Admin |

### How It Works
1. `useMonument('desert')` hook sets `document.body.setAttribute('data-monument', 'desert')`
2. CSS in `theme.css` maps: `[data-monument="desert"] { --page-accent: #D4A017; --page-glow: rgba(212,160,23,0.12); }`
3. All UI components consume `--page-accent` and `--page-glow` automatically
4. `<MonumentBackground monument="desert" intensity={0.15} />` renders the animated biome background

### UI Shape Language (clip-paths)
| Token | Shape | Used On |
|-------|-------|---------|
| `--clip-hex` | Hexagon | Primary CTA buttons |
| `--clip-para` | Parallelogram | Secondary buttons, badges, user chat bubbles |
| `--clip-notch` | Corner-notched rectangle | Cards, bot messages, modals |
| `--clip-diamond` | Diamond | Danger/destructive buttons |

### Fonts
- **Space Grotesk** — h1-h4 headings, monument names, hero text
- **JetBrains Mono** — numbers, math symbols, XP values, quiz codes, counters (`.math-text` class)
- **Outfit** — body text, labels, paragraphs

### Page Transitions
`MonumentTransition.jsx` plays a 1.5s overlay when navigating between routes:
1. Dark overlay fades in (300ms)
2. Destination monument background at full intensity
3. Monument's math symbol animates in center (∑ ∫ △ ∞ λ Ω φ ∇)
4. Overlay fades out revealing new page

---

## 11. User Flows (Detailed)

### Student Flow
```
Register → Verify Email → Login
    ↓
Homepage (3D Earth hero → scroll → stats + features)
    ↓
Dashboard
├── See XP, rank, title, accuracy
├── Recent attempts log
├── Announcements
├── Quick actions
└── Notifications preview
    ↓
Arena
├── Filter by difficulty
├── Pick challenge OR get random
├── Read question → select answer → submit
├── Instant grading: correct/incorrect + XP award
├── View solution explanation
├── Discussion section (comments + AI assistant)
└── See sidebar weekly leaderboard
    ↓
Live Quiz (join via code)
├── Enter 6-char code + display name
├── Wait in lobby
├── Answer questions with timer (time bonus!)
├── See results after each question
└── Final leaderboard
    ↓
Leaderboard
├── Weekly tab (current cycle)
├── All-Time tab (lifetime)
└── Hall of Fame (past winners)
    ↓
Projects
├── Browse approved projects
├── Create team (3-6 members)
├── Submit project
├── Vote on others' projects
└── Wait for teacher approval
    ↓
Certificates (download earned certs as PDF)
    ↓
Profile (edit name/bio/avatar, view stats, change password)
```

### Teacher Flow
```
Login → Teacher Dashboard
├── Class stats: students, challenges, accuracy
├── Performance breakdown per challenge
├── Activity feed
├── Engagement chart
└── Quick actions
    ↓
Challenges
├── Create manually (title, question, 4 options, correct index, difficulty, points, solution)
├── AI Generate (topic + difficulty → DeepSeek generates question)
├── Toggle active/inactive
└── View per-challenge accuracy
    ↓
Quiz Hosting
├── Select/create questions for quiz
├── OR AI bulk generate by topic
├── OR upload CSV
├── Create live session → get 6-char code
├── Share code with students
├── Control flow: next question → wait → reveal → next
├── Monitor live submissions
└── End session → XP awarded
    ↓
Scheduled Tests
├── Pick questions + set time window
├── Students take during window
└── Auto-graded
    ↓
Certificates
├── Upload logo + signatures
├── AI designs LaTeX template (DeepSeek)
├── Enter recipient emails
├── Batch compile PDFs
└── Download ZIP or individual
    ↓
Projects
├── View pending submissions
└── Approve/reject
```

### Admin Flow
```
Login → Admin Overview
├── Total students, challenges, submissions, events
├── Weekly countdown timer
├── Live users panel (real-time)
├── Top students
├── Recent activity feed
└── Quick navigation cards
    ↓
Users
├── Paginated user list with search
├── Create user (name, email, password, role)
├── Change role (student/teacher/admin)
├── Reset password
├── Delete user
└── Export CSV
    ↓
Challenges
├── Full challenge CRUD
├── Bulk toggle active/inactive
├── AI question generation
└── Filter by difficulty/status
    ↓
Events
├── Create event (title, date, location, description)
├── Toggle registration
└── Delete event
    ↓
Data Ops
├── Clear specific user's attempts
├── Reset specific user's XP
├── Delete teams
├── Delete scheduled tests
└── Danger: Clear ALL attempts
    ↓
Settings
├── Toggle arena open/closed
├── Toggle registrations open/closed
├── Update site notice banner
├── Danger: Weekly leaderboard reset
└── Danger: Clear all attempts
```

---

## 12. Environment Variables

The following ENV keys are required (values redacted):

```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# AI (OpenRouter)
OPENROUTER_API_KEY=sk-or-v1-...

# Session
SESSION_SECRET=<random-string>

# Email (Gmail SMTP)
CONTACT_EMAIL=<gmail-address>
CONTACT_APP_PASSWORD=<app-password>

# Razorpay
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=<secret>
RAZORPAY_WEBHOOK_SECRET=<webhook-secret>

# Server
PORT=3000
```

---

## 13. File Counts & Size

| Area | Files | Description |
|------|-------|-------------|
| Backend routes | 14 | API route definitions |
| Backend controllers | 14 | Business logic |
| Backend middleware | 4 | Auth, tenant, session, rate limiting |
| Frontend pages | 27 | All page components |
| Frontend UI components | 4 | Button, Card, InputField, Loader |
| Frontend backgrounds | 7 | Monument + legacy backgrounds |
| Frontend experience | 6 | Earth, transitions, cursor, loading |
| Frontend stores | 2 | Auth + UI state |
| Frontend hooks | 4 | Monument, scroll, smooth scroll, reduced motion |
| Frontend layouts | 5 | Main, Auth, Admin, Teacher, SuperAdmin |

---

## 14. What's NOT in the Codebase (Gaps / Future Work)

- No Redis session store (uses memory store — not production-safe)
- No automated tests (no test files found)
- No CI/CD pipeline
- No Docker configuration
- No database migrations (schema managed via Supabase dashboard)
- Gallery images are hardcoded Cloudinary URLs (not dynamic upload for gallery page)
- No email verification flow completion handler (relies on Supabase magic link)
- No file size validation on uploads
- No WebSocket authentication (socket connections aren't verified against sessions)
- No audit logging (super admin actions aren't recorded)
- Contact form has no spam protection beyond rate limiting
- Certificate LaTeX compilation requires system-installed `xelatex`

---

## 15. Updates — April 2–4, 2026

### Homepage Cinematic Experience
The homepage was rebuilt as a scroll-synced cinematic video experience:
- Scroll controls video playback position (space → Earth zoom → desert monument)
- Video: `frontend/public/videos/desert_monument.mp4` (6.5MB, Cloudinary)
- Smooth 4% lerp interpolation, 15fps seek throttle — no 3D Canvas needed
- Title overlay, scroll hint, stats bar fade based on scroll progress
- Previous 3D Earth, monument scenes, HDRIs, terrain textures all removed (~110MB cleanup)

### Arena — Random Questions + Penalty Scoring
- Students no longer browse/choose challenges — random question auto-loads
- Difficulty filter re-fetches random challenge of that difficulty
- **Penalty system:** Wrong answers deduct XP: -5 (20pt), -10 (50pt), -20 (100pt)
- XP floored at 0 (can't go negative total)
- Shows correct answer + solution after wrong submission
- "Skip" button loads another random question

### Teacher Portal — AI Regenerate
- AI-generated question preview now has a **Regenerate** button
- Fixed correct answer highlighting (`correct_index` field name from backend)
- Fixed explanation display (checks both `explanation` and `solution` fields)

### Admin Portal — AI Question Generator
- Full AI question generation added (was manual creation only)
- Same flow as teacher: topic → difficulty → generate → preview → save/regenerate/discard
- Manual creation form still available

### Student Doubt → Teacher Notifications
- When a student posts a comment/doubt on a challenge, all teachers + admins get a real-time notification
- Notification shows student name + first 80 chars of the question
- Links to `/arena`

### Friend Request Notifications
- Sending a friend request sends a notification to the recipient
- Accepting a friend request sends a notification to the requester with a link to the acceptor's profile
- Notifications Page shows pending friend requests with Accept/Decline buttons
- Accept marks notification read and redirects to friend's profile (`/student/:userId`)

### Notifications Page Fixes
- Fixed `is_read` vs `read` field mismatch (DB uses `is_read`)
- Fixed `body` vs `message` field mismatch (DB uses `body`)
- Clickable notifications navigate to `link` field
- Read notifications stay visible as dimmed history

### Files Cleaned Up (April 4, 2026)
| Category | Count | Size | Reason |
|----------|-------|------|--------|
| Cinematic 3D components | 10 files | ~60KB | Replaced by video approach |
| Monument 3D scenes | 8 files | ~40KB | Never wired to pages |
| HDRI environment maps | 6 files | ~77MB | Unused after HDRI approach abandoned |
| Terrain textures | 4 sets | ~15MB | Only used by deleted monuments |
| Earth textures (broken) | 2 files | ~1MB | TIFF mislabeled as JPG |
| Stale docs | 3 files | ~40KB | MONUMENT_CHECKLIST, SETUP, PROJECT_REFERENCE |
| **Total** | **33 files** | **~110MB** | — |

### Feature Flag & Subscription System (April 4, 2026)
Built a complete plan-based feature gating system:
- **18 features** defined across 7 categories (Core, AI & Content, Engagement, Events, Communication, Analytics, Customization)
- **3 plan tiers:** Starter (4 features), Professional (12 features), Enterprise (18 features)
- **Org admin dashboard** (`/admin/features`): toggle features ON/OFF within plan, see plan limits, upgrade prompts for locked features
- **Super admin override** (`/super-admin/access`): enable/disable any feature for any org regardless of plan
- **Backend middleware** `checkFeatureFlag("key")` gates routes: AI tools, certificates, QR check-in, event leaderboards, analytics, data export
- **Frontend hook** `useFeatureFlag("key")` checks if feature is enabled with 60s cache
- **UpgradePrompt component** with inline/fullpage/badge variants
- **Org admin API:** `GET/PATCH /org-admin/features` for reading and toggling features
- Feature definitions centralized in `frontend/src/config/features.js`

### Admin Data Export (April 4, 2026)
- `GET /api/admin/export` downloads ZIP with 11 CSV files (students, challenges, attempts, events, registrations, attendance, leaderboard, achievements, user_achievements, notifications, friendships) + README.txt summary
- Uses `archiver` package for streaming ZIP
- Gated behind `data_export` feature flag (Enterprise plan)

### Certificate Orientation Fix (April 4, 2026)
- AI prompt hardened to enforce landscape orientation
- Post-processing forces `\documentclass[a4paper,landscape]` even if AI ignores instruction
- Adds geometry package with `landscape,paperwidth=297mm,paperheight=210mm` if missing

### Mobile Responsiveness (April 4, 2026)
- Hamburger menu replaces wrapped nav buttons on mobile (< 1024px)
- Slide-down drawer with all nav links, role links, theme toggle, sign out
- Touch-friendly: `min-height: 44px` on all interactive elements via `@media (hover: none)`
- Responsive typography: headings scale down via `clamp()` on mobile
- Overflow prevention: `overflow-x: hidden` on body below 480px
