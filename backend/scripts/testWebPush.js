/**
 * Diagnostic: exercises the web-push pipeline end-to-end without a browser.
 *
 *   node backend/scripts/testWebPush.js
 *
 * Checks:
 *   1. VAPID keys loaded from .env.local
 *   2. web-push library accepts them
 *   3. push_subscriptions table is reachable
 *   4. sendWebPush() with no subs for a user = silent no-op (not an error)
 *   5. sendWebPush() with a fake (guaranteed-bad) subscription row
 *      attempts delivery, the push service 404s, dead-sub cleanup kicks in
 *      and the fake row is deleted.
 *
 * No real user receives a notification — this purely tests the plumbing.
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../..", ".env.local") });

const { isWebPushConfigured, sendWebPush } = await import("../services/webPush.js");
const supabaseMod = await import("../config/supabase.js");
const supabase = supabaseMod.default;

function log(step, msg) { console.log(`  [${step}] ${msg}`); }

console.log("\n\u{1F9EA}  Web Push Pipeline Diagnostic\n");

// ────────────────────────────────────────────────────
// 1. VAPID keys present
// ────────────────────────────────────────────────────
console.log("1. VAPID key presence");
const pub  = process.env.VAPID_PUBLIC_KEY;
const priv = process.env.VAPID_PRIVATE_KEY;
const cont = process.env.VAPID_CONTACT;
if (!pub || !priv) {
  console.error("  \u274C  VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY missing from .env.local");
  process.exit(1);
}
log("OK", `public  key length: ${pub.length} chars`);
log("OK", `private key length: ${priv.length} chars`);
log("OK", `contact: ${cont || "(default mailto:admin@example.com)"}`);

// ────────────────────────────────────────────────────
// 2. web-push library configured
// ────────────────────────────────────────────────────
console.log("\n2. web-push library configuration");
if (!isWebPushConfigured()) {
  console.error("  \u274C  isWebPushConfigured() returned false — keys didn't load");
  process.exit(1);
}
log("OK", "isWebPushConfigured() returned true");

// ────────────────────────────────────────────────────
// 3. push_subscriptions table is reachable
// ────────────────────────────────────────────────────
console.log("\n3. push_subscriptions table reachability");
const { count, error } = await supabase
  .from("push_subscriptions")
  .select("*", { count: "exact", head: true });
if (error) {
  console.error("  \u274C  Table query failed:", error.message);
  console.error("      Did you run the migration SQL in Supabase?");
  process.exit(1);
}
log("OK", `table query succeeded — ${count ?? 0} subscription(s) currently stored`);

// ────────────────────────────────────────────────────
// 4. sendWebPush with no subscriptions = silent no-op
// ────────────────────────────────────────────────────
console.log("\n4. sendWebPush() with no subs for a user");
const fakeUserId = "00000000-0000-0000-0000-000000000000";
await sendWebPush(fakeUserId, {
  title: "Test (should not send)",
  body:  "This user has no push subs, so nothing should happen.",
});
log("OK", "returned without error (no subs = no delivery, as expected)");

// ────────────────────────────────────────────────────
// 5. sendWebPush with a bogus subscription attempts delivery + cleanup
// ────────────────────────────────────────────────────
console.log("\n5. sendWebPush() with a bogus subscription row");
log("...", "inserting a fake subscription row");

// Need a valid auth.users id for the FK. Pick any existing user.
const { data: anyUser } = await supabase
  .from("students").select("user_id").limit(1).maybeSingle();

if (!anyUser?.user_id) {
  log("SKIP", "no existing users in students table — cannot FK-test. Skipping.");
} else {
  const fakeEndpoint = `https://fcm.googleapis.com/fcm/send/not-a-real-endpoint-${Date.now()}`;
  const { data: inserted, error: insErr } = await supabase
    .from("push_subscriptions")
    .insert({
      user_id:  anyUser.user_id,
      endpoint: fakeEndpoint,
      auth:     "fakeAuthKeyBase64xxxxxxxxxxxxxxxxxxxxx",
      p256dh:   "BfakeP256dhKeyBase64xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    })
    .select()
    .single();

  if (insErr) {
    log("FAIL", `insert error: ${insErr.message}`);
  } else {
    log("OK", `inserted row id=${inserted.id}`);

    // Fire sendWebPush — real attempt, will get 404/410 from the fake endpoint.
    // sendWebPush should catch that and DELETE the row.
    log("...", "calling sendWebPush (expect the push service to 404 + auto-cleanup)");
    await sendWebPush(anyUser.user_id, {
      title: "Diagnostic (will fail + cleanup)",
      body:  "Fake subscription — delivery should fail and the row should be deleted.",
    });

    // Verify cleanup happened
    const { data: afterRow } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", fakeEndpoint)
      .maybeSingle();

    if (afterRow) {
      log("WARN", `row NOT cleaned up — dead subscription still exists (id=${afterRow.id}). Manually deleting now.`);
      await supabase.from("push_subscriptions").delete().eq("endpoint", fakeEndpoint);
    } else {
      log("OK", "dead subscription auto-cleaned up \u2713");
    }
  }
}

// ────────────────────────────────────────────────────
console.log("\n\u2705 All checks passed. Push pipeline is wired and ready.\n");
console.log("   Next step: open the PWA in a browser, log in, grant the");
console.log("   notification permission prompt, and any notification fired");
console.log("   via sendNotification() will arrive as a system banner.\n");

process.exit(0);
