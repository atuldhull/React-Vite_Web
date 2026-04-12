/**
 * Route Security Tests — verify all sensitive routes have auth middleware.
 *
 * Reads the actual route files and checks that protected endpoints
 * include requireAuth/requireTeacher/requireAdmin/requireSuperAdmin.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROUTES_DIR = path.resolve("backend/routes");

function readRoute(filename) {
  return fs.readFileSync(path.join(ROUTES_DIR, filename), "utf-8");
}

describe("Route Security — Auth Middleware", () => {
  it("admin routes require requireAdmin on all endpoints", () => {
    const code = readRoute("adminRoutes.js");
    expect(code).toContain("router.use(requireAdmin)");
  });

  it("super admin routes require requireSuperAdmin", () => {
    const code = readRoute("superAdminRoutes.js");
    expect(code).toContain("requireSuperAdmin");
  });

  it("teacher routes require requireTeacher on all endpoints", () => {
    const code = readRoute("teacherRoutes.js");
    expect(code).toContain("router.use(requireTeacher)");
  });

  it("org admin routes require requireAdmin", () => {
    const code = readRoute("orgAdminRoutes.js");
    expect(code).toContain("requireAdmin");
  });

  it("event registration requires requireAuth", () => {
    const code = readRoute("eventRoutes.js");
    expect(code).toMatch(/register.*requireAuth/s);
  });

  it("event creation requires requireTeacher", () => {
    const code = readRoute("eventRoutes.js");
    expect(code).toMatch(/post\("\/",\s*requireTeacher/);
  });

  it("QR scan requires requireTeacher + checkFeatureFlag", () => {
    const code = readRoute("eventRoutes.js");
    expect(code).toContain('checkFeatureFlag("qr_checkin")');
    expect(code).toMatch(/scan-qr.*requireTeacher/s);
  });

  it("AI generation is gated behind ai_tools feature flag", () => {
    const code = readRoute("teacherRoutes.js");
    expect(code).toContain('checkFeatureFlag("ai_tools")');
  });

  it("certificate creation is gated behind certificates feature flag", () => {
    const code = readRoute("certificateRoutes.js");
    expect(code).toContain('checkFeatureFlag("certificates")');
  });

  it("data export is gated behind data_export feature flag", () => {
    const code = readRoute("adminRoutes.js");
    expect(code).toContain('checkFeatureFlag("data_export")');
  });

  it("insights are gated behind analytics feature flag", () => {
    const code = readRoute("insightsRoutes.js");
    expect(code).toContain('checkFeatureFlag("analytics")');
  });

  it("comment posting requires requireAuth", () => {
    const code = readRoute("commentRoutes.js");
    expect(code).toContain("requireAuth");
  });

  it("arena submission requires auth check in controller (session-based)", () => {
    const controller = fs.readFileSync(
      path.resolve("backend/controllers/arenaController.js"),
      "utf-8"
    );
    expect(controller).toContain("req.session?.user?.id");
    expect(controller).toContain('status(401)');
  });
});
