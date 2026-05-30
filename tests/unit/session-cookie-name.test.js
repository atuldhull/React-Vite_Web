/**
 * Pinning tests for the session cookie name.
 *
 * Prompt-5 hardening renamed the cookie from the express-session default
 * 'connect.sid' to a neutral 'sid'. These tests pin both ends of that
 * contract so a future refactor can't drift them apart:
 *
 *   1. sessionConfig exports SESSION_COOKIE_NAME = "sid".
 *   2. authController's logout still uses clearCookie on the SAME name.
 *      (If sessionConfig is renamed without touching authController, the
 *      browser keeps an orphan dead cookie and "logout" is a half-truth.)
 *
 * We assert against the source text for the controller because import-
 * time side effects (Supabase client creation) would otherwise drag in
 * a network-spying mess we don't need for a string-equality check.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { SESSION_COOKIE_NAME } from "../../backend/middleware/sessionConfig.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const authControllerPath = path.resolve(here, "../../backend/controllers/authController.js");
const authControllerSrc  = readFileSync(authControllerPath, "utf8");

describe("session cookie name", () => {
  it("SESSION_COOKIE_NAME is 'sid' (not the default 'connect.sid')", () => {
    expect(SESSION_COOKIE_NAME).toBe("sid");
  });

  it("authController.logout clearCookie uses the SESSION_COOKIE_NAME constant", () => {
    expect(authControllerSrc).toMatch(/clearCookie\(SESSION_COOKIE_NAME\)/);
  });

  it("authController never hard-codes the old 'connect.sid' name", () => {
    expect(authControllerSrc).not.toMatch(/connect\.sid/);
  });
});
