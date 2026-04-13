/**
 * Generate a fresh VAPID key pair for Web Push.
 *
 *   node backend/scripts/generateVapidKeys.js
 *
 * Copy the output into .env.local as VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY,
 * AND mirror the public key into frontend env as VITE_VAPID_PUBLIC_KEY so
 * the browser can use it for the pushManager.subscribe({ applicationServerKey })
 * call. The private key must NEVER be exposed to the frontend.
 *
 * Keys are good forever — only regenerate if the private key is leaked, and
 * be aware that regenerating invalidates every existing push subscription.
 */

import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("\n\u{1F511} VAPID keys generated. Add these to .env.local:\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_CONTACT=mailto:admin@your-domain.com`);
console.log("\n\u{1F310} And to the frontend .env (same public key):\n");
console.log(`VITE_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log("");
