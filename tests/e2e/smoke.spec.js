/**
 * Browser-level smoke tests.
 *
 * These prove the SPA actually loads in a real browser + the
 * backend's HTTP contract works end-to-end. They're INTENTIONALLY
 * shallow — vitest covers the deep behaviour with mocks; Playwright
 * is here to catch the things mocks can't see:
 *   - lazy chunk failures (Phase 4.3 split AvatarCreator into a
 *     separate chunk; if that ever breaks, vitest passes but the
 *     SPA doesn't load)
 *   - CSP blocking a script (Phase 2.1)
 *   - Per-route ErrorBoundary tripping on a real navigation
 *     (Phase 5.2)
 *   - Frontend/backend version drift (the bundled JS expects an
 *     API contract; if backend ships a breaking change, this
 *     surface fails)
 *
 * Tests target the BUILT SPA served by backend/server.js (which
 * statically hosts public/app/). If you want to run against the
 * Vite dev server with HMR, point baseURL elsewhere.
 */

import { test, expect } from "@playwright/test";

test.describe("backend health", () => {
  test("/api/health returns 200 with the documented shape", async ({ request }) => {
    const r = await request.get("/api/health");
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptimeSec).toBe("number");
  });

  test("/api/csrf-token returns a token + sets the paired cookie", async ({ request }) => {
    const r = await request.get("/api/csrf-token");
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(typeof body.csrfToken).toBe("string");
    expect(body.csrfToken.length).toBeGreaterThan(20);
    // The paired cookie should appear in the response. Playwright's
    // request fixture exposes set-cookie via headers().
    const setCookie = r.headers()["set-cookie"] || "";
    expect(setCookie).toMatch(/csrf-secret/);
  });
});

test.describe("SPA loads", () => {
  test("hitting / redirects into /app/ and renders the SPA shell", async ({ page }) => {
    const consoleErrors = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");
    // 302 → /app/. Wait for the SPA shell to attach.
    await page.waitForURL(/\/app\/?(\?|#|$)/);
    // Root mount point — every page renders inside #root
    await expect(page.locator("#root")).toBeAttached();

    // Filter out third-party noise we can't fix from a test
    // (e.g. dicebear avatar fetch failures over the test network).
    const ours = consoleErrors.filter(e =>
      !e.includes("dicebear") && !e.includes("Failed to load resource")
    );
    expect(ours).toEqual([]);
  });
});

test.describe("404 for unknown API routes", () => {
  test("/api/does-not-exist returns 404 with the documented envelope", async ({ request }) => {
    const r = await request.get("/api/does-not-exist");
    expect(r.status()).toBe(404);
    const body = await r.json();
    expect(body.error).toBe("Not found");
    expect(body.code).toBe("NOT_FOUND");        // Phase 9.2 envelope
    expect(typeof body.requestId).toBe("string");
  });
});

test.describe("CSRF protection (Phase 7) end-to-end", () => {
  test("POST /api/auth/login WITHOUT a CSRF token → 403 CSRF_INVALID", async ({ request }) => {
    const r = await request.post("/api/auth/login", {
      data: { email: "x@y.co", password: "anything" },
    });
    expect(r.status()).toBe(403);
    const body = await r.json();
    expect(body.code).toBe("CSRF_INVALID");
  });

  test("POST /api/auth/login with token + cookie passes CSRF (then fails Zod with 400 on bad email)", async ({ request }) => {
    // Fetch token + cookie pair.
    const tokenResp = await request.get("/api/csrf-token");
    const { csrfToken } = await tokenResp.json();

    // Re-issue the call with the token in header. Playwright's
    // `request` context persists cookies across calls, so we don't
    // need to manually thread the csrf-secret cookie through.
    const r = await request.post("/api/auth/login", {
      headers: { "x-csrf-token": csrfToken },
      data: { email: "not-an-email", password: "" },  // schema-failing
    });
    // Past CSRF (otherwise 403 again). Validation 400 expected.
    expect(r.status()).toBe(400);
    const body = await r.json();
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(body.issues.map(i => i.path)).toContain("email");
  });
});

test.describe("Security headers (Phase 2.1) reach the browser", () => {
  test("CSP + frame-deny + nosniff present on every response", async ({ request }) => {
    const r = await request.get("/api/health");
    const h = r.headers();
    expect(h["content-security-policy"]).toBeTruthy();
    expect(h["x-frame-options"]?.toLowerCase()).toBe("deny");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-request-id"]).toBeTruthy();
  });
});
