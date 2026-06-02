/**
 * Codebase invariant: no controller reaches for `supabase.from("X")`
 * where X is a TENANT_TABLE outside of an explicit allowlist.
 *
 * This is intentionally a static-source check — the kind of test we
 * normally avoid because it tells you about characters in the file
 * rather than behaviour. The justification here: it's enforcing an
 * ARCHITECTURAL INVARIANT, not a feature ("all reads of tenant
 * tables go through the org-scoped Proxy"). A regression here is a
 * potential cross-org data leak in production, and behaviour-level
 * tests for every controller would be 8+ separate files of mock
 * setup. One source-grep covers them all.
 *
 * The allowlist captures the small number of legitimate exceptions:
 *   - authController.js: auth flows run before req.session exists
 *   - userController.js syncTitle: helper without request context
 *   - notificationController.js sendNotification: helper without req
 *   - admin/dataExport.js: tables not in TENANT_TABLES
 *   - orgAdminController.js: GLOBAL_TABLES (organisations, plans)
 *
 * If a future PR adds a new legitimate exception, ADD IT TO THE
 * ALLOWLIST WITH A COMMENT EXPLAINING WHY. The whole point is that
 * adding a bypass is a deliberate, reviewable act.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Mirrors backend/middleware/tenantMiddleware.js TENANT_TABLES.
// Kept as a duplicate intentionally — if someone updates the runtime
// list, they'll see this test fail until they update the test too.
// That's a feature: the contract is "these tables are tenant-scoped".
const TENANT_TABLES = new Set([
  "students", "challenges", "events", "arena_attempts", "announcements",
  "notifications", "certificate_batches", "certificates",
  "scheduled_tests", "test_attempts", "teams", "projects",
  "project_votes", "weekly_winners", "org_invitations",
]);

// Files where one or more raw `supabase.from(<tenant>)` calls is
// LEGITIMATE. Each entry needs a one-line `why` explaining the
// exception so a future reader can audit it.
const ALLOWLIST = [
  {
    file: "backend/controllers/authController.js",
    why:  "auth flows (register/login) run before req.session — req.orgId is undefined; org_id is sourced explicitly from invitations or default org",
  },
  {
    file: "backend/controllers/userController.js",
    why:  "syncTitle(userId, xp) helper has no req context; user_id alone is unique across orgs (auth.users)",
  },
  {
    file: "backend/controllers/notificationController.js",
    why:  "sendNotification helper falls back to looking up recipient's org_id when no orgId is passed",
  },
  {
    file: "backend/controllers/admin/dataExport.js",
    why:  "exports include tables not in TENANT_TABLES (event_registrations, achievements, etc.); tenant tables in this file all use req.db",
  },
  {
    file: "backend/controllers/superAdmin/organisations.js",
    why:  "super-admin platform tooling: list/create/suspend orgs intrinsically operates across orgs (the platform admin view), so org_id scoping would be wrong",
  },
  {
    file: "backend/controllers/superAdmin/analytics.js",
    why:  "platform-wide analytics: aggregates across every org for the super-admin dashboard",
  },
  {
    file: "backend/controllers/statsController.js",
    why:  "GET /api/stats/public — public homepage hero stats; intentionally platform-wide aggregates, no req context",
  },
  {
    file: "backend/controllers/healthController.js",
    why:  "GET /api/ready readiness probe — system connectivity check, not a user-facing data read",
  },
  {
    file: "backend/controllers/certificate/verify.js",
    why:  "GET /api/certificates/verify/:token — public certificate verification, no auth, intentionally cross-tenant (a prospective employer scanning the QR doesn't know which org issued the cert). Exposes only display-safe fields (recipient name, event, date, issuer) — never email or batch metadata.",
  },
  {
    file: "backend/controllers/certificate/batch.js",
    why:  "POST /api/certificates/create writes certificate_batches + certificates via raw supabase with explicit org_id. The req.db proxy was producing intermittent 'null value in column org_id' errors in prod despite session having org_id correctly set; bypassing the proxy and supplying org_id manually + an early 400 if no org_id on the session removes that fragility. Service-role bypasses RLS so no isolation lost.",
  },
  {
    file: "backend/controllers/teacherController.js",
    why:  "POST /api/teacher/save-question writes to `challenges` via raw supabase with explicit org_id. Same rationale as certificate/batch.js — the proxy's intermittent null-org_id on inserts was 500'ing Extreme-difficulty saves in prod. Read paths (getStats, getChallenges, etc.) still use req.db for org scoping.",
  },
  {
    file: "backend/controllers/challengeController.js",
    why:  "POST /api/challenge (createChallenge, admin-only) writes to `challenges` via raw supabase with explicit org_id for the same reason as teacherController.js — admin bank saves from AdminChallengesPage were failing with 500s when the proxy's org_id injection dropped. All read / update / delete paths in the file still use req.db.",
  },
  {
    file: "backend/controllers/event/achievementController.js",
    why:  "checkEventAchievements/checkWinAchievements helpers take only userId (no req); user_id comes from auth.users which is unique across orgs, so user_id-filtered student updates are safe without org_id scoping",
  },
  {
    file: "backend/controllers/problemController.js",
    why:  "problem_statements is platform-wide and org_id-less by design (migration 31 — cross-tenant catalogue). The engagement endpoints look up name/avatar from `students` cross-tenant to render writeup authors / interest avatars; this is intentional (a SIH problem is the same problem for every org, so showing a name + avatar from another org on its detail page is correct). Daily-checkin updates the viewer's own student row via user_id, which is unique across orgs.",
  },
  {
    file: "backend/controllers/portfolioController.js",
    why:  "Public portfolio (/u/:handle) is internet-public by design. It deliberately reads `students`, `teams`, `projects`, `certificates` cross-tenant — the whole point of /u/:handle is that a LinkedIn recruiter (no session, no org) can view a student's work. Per-handle resolution + the public_portfolio opt-in flag provide the privacy layer; org-scoping would defeat the feature.",
  },
  {
    file: "backend/controllers/bookmarkController.js",
    why:  "Bookmarks enrich saved rows with target metadata across `problem_statements` (cross-tenant catalogue), `problem_writeups` (cross-tenant engagement), and `roadmaps` (cross-tenant). Bookmarks themselves are keyed by user_id which is unique across orgs. The enrichment reads on `problem_statements` are catalogue lookups, not tenant data; no org_id field exists on those tables to scope by.",
  },
  {
    file: "backend/controllers/roadmapController.js",
    why:  "Roadmaps are cross-tenant by design (migration 37 — same data-plane policy as problem_statements). Author lookups touch `students` cross-tenant because a featured roadmap by a student in org A should be visible to a student in org B with author attribution intact. Ownership is enforced by author_id match in-controller; submission_status gates public visibility.",
  },
  {
    file: "backend/controllers/problemSubmissionController.js",
    why:  "Problem submissions feed into the cross-tenant catalogue on approval. submitter_id is the only tenant-scopable column, but we deliberately allow any org's student to contribute to the platform-wide catalogue. The approve-into-`problem_statements` write inherits the catalogue's cross-tenant policy; org-scoping the submitter lookup would prevent admins of any one org from moderating the queue.",
  },
  {
    file: "backend/controllers/searchController.js",
    why:  "Global Ctrl+K palette searches the cross-tenant catalogue (problem_statements, roadmaps, problem_writeups) plus public portfolios. The `students` read is gated on public_portfolio=true — same opt-in privacy contract as portfolioController. Cross-tenant is intentional: a student should be able to find a public-portfolio holder in another org via search, the same way they can already reach /u/:handle directly.",
  },
  {
    file: "backend/controllers/writeupCommentController.js",
    why:  "writeup_comments hangs off problem_writeups, which is platform-wide (migration 35, no org_id). The `students` lookups are for author display name + avatar on the comment cards — same cross-tenant intent as the writeup author rendering in problemController. A student from org A commenting on an org B student's writeup is correct: the problem is the same problem for every org.",
  },
  {
    file: "backend/controllers/sprintController.js",
    why:  "Solution Sprints are platform-wide (migration 43): one featured problem per week, every org sees the same sprint. The leaderboard reads problem_writeups + writeup_votes (both cross-tenant) and `students` to render author display name + avatar + public handle — same cross-tenant rendering contract as problemController's writeup author surface.",
  },
];

const ALLOWED_FILES = new Set(ALLOWLIST.map(a => a.file));

function listControllerFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listControllerFiles(full, acc);
    else if (e.name.endsWith(".js")) acc.push(full);
  }
  return acc;
}

function repoRel(p) {
  // Normalise to forward slashes regardless of OS so the allowlist
  // entries stay portable across Windows / *nix dev machines.
  return path.relative(process.cwd(), p).split(path.sep).join("/");
}

describe("Codebase invariant: tenant tables only via req.db", () => {
  it("no controller has supabase.from(<TENANT_TABLE>) outside the allowlist", () => {
    const files = listControllerFiles(path.resolve("backend/controllers"));
    const violations = [];

    for (const file of files) {
      const rel = repoRel(file);
      if (ALLOWED_FILES.has(rel)) continue;

      const src   = fs.readFileSync(file, "utf8");
      const lines = src.split("\n");
      // Match: `supabase.from("X")` and `supabase\n.from("X")` styles.
      // We strip newlines then match a single-line regex over the
      // joined text, but we still want line numbers — so iterate by
      // line and look for the single-line variant first, then a
      // 2-line lookahead for the chained style.
      lines.forEach((ln, i) => {
        const m1 = ln.match(/supabase\s*\.\s*from\(\s*["']([a-z_]+)["']/);
        if (m1 && TENANT_TABLES.has(m1[1])) {
          violations.push(`  ${rel}:${i + 1}  supabase.from("${m1[1]}") — tenant table, must use req.db`);
          return;
        }
        // Multi-line: `supabase` on this line, `.from("X")` on next.
        if (/supabase\s*$/.test(ln) && lines[i + 1]) {
          const m2 = lines[i + 1].match(/^\s*\.\s*from\(\s*["']([a-z_]+)["']/);
          if (m2 && TENANT_TABLES.has(m2[1])) {
            violations.push(`  ${rel}:${i + 1}  supabase\\n.from("${m2[1]}") — tenant table, must use req.db`);
          }
        }
      });
    }

    if (violations.length > 0) {
      const msg = [
        "Found raw supabase.from() calls on tenant tables in non-allowlisted controllers:",
        ...violations,
        "",
        "If this is intentional (helper without req, auth flow, etc.), add",
        "the file path to the ALLOWLIST in this test with a `why` comment.",
        "Otherwise: convert to req.db.from() so the Proxy auto-scopes by org_id.",
      ].join("\n");
      throw new Error(msg);
    }

    expect(violations).toEqual([]);
  });

  it("ALLOWLIST entries all reference files that exist (no stale entries)", () => {
    const missing = ALLOWLIST.filter(a => !fs.existsSync(path.resolve(a.file)));
    if (missing.length) {
      throw new Error(
        "Stale ALLOWLIST entries (files no longer exist):\n" +
          missing.map(a => "  " + a.file).join("\n")
      );
    }
    expect(missing).toEqual([]);
  });
});
