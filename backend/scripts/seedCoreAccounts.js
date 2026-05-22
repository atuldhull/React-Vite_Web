/**
 * seedCoreAccounts.js — create login accounts for the 25 core members.
 *
 * The site authenticates through Supabase Auth, so accounts can't be
 * made with plain SQL — they go through the admin API. This script:
 *   1. creates a Supabase Auth user for each core member (password
 *      "12345678", email pre-confirmed so they can log in immediately),
 *   2. upserts their `students` profile row (role: student),
 *   3. links their `core_members` row to the new account.
 *
 * It is idempotent — members who already have an account are skipped,
 * not duplicated. Safe to re-run.
 *
 * HOW TO RUN
 *   1. Make sure the project root has a `.env.local` file containing:
 *        SUPABASE_URL=...                  (your project URL)
 *        SUPABASE_SERVICE_ROLE_KEY=...      (service role key)
 *      — the same values that are set on Render.
 *   2. From the project root:  node backend/scripts/seedCoreAccounts.js
 *
 * Migrations 25 (+ CORE_SETUP_ALL.sql) must already have been run so
 * the core_members table exists.
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env.local") });

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error(
    "\n  ✖ Missing credentials.\n" +
    "    Create a .env.local in the project root with:\n" +
    "      SUPABASE_URL=...\n" +
    "      SUPABASE_SERVICE_ROLE_KEY=...\n",
  );
  process.exit(1);
}

const PASSWORD = "12345678";

// The 25 core members — name + the email their account is created with.
const MEMBERS = [
  ["D Lalith Chandra",           "24ug1byai190@bmsit.in"],
  ["Atul Dhull",                 "24ug1byai146@gmail.com"],
  ["Satvika Prashanth Hiremath", "24ug1byai224@gmail.com"],
  ["Ritika Girish Kulkarni",     "24ug1byai060@bmsit.in"],
  ["Vishal Athreya",             "24ug1byai149@bmsit.in"],
  ["Ayush Kumar",                "24ug1byai049@bmsit.in"],
  ["Anjali Sagar",               "24ug1byai093@bmsit.in"],
  ["Rohit Rajkumar",             "25ug1byai170@bmsit.in"],
  ["M Yukthi",                   "25ug1byai025@bmsit.in"],
  ["C M Mohan",                  "24ug1byai087@bmsit.in"],
  ["Pranav Aditya",              "25ug1bycs0025@bmsit.in"],
  ["Adithya S Nayak",            "24ug1bybs051@bmsit.in"],
  ["Sushma Gouda",               "24ug1bycs713@bmsit.in"],
  ["Guhan M",                    "25ug1byai161@bmsit.in"],
  ["M Anusha",                   "25ug1byai184@bmsit.in"],
  ["Madhurya B O",               "24ug1bycs1001@bmsit.in"],
  ["Kezia Jose",                 "25ug1bycs0541@bmsit.in"],
  ["Azman Shaikh",               "24ug1bycs809@bmsit.in"],
  ["Archisha Gupta",             "25ug1bycs0822@bmsit.in"],
  ["Mariam Hussain",             "25ug1byec049@bmsit.in"],
  ["Nayana G N",                 "25ug1byai181@bmsit.in"],
  ["Madhooja Kar",               "25ug1byec001@bmsit.in"],
  ["S Aniditya",                 "25ug1bycs0249@bmsit.in"],
  ["G Tharun Tej",               "24ug1byai038@bmsit.in"],
  ["Anjali Kumari",              "25ug1byai421@bmsit.in"],
].map(([name, email]) => ({ name, email: email.toLowerCase() }));

const supabase = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Org the student profile rows attach to (first org, same rule as register()).
  const { data: org } = await supabase
    .from("organisations").select("id").order("created_at").limit(1).maybeSingle();
  const orgId = org?.id || null;
  if (!orgId) {
    console.error("  ✖ No organisation found — cannot create student rows.");
    process.exit(1);
  }

  // One pass to learn which emails already have an auth account.
  const existing = new Map();
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) { console.error("  ✖ listUsers failed:", error.message); process.exit(1); }
    for (const u of data.users) if (u.email) existing.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 1000) break;
    page++;
  }

  let created = 0, reused = 0, failed = 0;

  for (const m of MEMBERS) {
    let userId = existing.get(m.email);
    try {
      if (userId) {
        reused++;
        console.log(`  • ${m.name.padEnd(28)} already had an account`);
      } else {
        const { data, error } = await supabase.auth.admin.createUser({
          email: m.email,
          password: PASSWORD,
          email_confirm: true,                 // skip the verification email
          user_metadata: { name: m.name },
        });
        if (error) throw error;
        userId = data.user.id;
        created++;
        console.log(`  ✓ ${m.name.padEnd(28)} account created`);
      }

      // Profile row (role: student) — upsert so a re-run is harmless.
      await supabase.from("students").upsert(
        { user_id: userId, email: m.email, name: m.name, role: "student", org_id: orgId },
        { onConflict: "email" },
      );

      // Link the core_members row to this account.
      await supabase
        .from("core_members")
        .update({ user_id: userId, redeemed_at: new Date().toISOString() })
        .eq("email", m.email)
        .is("user_id", null);
    } catch (err) {
      failed++;
      console.error(`  ✖ ${m.name.padEnd(28)} ${err.message || err}`);
    }
  }

  console.log(
    `\n  Done — ${created} created, ${reused} already existed, ${failed} failed.` +
    `\n  All 25 can log in with their email and password "${PASSWORD}".\n`,
  );
}

main().catch((err) => { console.error(err); process.exit(1); });
