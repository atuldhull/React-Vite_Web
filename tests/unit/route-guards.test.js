/**
 * Route-guard invariant test.
 *
 * Statically scans each backend/routes/*.js file, extracts every
 * `router.<method>(path, ...middleware, handler)` declaration, and
 * asserts that critical mount areas carry the right guards.
 *
 * Why a static scan rather than walking the live Express router:
 *   - Express 5 buried the mount-path string inside a closure on
 *     each layer, so introspecting the stack to recover "what URL
 *     is this route actually mounted at" is fragile.
 *   - The static scan reads the SAME source code a reviewer reads,
 *     so an asserted violation maps directly to a file:line a
 *     contributor can fix.
 *   - Same pattern as tests/unit/tenant-scoping-invariant.test.js
 *     (Phase 2.2.5) — proven shape, easy to extend.
 *
 * What it checks:
 *   - Every route declared in routes/superAdminRoutes.js carries
 *     `requireSuperAdmin` (either explicitly on the route or via a
 *     router.use(...) above the routes).
 *   - Routes in routes/orgAdminRoutes.js carry `requireAdmin` (or
 *     stronger).
 *   - Routes in routes/teacherRoutes.js carry `requireTeacher` (or
 *     stronger).
 *   - Payment mutation routes (everything except /plans GET and
 *     /webhook POST) carry `requireAdmin` (or stronger).
 *
 * Limitations:
 *   - Checks middleware NAMES, not behaviour. A middleware named
 *     `requireAdmin` that does nothing would pass — but writing such
 *     a middleware would also break every admin endpoint, which the
 *     existing integration tests catch.
 *   - String-based — assumes contributors don't rename
 *     requireAdmin/etc. on import. If they do, this test fails fast.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROUTES_DIR = path.resolve("backend/routes");

/**
 * Parse the route declarations + any router.use(...) at the top of a
 * route file. Returns:
 *   {
 *     mountWide: string[],  // middleware names from `router.use(...)` (apply to ALL routes in this file)
 *     routes: [{ method, path, middleware: string[] }]
 *   }
 */
function parseRouteFile(file) {
  const src = fs.readFileSync(file, "utf8");
  const result = { mountWide: [], routes: [] };

  // Strip block comments + line comments to avoid false matches in docs.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");

  // router.use(req...) — anything passed before/around routes that
  // applies wide. Catches:
  //    router.use(requireAdmin, injectTenant)
  //    router.use("/", requireSuperAdmin)
  //    router.use(requireAuth);
  for (const m of stripped.matchAll(/router\.use\(([^)]*)\)/g)) {
    const argsRaw = m[1];
    // Extract bare identifiers; ignore string-literal mount paths
    // ("/", "/api"). We're after middleware names like requireAdmin.
    const ids = argsRaw
      .split(",")
      .map(s => s.trim())
      .filter(s => /^[A-Za-z_$][\w$]*$/.test(s));
    result.mountWide.push(...ids);
  }

  // router.get/post/put/patch/delete("/path", mw1, mw2, ..., handler)
  // We want everything between the path and the LAST argument (handler).
  const routeRe = /router\.(get|post|put|patch|delete)\(\s*(["'][^"']+["'])\s*,\s*([^)]*)\)/g;
  for (const m of stripped.matchAll(routeRe)) {
    const method = m[1].toUpperCase();
    const pathLit = m[2].slice(1, -1);
    const argsRaw = m[3];

    // Split on commas at top level. Our route files don't pass
    // object literals here, so a naive split is fine.
    const args = argsRaw.split(",").map(s => s.trim()).filter(Boolean);

    // The last arg is the handler; everything before is middleware.
    // Extract names (handle `validateBody(schema)` shape too — the
    // CALL itself isn't a guard but its argument might be informative).
    const middleware = args.slice(0, -1).map(a => {
      const id = a.match(/^([A-Za-z_$][\w$]*)/);
      return id ? id[1] : a;
    });

    result.routes.push({ method, path: pathLit, middleware });
  }

  return result;
}

const FILES_TO_SCAN = fs.readdirSync(ROUTES_DIR)
  .filter(f => f.endsWith("Routes.js"))
  .map(f => path.join(ROUTES_DIR, f));

const allParsed = FILES_TO_SCAN.map(file => ({
  file,
  rel:    path.relative(process.cwd(), file).split(path.sep).join("/"),
  parsed: parseRouteFile(file),
}));

// ════════════════════════════════════════════════════════════
// Sanity — parser actually finds something
// ════════════════════════════════════════════════════════════

describe("route-guards parser sanity", () => {
  it("finds at least one route declaration in each route file", () => {
    for (const { rel, parsed } of allParsed) {
      const totalRoutes = parsed.routes.length;
      // The parser should find at least one route per file. (Some
      // files use `router.use(subRouter)` exclusively — exempt those.
      // Currently every file has at least one router.<verb>().)
      if (totalRoutes === 0) {
        console.warn(`  no routes parsed from ${rel} — parser may need an update`);
      }
    }
    // Aggregate sanity: total across all files > 50.
    const total = allParsed.reduce((sum, p) => sum + p.parsed.routes.length, 0);
    expect(total).toBeGreaterThan(50);
  });
});

// ════════════════════════════════════════════════════════════
// Per-file guard expectations
// ════════════════════════════════════════════════════════════

function file(name) {
  return allParsed.find(p => p.rel.endsWith(name));
}

function violations({ rel, parsed }, hasGuard) {
  const wide = new Set(parsed.mountWide);
  return parsed.routes
    .filter(r => !hasGuard(new Set([...wide, ...r.middleware])))
    .map(r => `  ${rel}: ${r.method} ${r.path}  (middleware: ${["[wide:" + [...wide].join(",") + "]", ...r.middleware].join(", ")})`);
}

describe("Route-guard audit — per-file invariants", () => {
  it("superAdminRoutes.js: every route is guarded by requireSuperAdmin", () => {
    const f = file("superAdminRoutes.js");
    expect(f).toBeDefined();
    const v = violations(f, mw => mw.has("requireSuperAdmin"));
    if (v.length) throw new Error("requireSuperAdmin missing on:\n" + v.join("\n"));
    expect(v).toEqual([]);
  });

  it("orgAdminRoutes.js: every route is guarded by requireAdmin (or stronger)", () => {
    const f = file("orgAdminRoutes.js");
    expect(f).toBeDefined();
    const v = violations(f, mw => mw.has("requireAdmin") || mw.has("requireSuperAdmin"));
    if (v.length) throw new Error("requireAdmin missing on:\n" + v.join("\n"));
    expect(v).toEqual([]);
  });

  it("teacherRoutes.js: every route is guarded by requireTeacher (or stronger)", () => {
    const f = file("teacherRoutes.js");
    expect(f).toBeDefined();
    const v = violations(f, mw =>
      mw.has("requireTeacher") || mw.has("requireAdmin") || mw.has("requireSuperAdmin")
    );
    if (v.length) throw new Error("requireTeacher missing on:\n" + v.join("\n"));
    expect(v).toEqual([]);
  });

  it("paymentRoutes.js: mutation routes are admin-gated (plans GET + webhook POST exempted)", () => {
    const f = file("paymentRoutes.js");
    expect(f).toBeDefined();
    const PUBLIC = new Set([
      "GET /plans",
      "POST /webhook",
    ]);
    const v = violations(f, (mw) => true);  // pass-through; we'll re-filter below
    // Custom: only check routes NOT in PUBLIC.
    const wide = new Set(f.parsed.mountWide);
    const real = f.parsed.routes
      .filter(r => !PUBLIC.has(`${r.method} ${r.path}`))
      .filter(r => {
        const all = new Set([...wide, ...r.middleware]);
        return !(all.has("requireAdmin") || all.has("requireSuperAdmin"));
      })
      .map(r => `  paymentRoutes.js: ${r.method} ${r.path}  (middleware: ${[...wide, ...r.middleware].join(", ")})`);
    if (real.length) throw new Error("payment mutation routes missing requireAdmin:\n" + real.join("\n"));
    expect(real).toEqual([]);
    // Ensure the test isn't a no-op — file should have parsed multiple routes.
    expect(f.parsed.routes.length).toBeGreaterThan(2);
    expect(v).toBeDefined();  // satisfy the dummy `violations` call above
  });
});
