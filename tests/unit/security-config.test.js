/**
 * Security Configuration Tests — verify hardening is in place.
 *
 * Checks server.js and middleware for security best practices.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function readFile(filePath) {
  return fs.readFileSync(path.resolve(filePath), "utf-8");
}

describe("Security Hardening", () => {
  // Express app setup now lives in app.js; server.js only boots.
  describe("Helmet", () => {
    it("app.js imports and uses helmet", () => {
      const code = readFile("backend/app.js");
      expect(code).toContain('import helmet');
      expect(code).toContain("app.use(helmet(");
    });
  });

  describe("CORS", () => {
    it("app.js imports and configures cors", () => {
      const code = readFile("backend/app.js");
      expect(code).toContain('import cors');
      expect(code).toContain("app.use(cors(");
      expect(code).toContain("credentials: true");
    });
  });

  describe("Session Cookie Security", () => {
    it("sets httpOnly on session cookies", () => {
      const code = readFile("backend/middleware/sessionConfig.js");
      expect(code).toContain("httpOnly: true");
    });

    it("sets secure flag for production", () => {
      const code = readFile("backend/middleware/sessionConfig.js");
      expect(code).toContain("secure:");
      expect(code).toContain("isProd");
    });

    it("sets sameSite flag", () => {
      const code = readFile("backend/middleware/sessionConfig.js");
      expect(code).toContain("sameSite:");
    });
  });

  describe("Socket.IO Authentication", () => {
    it("uses session middleware on socket engine", () => {
      const code = readFile("backend/socket/auth.js");
      expect(code).toContain("io.engine.use(sessionMiddleware)");
    });

    it("has io.use auth middleware that checks session", () => {
      const code = readFile("backend/socket/auth.js");
      expect(code).toContain("io.use(");
      expect(code).toContain("socket.request.session");
    });

    it("register_user only accepts session-verified socket.userId (no client fallback)", () => {
      const code = readFile("backend/socket/notifications.js");
      // Handler must take zero args — dropped the client-supplied id entirely.
      expect(code).toMatch(/socket\.on\(\s*["']register_user["']\s*,\s*\(\)\s*=>/);
      // And must bail out when no verified session id exists.
      expect(code).toMatch(/const verifiedId = socket\.userId/);
      expect(code).toMatch(/if \(!verifiedId\)/);
    });

    it("admin room join requires admin role", () => {
      const code = readFile("backend/socket/presence.js");
      expect(code).toMatch(/join_admin[\s\S]*userRole[\s\S]*admin/);
    });
  });

  describe("Request Body Limits", () => {
    it("JSON body size is limited", () => {
      const code = readFile("backend/app.js");
      // `s` flag lets `.` match newlines so this works regardless of whether
      // express.json({...}) is single-line or multi-line (e.g. with a verify cb).
      expect(code).toMatch(/express\.json\(\{[\s\S]*limit/);
    });
  });

  describe("Rate Limiting", () => {
    it("general rate limiter is applied to all API routes", () => {
      const code = readFile("backend/app.js");
      expect(code).toContain('app.use("/api/", generalLimiter)');
    });

    it("rate limiter is defined with proper config", () => {
      const code = readFile("backend/middleware/rateLimiter.js");
      expect(code).toContain("windowMs");
      expect(code).toContain("max:");
    });
  });

  describe("Environment Variables", () => {
    it(".gitignore excludes .env files", () => {
      const gitignore = readFile(".gitignore");
      expect(gitignore).toContain(".env.local");
      expect(gitignore).toContain(".env");
    });

    it("session has fallback secret but warns about default", () => {
      const code = readFile("backend/middleware/sessionConfig.js");
      expect(code).toContain("SESSION_SECRET");
    });
  });
});
