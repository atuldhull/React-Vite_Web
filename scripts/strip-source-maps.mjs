#!/usr/bin/env node
/**
 * scripts/strip-source-maps.mjs
 *
 * Postbuild safety net. Deletes every *.map file under public/app/
 * so the production deploy never ships them, regardless of whether
 * the Sentry vite-plugin ran or not.
 *
 * Why this exists:
 *   - vite.config.js uses `sourcemap: "hidden"` so the JS bundles
 *     don't reference the .map files in their `//# sourceMappingURL`
 *     comment.
 *   - When SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT are all
 *     set, the @sentry/vite-plugin uploads the maps to Sentry and
 *     deletes them itself.
 *   - When ANY of those env vars are missing (every local build,
 *     plus every CI / Render deploy that hasn't configured Sentry),
 *     the .map files stay in public/app/assets/ and are reachable
 *     by anyone who guesses the URL pattern.
 *
 * Net result with this script: regardless of env state, no .map
 * files in the deployed bundle. The proprietary source stays out
 * of the public folder.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, "..");
const TARGET     = path.join(ROOT, "public", "app");

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith(".map")) acc.push(full);
  }
  return acc;
}

const maps = walk(TARGET);
if (maps.length === 0) {
  console.log("[strip-source-maps] no .map files in public/app/ — nothing to do");
  process.exit(0);
}

let bytes = 0;
for (const m of maps) {
  try {
    bytes += fs.statSync(m).size;
    fs.unlinkSync(m);
  } catch (err) {
    console.warn(`[strip-source-maps] could not delete ${path.relative(ROOT, m)}: ${err.message}`);
  }
}
const mib = (bytes / 1024 / 1024).toFixed(2);
console.log(`[strip-source-maps] removed ${maps.length} .map files (${mib} MiB) from public/app/`);
