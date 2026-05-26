#!/usr/bin/env node
/**
 * scan-bundle-secrets.mjs — fail the build if a server-only secret
 * leaked into the client bundle.
 *
 * Runs after `vite build`. Walks `public/app/assets/` and scans every
 * .js / .css / .html file for two things:
 *
 *   1. Variable NAMES that must never reach the browser (e.g. the
 *      string "SUPABASE_SERVICE_ROLE_KEY" appearing as a literal —
 *      a Vite-replaced reference that wasn't supposed to be there).
 *   2. Real VALUES of those vars (read from process.env, or from
 *      .env.local in dev) — catches accidental copy-paste of an
 *      actual key into source.
 *
 * Exit 1 + a list of findings if anything matches; 0 otherwise.
 * Wired into `npm run build` via the `postbuild` script in package.json.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, "..");
const ASSETS_DIR = path.join(ROOT, "public", "app", "assets");

// Server-side env-var names that should never appear in browser code.
const FORBIDDEN_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SESSION_SECRET",
  "SESSION_DB_URL",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "VAPID_PRIVATE_KEY",
  "CONTACT_APP_PASSWORD",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "SENTRY_AUTH_TOKEN",
];

// Best-effort .env.local loader so a local `npm run build` can value-
// scan against real keys. On CI / Render, process.env is already
// populated and this is a no-op.
function loadDotEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;     // don't override
    process.env[m[1]] = m[2].replace(/^["'](.*)["']$/, "$1");
  }
}
loadDotEnvLocal();

if (!fs.existsSync(ASSETS_DIR)) {
  console.error(`✖ [scan-bundle-secrets] ${ASSETS_DIR} not found — did vite build run?`);
  process.exit(2);
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    // Skip source maps — they aren't served in prod (app.js blocks
    // .map under NODE_ENV=production) and they tend to embed lots of
    // identifier names from third-party libs that would false-positive.
    else if (/\.(js|css|html)$/i.test(entry.name)) acc.push(p);
  }
  return acc;
}

const files = walk(ASSETS_DIR);
const findings = [];

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const name of FORBIDDEN_NAMES) {
    if (text.includes(name)) {
      findings.push({ file: path.relative(ROOT, file), kind: "name", needle: name });
    }
    const value = process.env[name];
    // Guard against trivially short / placeholder values from .env.example.
    if (value && value.length >= 20 && text.includes(value)) {
      findings.push({ file: path.relative(ROOT, file), kind: "value", needle: name });
    }
  }
}

if (findings.length === 0) {
  console.log(`✓ [scan-bundle-secrets] no server-only secrets in ${files.length} files (${path.relative(ROOT, ASSETS_DIR)})`);
  process.exit(0);
}

console.error(`\n✖ [scan-bundle-secrets] ${findings.length} match(es) in the client bundle:\n`);
for (const f of findings) {
  const what = f.kind === "value" ? "ACTUAL VALUE of" : "name reference to";
  console.error(`  ${f.file}  ←  ${what} ${f.needle}`);
}
console.error(`
Server-only secrets must never reach the browser. Fix:
  - remove the import / reference from frontend/src/**
  - if you need a value in the client, rename the env var to VITE_*
    (and confirm it really is safe to expose)
  - rebuild and re-scan.
`);
process.exit(1);
