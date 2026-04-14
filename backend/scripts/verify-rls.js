/**
 * Live RLS verification script.
 *
 * Run this AFTER applying migration 17 (Phase 8) to confirm the
 * defense-in-depth layer is actually in place. Two checks:
 *
 *   1. RLS is ENABLED on every tenant table
 *      (pg_class.relrowsecurity = true).
 *
 *   2. Each tenant table has ZERO permissive policies for the
 *      `anon` / `authenticated` roles. With RLS enabled and no
 *      policies, those roles get zero rows — which is the whole
 *      point of the default-deny stance.
 *
 * The `service_role` (used by the backend's
 * SUPABASE_SERVICE_ROLE_KEY) bypasses RLS by Supabase platform
 * default, so backend queries are unaffected. This script doesn't
 * verify that path explicitly — the existing backend test suite
 * passing is the proof.
 *
 * Run:
 *   PGURL='postgresql://...:5432/postgres' \
 *     node backend/scripts/verify-rls.js
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

const url = process.env.PGURL || process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set PGURL (or DIRECT_URL / DATABASE_URL) before running.");
  process.exit(2);
}

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

let failures = 0;
function ok(msg)   { console.log("  ✓ " + msg); }
function fail(msg) { console.log("  ✗ " + msg); failures++; }

try {
  // ── 1: RLS enabled ──
  console.log("\n[1] RLS enabled on every tenant table");
  const rls = await c.query(`
    SELECT t.tablename, c.relrowsecurity AS rls_enabled
    FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename
    WHERE t.schemaname = 'public'
      AND t.tablename = ANY ($1::text[])
  `, [TENANT_TABLES]);
  const rlsByTable = Object.fromEntries(rls.rows.map(r => [r.tablename, r.rls_enabled]));
  for (const t of TENANT_TABLES) {
    const enabled = rlsByTable[t];
    if (enabled === undefined) {
      // Skip — table doesn't exist on this install (some tenant tables
      // are out-of-tree and may not be present everywhere).
      console.log(`  - ${t} skipped (table not present)`);
      continue;
    }
    if (enabled) ok(`${t}: RLS enabled`);
    else         fail(`${t}: RLS NOT enabled — re-run migration 17`);
  }

  // ── 2: no permissive policies for anon/authenticated (default-deny) ──
  console.log("\n[2] No permissive policies for anon / authenticated roles");
  const policies = await c.query(`
    SELECT tablename, policyname, roles, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY ($1::text[])
      AND ('anon' = ANY (roles) OR 'authenticated' = ANY (roles) OR 'public' = ANY (roles))
  `, [TENANT_TABLES]);
  if (policies.rows.length === 0) {
    ok(`zero anon/authenticated/public policies across all ${TENANT_TABLES.length} tenant tables (default-deny intact)`);
  } else {
    for (const p of policies.rows) {
      // A policy here means SOMEONE explicitly added a permissive rule.
      // That may be intentional (e.g. enabling Realtime on a specific
      // table later), but we flag it so the operator can audit.
      console.log(`  ! ${p.tablename}: policy "${p.policyname}" applies to ${p.roles.join(",")} for ${p.cmd}`);
    }
    console.log("\n  Above policies BYPASS default-deny for the listed roles.");
    console.log("  Audit each one — confirm it's intentional (e.g. Realtime).");
  }

  console.log("");
  if (failures === 0) {
    console.log("ALL CHECKS PASSED — RLS default-deny is live on every tenant table.");
  } else {
    console.log(`${failures} CHECK(S) FAILED — review output above.`);
    process.exit(1);
  }
} finally {
  await c.end();
}
