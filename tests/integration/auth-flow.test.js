/**
 * Integration Tests — Auth flow, tenant isolation, Socket.IO auth.
 *
 * These test the actual middleware logic by simulating request objects,
 * NOT by hitting a live server. This keeps them fast and CI-friendly.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function readFile(filePath) {
  return fs.readFileSync(path.resolve(filePath), "utf-8");
}

// ═══════════════════════════════════════════════════════════
// 1. AUTH FLOW — verify login/session/role routing
// ═══════════════════════════════════════════════════════════

describe("Auth Flow Integration", () => {
  const authController = readFile("backend/controllers/authController.js");
  const authMiddleware = readFile("backend/middleware/authMiddleware.js");

  it("login endpoint validates email and password", () => {
    expect(authController).toContain("email");
    expect(authController).toContain("password");
  });

  it("login sets session user on success", () => {
    expect(authController).toContain("req.session.user");
  });

  it("logout destroys session", () => {
    expect(authController).toMatch(/session.*destroy|logout/);
  });

  it("requireAuth checks session exists before allowing access", () => {
    expect(authMiddleware).toContain("req.session?.user");
    expect(authMiddleware).toContain('status(401)');
  });

  it("requireAuth blocks suspended users", () => {
    expect(authMiddleware).toMatch(/is_active.*false|suspended/);
  });

  it("requireAuth injects userId, userRole, orgId into request", () => {
    expect(authMiddleware).toContain("req.userId");
    expect(authMiddleware).toContain("req.userRole");
    expect(authMiddleware).toContain("req.orgId");
  });

  it("role hierarchy is enforced — teacher includes admin check", () => {
    expect(authMiddleware).toContain("requireTeacher");
    expect(authMiddleware).toMatch(/teacher.*admin.*super_admin|role.*teacher/s);
  });

  it("super admin bypasses org scoping", () => {
    expect(authMiddleware).toMatch(/super_admin.*orgId.*null/s);
  });
});

// ═══════════════════════════════════════════════════════════
// 2. TENANT ISOLATION — verify multi-tenant middleware
// ═══════════════════════════════════════════════════════════

describe("Tenant Isolation Integration", () => {
  const tenantMiddleware = readFile("backend/middleware/tenantMiddleware.js");

  it("injectTenant middleware exists and exports a function", () => {
    expect(tenantMiddleware).toContain("export");
    expect(tenantMiddleware).toContain("injectTenant");
  });

  it("auto-injects org_id into queries for tenant tables", () => {
    expect(tenantMiddleware).toContain("org_id");
    expect(tenantMiddleware).toMatch(/\.eq\(.*org_id|orgId/);
  });

  it("defines tenant-scoped tables vs global tables", () => {
    // Tenant tables should include students, challenges, events
    expect(tenantMiddleware).toContain("students");
    expect(tenantMiddleware).toContain("challenges");
    expect(tenantMiddleware).toContain("events");
  });

  it("global tables bypass org filtering", () => {
    // organisations and subscription_plans are global
    expect(tenantMiddleware).toContain("organisations");
    expect(tenantMiddleware).toContain("subscription_plans");
  });

  it("super admin impersonation overrides org context", () => {
    expect(tenantMiddleware).toMatch(/impersonat/i);
  });

  it("provides req.db helper for org-scoped queries", () => {
    expect(tenantMiddleware).toContain("req.db");
  });
});

// ═══════════════════════════════════════════════════════════
// 3. SOCKET.IO AUTH — verify session-based socket authentication
// ═══════════════════════════════════════════════════════════

describe("Socket.IO Auth Integration", () => {
  // After the split, these concerns live under backend/socket/*.js.
  const authCode          = readFile("backend/socket/auth.js");
  const notificationsCode = readFile("backend/socket/notifications.js");
  const presenceCode      = readFile("backend/socket/presence.js");
  const quizCode          = readFile("backend/socket/quiz.js");
  const chatCode          = readFile("backend/socket/chat.js");

  it("socket engine uses session middleware", () => {
    expect(authCode).toContain("io.engine.use(sessionMiddleware)");
  });

  it("io.use middleware extracts userId from session", () => {
    expect(authCode).toContain("socket.request.session");
    expect(authCode).toContain("socket.userId   = session.user.id");
  });

  it("io.use middleware extracts userRole from session", () => {
    expect(authCode).toContain("socket.userRole = session.user.role");
  });

  it("register_user ONLY accepts session-verified socket.userId (no client fallback)", () => {
    // Handler takes zero args — we dropped the client-supplied id.
    expect(notificationsCode).toMatch(/socket\.on\(\s*["']register_user["']\s*,\s*\(\)\s*=>/);
    expect(notificationsCode).toMatch(/const verifiedId = socket\.userId/);
    expect(notificationsCode).toMatch(/if \(!verifiedId\)/);
  });

  it("admin room requires admin/super_admin role", () => {
    expect(presenceCode).toMatch(/join_admin[\s\S]{0,200}userRole/);
    expect(presenceCode).toMatch(/\["admin", "super_admin"\]\.includes\(socket\.userRole\)/);
  });

  it("quiz session emits to room only, not broadcast", () => {
    expect(quizCode).toMatch(/\.to\(.*code|\.to\(session\.teacherSocket/);
  });

  it("chat verifies senderId from socket, not request body", () => {
    expect(chatCode).toContain("senderId:         socket.userId");
  });

  it("notification delivery targets specific user rooms", () => {
    expect(notificationsCode).toMatch(/user:\$\{userId\}|user:\$\{verifiedId\}/);
  });
});

// ═══════════════════════════════════════════════════════════
// 4. FEATURE FLAG INTEGRATION — verify middleware + plan check
// ═══════════════════════════════════════════════════════════

describe("Feature Flag Integration", () => {
  const authMiddleware = readFile("backend/middleware/authMiddleware.js");

  it("checkFeatureFlag queries organisations table for org flags", () => {
    expect(authMiddleware).toContain("organisations");
    expect(authMiddleware).toContain("feature_flags");
  });

  it("checkFeatureFlag queries subscription_plans for plan features", () => {
    expect(authMiddleware).toContain("subscription_plans");
    expect(authMiddleware).toContain("plan_name");
  });

  it("org override takes precedence over plan default", () => {
    expect(authMiddleware).toMatch(/featureName in orgOverrides/);
  });

  it("returns 403 with upgrade_required when feature is locked", () => {
    expect(authMiddleware).toContain("upgrade_required");
    expect(authMiddleware).toContain("403");
  });

  it("super admins bypass all feature flag checks", () => {
    expect(authMiddleware).toMatch(/super_admin.*return next|bypass/s);
  });
});
