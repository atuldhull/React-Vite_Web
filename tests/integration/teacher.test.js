/**
 * Integration tests — teacherController.js (was 0 % in the gated list).
 *
 * Covers every handler exposed by backend/routes/teacherRoutes.js:
 *   GET    /api/teacher/profile        — getTeacherProfile
 *   GET    /api/teacher/stats          — getTeacherStats
 *   GET    /api/teacher/students       — getStudents
 *   GET    /api/teacher/performance    — getChallengePerformance
 *   GET    /api/teacher/activity       — getRecentActivity
 *   GET    /api/teacher/generate       — teacherGenerateQuestion (LLM path)
 *   POST   /api/teacher/save-question  — teacherSaveQuestion (raw supabase insert)
 *   GET    /api/teacher/challenges     — getTeacherChallenges
 *   PATCH  /api/teacher/challenges/:id/toggle — toggleTeacherChallenge
 *   GET    /api/teacher/leaderboard    — getTeacherLeaderboard
 *
 * Mock strategy:
 *   - authMiddleware bypassed (payment.test.js pattern) — the handlers
 *     themselves don't call any auth APIs, they just trust req.db + req.orgId.
 *   - @supabase/supabase-js mocked with chain flags so the four count queries
 *     in getTeacherStats can return distinct numbers, the per-challenge
 *     accuracy queries in getChallengePerformance can return per-challenge
 *     state, and the raw insert in teacherSaveQuestion can be asserted on.
 *   - backend/lib/llm.js's callLLM mocked so the /generate tests don't hit
 *     a real API; error shapes are simulated via the mock's rejection.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mutable mock state ────────────────────────────────────────────────
// capacityCount key is a tuple of (table, filterFingerprint) so the four
// parallel queries in getTeacherStats resolve to DISTINCT numbers.
const state = {
  // Profile lookup (students maybeSingle)
  profile: null,
  profileError: null,

  // getTeacherStats counts
  counts: {
    studentsAll:     0,
    challengesAct:   0,
    attemptsAll:     0,
    attemptsCorrect: 0,
  },

  // getStudents / getTeacherLeaderboard list
  studentsList: [],
  studentsListError: null,

  // Challenges list + per-challenge counts
  challengesList: [],
  // perChallengeCounts[challengeId] = { total, correct }
  perChallengeCounts: {},

  // Recent activity
  activityList: [],
  activityError: null,

  // Challenge toggle
  toggleRow:    null,
  toggleResult: null,
  toggleError:  null,

  // teacherSaveQuestion (raw supabase)
  saveReturn: null,
  saveError:  null,
  lastInsert: null,

  // Teacher-side list of all challenges
  teacherChallengesList: [],

  // Filter capture — set by .eq() calls on the current chain so the
  // count resolver can differentiate "all students" vs "correct=true"
  // vs "challenge_id=X".
  currentFilters: [],
};

beforeEach(() => {
  state.profile              = null;
  state.profileError         = null;
  state.counts               = { studentsAll: 0, challengesAct: 0, attemptsAll: 0, attemptsCorrect: 0 };
  state.studentsList         = [];
  state.studentsListError    = null;
  state.challengesList       = [];
  state.perChallengeCounts   = {};
  state.activityList         = [];
  state.activityError        = null;
  state.toggleRow            = null;
  state.toggleResult         = null;
  state.toggleError          = null;
  state.saveReturn           = null;
  state.saveError            = null;
  state.lastInsert           = null;
  state.teacherChallengesList = [];
  state.currentFilters       = [];
  vi.clearAllMocks();
});

// ── Bypass auth + feature-flag checks ────────────────────────────────
vi.mock("../../backend/middleware/authMiddleware.js", () => ({
  requireAuth:       (req, _res, next) => { req.userId = "teacher-1"; req.userRole = "teacher"; req.orgId = "org-A"; next(); },
  requireAdmin:      (req, _res, next) => { req.userId = "teacher-1"; req.userRole = "admin";   req.orgId = "org-A"; next(); },
  requireTeacher:    (req, _res, next) => {
    req.userId = "teacher-1";
    req.userRole = "teacher";
    req.orgId = "org-A";
    req.session = { user: { id: "teacher-1", role: "teacher", org_id: "org-A", is_active: true, email: "t@x.edu" } };
    next();
  },
  requireSuperAdmin: (req, _res, next) => { req.userId = "teacher-1"; req.userRole = "super_admin"; next(); },
  requireSameOrg:    (_req, _res, next) => next(),
  // Feature flags unconditionally open — we're not testing plan gating here.
  checkFeatureFlag:  () => (_req, _res, next) => next(),
}));

// ── Supabase mock ─────────────────────────────────────────────────────
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      const chain = {
        _table:       table,
        _isCount:     false,
        _hasOrder:    false,
        _filters:     {},
        select: (_cols, opts) => {
          if (opts && opts.count) chain._isCount = true;
          return chain;
        },
        insert: (payload) => {
          if (table === "challenges") state.lastInsert = payload;
          return {
            select: () => ({
              single: async () => {
                if (state.saveError) return { data: null, error: state.saveError };
                return { data: state.saveReturn ?? { id: "ch-new", ...payload }, error: null };
              },
            }),
          };
        },
        update: () => ({
          eq: () => ({
            select: () => ({
              single: async () => {
                if (state.toggleError) return { data: null, error: state.toggleError };
                return { data: state.toggleResult ?? { is_active: true }, error: null };
              },
            }),
            then: (r) => Promise.resolve({ data: state.toggleResult, error: state.toggleError }).then(r),
          }),
        }),
        eq: (col, val) => {
          chain._filters[col] = val;
          return chain;
        },
        in: () => chain,
        or: () => chain,
        order: () => { chain._hasOrder = true; return chain; },
        limit: () => chain,
        maybeSingle: async () => {
          if (table === "students") {
            if (state.profileError) return { data: null, error: state.profileError };
            return { data: state.profile, error: null };
          }
          if (table === "challenges") {
            // toggle reads a single row's is_active
            return { data: state.toggleRow, error: null };
          }
          return { data: null, error: null };
        },
        single: async () => ({ data: null, error: null }),
        then: (r) => {
          // Count queries
          if (chain._isCount) {
            if (table === "students") {
              return Promise.resolve({ count: state.counts.studentsAll, error: null }).then(r);
            }
            if (table === "challenges") {
              return Promise.resolve({ count: state.counts.challengesAct, error: null }).then(r);
            }
            if (table === "arena_attempts") {
              // getChallengePerformance filters by challenge_id. If the
              // filter is present, resolve to the per-challenge number;
              // otherwise it's the two Promise.all counts from stats.
              if (chain._filters.challenge_id) {
                const entry = state.perChallengeCounts[chain._filters.challenge_id] || { total: 0, correct: 0 };
                const n = chain._filters.correct ? entry.correct : entry.total;
                return Promise.resolve({ count: n, error: null }).then(r);
              }
              const n = chain._filters.correct ? state.counts.attemptsCorrect : state.counts.attemptsAll;
              return Promise.resolve({ count: n, error: null }).then(r);
            }
            return Promise.resolve({ count: 0, error: null }).then(r);
          }
          // List queries (order present but not a count)
          if (table === "students") {
            return Promise.resolve({ data: state.studentsList, error: state.studentsListError }).then(r);
          }
          if (table === "challenges") {
            // Two possible list callers: getChallengePerformance
            // (requires is_active=true filter) or getTeacherChallenges.
            // getTeacherChallenges select columns include "is_active";
            // the performance caller filters on is_active=true. Both
            // resolve to the same state — test seed decides which
            // semantic is exercised.
            if (chain._filters.is_active === true) {
              return Promise.resolve({ data: state.challengesList, error: null }).then(r);
            }
            return Promise.resolve({ data: state.teacherChallengesList, error: null }).then(r);
          }
          if (table === "arena_attempts") {
            return Promise.resolve({ data: state.activityList, error: state.activityError }).then(r);
          }
          return Promise.resolve({ data: [], error: null }).then(r);
        },
      };
      return chain;
    },
  }),
}));

// ── LLM mock — per-test control of the response / error shape ────────
const mockCallLLM = vi.fn();
vi.mock("../../backend/lib/llm.js", () => ({
  callLLM: (...args) => mockCallLLM(...args),
}));

const teacherRoutes = (await import("../../backend/routes/teacherRoutes.js")).default;

function buildApp() {
  const app = express();
  app.use(express.json());
  // req.db is populated per-request because tenantMiddleware isn't mounted
  // by teacherRoutes; the auth-middleware mock above sets userId/orgId but
  // not req.db. Handlers call req.db.from(...) — we alias it to the mocked
  // supabase client below.
  app.use((req, _res, next) => {
    // eslint-disable-next-line no-undef
    req.db = { from: (t) => mockedSupabase.from(t), audit: async () => {} };
    next();
  });
  app.use("/api/teacher", teacherRoutes);
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

const { createClient: mockedCreateClient } = await import("@supabase/supabase-js");
const mockedSupabase = mockedCreateClient();

// ════════════════════════════════════════════════════════════
// GET /api/teacher/profile
// ════════════════════════════════════════════════════════════

describe("GET /profile — getTeacherProfile", () => {
  it("returns the student profile row", async () => {
    state.profile = { name: "Ms Rao", email: "rao@x.edu", role: "teacher", department: "MCA", subject: "Linear Algebra", xp: 0 };
    const res = await request(buildApp()).get("/api/teacher/profile");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Ms Rao");
  });

  it("falls back to session user when no row is found", async () => {
    state.profile = null;
    const res = await request(buildApp()).get("/api/teacher/profile");
    expect(res.status).toBe(200);
    // requireTeacher mock seeds req.session.user with email 't@x.edu'
    expect(res.body.email).toBe("t@x.edu");
  });

  it("500 when the profile lookup errors", async () => {
    state.profileError = { message: "profile boom" };
    const res = await request(buildApp()).get("/api/teacher/profile");
    expect(res.status).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/teacher/stats
// ════════════════════════════════════════════════════════════

describe("GET /stats — getTeacherStats", () => {
  it("aggregates 4 counts and computes accuracy", async () => {
    state.counts = { studentsAll: 42, challengesAct: 7, attemptsAll: 200, attemptsCorrect: 150 };
    const res = await request(buildApp()).get("/api/teacher/stats");
    expect(res.status).toBe(200);
    expect(res.body.totalStudents).toBe(42);
    expect(res.body.totalChallenges).toBe(7);
    expect(res.body.totalAttempts).toBe(200);
    expect(res.body.accuracy).toBe(75); // 150/200
  });

  it("accuracy is 0 when there are no attempts (no divide-by-zero)", async () => {
    state.counts = { studentsAll: 10, challengesAct: 3, attemptsAll: 0, attemptsCorrect: 0 };
    const res = await request(buildApp()).get("/api/teacher/stats");
    expect(res.status).toBe(200);
    expect(res.body.accuracy).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/teacher/students
// ════════════════════════════════════════════════════════════

describe("GET /students — getStudents", () => {
  it("returns the student list", async () => {
    state.studentsList = [
      { id: "s-1", user_id: "u-1", name: "Alice", xp: 500 },
      { id: "s-2", user_id: "u-2", name: "Bob",   xp: 300 },
    ];
    const res = await request(buildApp()).get("/api/teacher/students");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("500 when supabase errors", async () => {
    state.studentsListError = { message: "students boom" };
    const res = await request(buildApp()).get("/api/teacher/students");
    expect(res.status).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/teacher/performance
// ════════════════════════════════════════════════════════════

describe("GET /performance — getChallengePerformance", () => {
  it("returns [] when there are no challenges", async () => {
    state.challengesList = [];
    const res = await request(buildApp()).get("/api/teacher/performance");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("computes per-challenge accuracy and sorts by total desc", async () => {
    state.challengesList = [
      { id: "ch-A", title: "Matrices",  difficulty: "easy",   points: 20  },
      { id: "ch-B", title: "Integrals", difficulty: "medium", points: 50  },
    ];
    state.perChallengeCounts = {
      "ch-A": { total: 10, correct: 8  }, // 80 %
      "ch-B": { total: 50, correct: 25 }, // 50 % — higher total, comes first
    };
    const res = await request(buildApp()).get("/api/teacher/performance");
    expect(res.status).toBe(200);
    expect(res.body[0].title).toBe("Integrals"); // total 50 > 10
    expect(res.body[0].accuracy).toBe(50);
    expect(res.body[1].accuracy).toBe(80);
    expect(res.body[1].difficulty).toBe("EASY"); // upper-cased
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/teacher/activity
// ════════════════════════════════════════════════════════════

describe("GET /activity — getRecentActivity", () => {
  it("returns the 20-row feed", async () => {
    state.activityList = [
      { correct: true,  xp_earned: 20, created_at: "now", challenges: { title: "Q1", difficulty: "easy" } },
    ];
    const res = await request(buildApp()).get("/api/teacher/activity");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("500 on error", async () => {
    state.activityError = { message: "activity boom" };
    const res = await request(buildApp()).get("/api/teacher/activity");
    expect(res.status).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/teacher/generate — LLM-backed question generator
// ════════════════════════════════════════════════════════════

describe("GET /generate — teacherGenerateQuestion", () => {
  it("returns the parsed JSON from the LLM response", async () => {
    const q = {
      title: "Derivative of x^2",
      question: "What is d/dx of x^2?",
      options: ["x", "2x", "x^2", "0"],
      correct_index: 1,
      difficulty: "easy",
      points: 20,
      solution: "Power rule",
    };
    mockCallLLM.mockResolvedValueOnce({
      provider: "gemini",
      response: { data: { choices: [{ message: { content: JSON.stringify(q) } }] } },
    });
    const res = await request(buildApp())
      .get("/api/teacher/generate?topic=Calculus&difficulty=easy");
    expect(res.status).toBe(200);
    expect(res.body.title).toBe(q.title);
    expect(res.body.correct_index).toBe(1);
  });

  it("strips code fences and parses the inner JSON", async () => {
    mockCallLLM.mockResolvedValueOnce({
      provider: "gemini",
      response: { data: { choices: [{ message: { content: "```json\n{\"title\":\"X\",\"question\":\"Q\",\"options\":[\"a\",\"b\",\"c\",\"d\"],\"correct_index\":0,\"difficulty\":\"medium\",\"points\":50,\"solution\":\"s\"}\n```" } }] } },
    });
    const res = await request(buildApp()).get("/api/teacher/generate");
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("X");
  });

  it("504 when the LLM times out (ECONNABORTED)", async () => {
    mockCallLLM.mockRejectedValueOnce(Object.assign(new Error("aborted"), { code: "ECONNABORTED" }));
    const res = await request(buildApp()).get("/api/teacher/generate");
    expect(res.status).toBe(504);
    expect(res.body.error).toMatch(/timed out/i);
  });

  it("502 when the LLM returns a 5xx upstream", async () => {
    const err = new Error("upstream");
    err.response = { status: 502 };
    mockCallLLM.mockRejectedValueOnce(err);
    const res = await request(buildApp()).get("/api/teacher/generate");
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/flaky/i);
  });

  it("500 when the LLM response has no JSON object", async () => {
    mockCallLLM.mockResolvedValueOnce({
      provider: "gemini",
      response: { data: { choices: [{ message: { content: "I cannot help with that." } }] } },
    });
    const res = await request(buildApp()).get("/api/teacher/generate");
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/couldn't parse|try again/i);
  });

  it("500 with a generic message when no text came back at all", async () => {
    mockCallLLM.mockRejectedValueOnce(Object.assign(new Error("no provider"), { code: "NO_LLM_PROVIDER" }));
    const res = await request(buildApp()).get("/api/teacher/generate");
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/failed/i);
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/teacher/save-question — raw supabase insert path
// ════════════════════════════════════════════════════════════

describe("POST /save-question — teacherSaveQuestion", () => {
  const validQ = () => ({
    title: "Derivative",
    question: "What is d/dx of x^3?",
    options: ["3x^2", "x^2", "3x", "x^3"],
    correct_index: 0,
    difficulty: "medium",
    points: 50,
    solution: "Power rule",
  });

  it("400 when the shape is invalid (missing options)", async () => {
    const res = await request(buildApp())
      .post("/api/teacher/save-question")
      .send({ title: "t", question: "q" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it("400 when options array has the wrong length", async () => {
    const res = await request(buildApp())
      .post("/api/teacher/save-question")
      .send({ ...validQ(), options: ["only", "three", "here"] });
    expect(res.status).toBe(400);
  });

  it("201 happy path — org_id explicitly injected into the insert", async () => {
    state.saveReturn = { id: "ch-new", ...validQ(), org_id: "org-A" };
    const res = await request(buildApp())
      .post("/api/teacher/save-question").send(validQ());
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // The controller resolves org_id via req.orgId / session and
    // pastes it onto the insert payload — this is the defence against
    // the null-org_id regression that was the whole reason for this
    // raw-supabase branch.
    expect(state.lastInsert.org_id).toBe("org-A");
    expect(state.lastInsert.difficulty).toBe("medium");
  });

  it("normalises an unknown difficulty string to 'medium' with default 50 points", async () => {
    const res = await request(buildApp())
      .post("/api/teacher/save-question")
      .send({ ...validQ(), difficulty: "GIGASUPREME", points: null });
    expect(res.status).toBe(201);
    expect(state.lastInsert.difficulty).toBe("medium");
    expect(state.lastInsert.points).toBe(50);
  });

  it("500 when the insert errors", async () => {
    state.saveError = { message: "insert boom" };
    const res = await request(buildApp())
      .post("/api/teacher/save-question").send(validQ());
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/insert boom/);
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/teacher/challenges — getTeacherChallenges
// ════════════════════════════════════════════════════════════

describe("GET /challenges — getTeacherChallenges", () => {
  it("returns the list with difficulty upper-cased", async () => {
    state.teacherChallengesList = [
      { id: "ch-1", title: "Q1", difficulty: "easy",   points: 20, is_active: true,  created_at: "t1" },
      { id: "ch-2", title: "Q2", difficulty: null,     points: 50, is_active: false, created_at: "t2" },
    ];
    const res = await request(buildApp()).get("/api/teacher/challenges");
    expect(res.status).toBe(200);
    expect(res.body[0].difficulty).toBe("EASY");
    // null coerces to "medium" → uppercased "MEDIUM"
    expect(res.body[1].difficulty).toBe("MEDIUM");
  });
});

// ════════════════════════════════════════════════════════════
// PATCH /api/teacher/challenges/:id/toggle
// ════════════════════════════════════════════════════════════

describe("PATCH /challenges/:id/toggle — toggleTeacherChallenge", () => {
  it("flips is_active from true → false", async () => {
    state.toggleRow    = { is_active: true };
    state.toggleResult = { is_active: false };
    const res = await request(buildApp()).patch("/api/teacher/challenges/ch-1/toggle");
    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);
  });

  it("500 when the update errors", async () => {
    state.toggleRow   = { is_active: true };
    state.toggleError = { message: "toggle boom" };
    const res = await request(buildApp()).patch("/api/teacher/challenges/ch-1/toggle");
    expect(res.status).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/teacher/leaderboard — getTeacherLeaderboard
// ════════════════════════════════════════════════════════════

describe("GET /leaderboard — getTeacherLeaderboard", () => {
  it("ranks students by xp and fills in default titles", async () => {
    state.studentsList = [
      { name: "Alice", email: "a@x", xp: 500, weekly_xp: 50, title: "Axiom Sage" },
      { name: null,    email: "b@x.edu", xp: 300, weekly_xp: 40, title: null },
    ];
    const res = await request(buildApp()).get("/api/teacher/leaderboard");
    expect(res.status).toBe(200);
    expect(res.body[0].rank).toBe(1);
    expect(res.body[1].rank).toBe(2);
    expect(res.body[1].name).toBe("b"); // derived from email prefix
    expect(res.body[1].title).toBe("Axiom Scout"); // default
  });
});
