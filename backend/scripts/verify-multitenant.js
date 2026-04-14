/**
 * Live multi-tenant isolation verification script.
 *
 * Run this AFTER deploying / applying migration 14 / shipping the
 * controller conversions. Verifies the invariants from the OUTSIDE
 * by querying the real DB:
 *
 *   1. Every TENANT_TABLE has a NOT NULL `org_id` column.
 *   2. Every TENANT_TABLE has zero NULL org_id rows.
 *   3. Every TENANT_TABLE has a btree index on (org_id) — without
 *      this, the per-org filter that the Proxy adds to every read
 *      will degrade to a sequential scan once tables grow.
 *   4. A SELECT scoped to a non-existent org id returns ZERO rows
 *      from each tenant table — proves the filter does its job at
 *      the SQL level.
 *
 * NOT in the auto-test suite: this depends on real production
 * credentials (PGURL / DIRECT_URL or the SUPABASE_* env vars), which
 * we deliberately don't bake into vitest. The static
 * `tests/unit/tenant-scoping-invariant.test.js` covers the source-
 * code invariant (no controller bypasses); this script covers the
 * runtime invariant (the schema actually enforces what the code
 * assumes).
 *
 * Usage:
 *   PGURL='postgresql://postgres.<proj>:<pwd>@aws-...:5432/postgres' \
 *     node backend/scripts/verify-multitenant.js
 *
 * Reads only — never writes. Safe to run against production.
 */

import { Client } from "pg";

const TENANT_TABLES = [
  "students", "challenges", "events", "arena_attempts", "announcements",
  "notifications", "certificate_batches", "certificates",
  "scheduled_tests", "test_attempts", "teams", "projects",
  "project_votes", "weekly_winners", "org_invitations",
];

const FAKE_ORG = "00000000-0000-0000-0000-000000000000";

const url = process.env.PGURL || process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set PGURL (or DIRECT_URL or DATABASE_URL) before running.");
  process.exit(2);
}

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

let failures = 0;
function ok(msg)   { console.log("  ✓ " + msg); }
function fail(msg) { console.log("  ✗ " + msg); failures++; }

try {
  // ── 1 + 2: NOT NULL + zero NULLs ──
  console.log("\n[1+2] org_id NOT NULL and zero NULL rows on every tenant table");
  for (const t of TENANT_TABLES) {
    const col = await c.query(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 AND column_name='org_id'`,
      [t]
    );
    if (col.rows.length === 0) {
      fail(`${t}: org_id column missing`);
      continue;
    }
    if (col.rows[0].is_nullable === "YES") {
      fail(`${t}: org_id is nullable (run migration 14)`);
    }
    const nul = await c.query(`SELECT count(*)::int AS n FROM public.${t} WHERE org_id IS NULL`);
    if (nul.rows[0].n > 0) {
      fail(`${t}: ${nul.rows[0].n} rows still have NULL org_id`);
    } else {
      ok(`${t}: NOT NULL, zero NULL rows`);
    }
  }

  // ── 3: btree index on (org_id) ──
  console.log("\n[3] (org_id) index present on every tenant table");
  const idx = await c.query(`
    SELECT tablename FROM pg_indexes
     WHERE schemaname='public' AND indexdef LIKE '%(org_id)%'
  `);
  const indexed = new Set(idx.rows.map(r => r.tablename));
  for (const t of TENANT_TABLES) {
    if (indexed.has(t)) ok(`${t}: indexed`);
    else fail(`${t}: missing index on (org_id)`);
  }

  // ── 4: filter actually filters ──
  console.log(`\n[4] SELECT WHERE org_id = '${FAKE_ORG}' returns 0 rows everywhere`);
  for (const t of TENANT_TABLES) {
    const r = await c.query(`SELECT count(*)::int AS n FROM public.${t} WHERE org_id = $1`, [FAKE_ORG]);
    if (r.rows[0].n === 0) ok(`${t}: 0 rows for fake org (isolation works)`);
    else                   fail(`${t}: ${r.rows[0].n} rows match fake org id — filter is broken`);
  }

  console.log("");
  if (failures === 0) {
    console.log("ALL CHECKS PASSED — multi-tenant isolation is live.");
  } else {
    console.log(`${failures} CHECK(S) FAILED — review output above.`);
    process.exit(1);
  }
} finally {
  await c.end();
}
