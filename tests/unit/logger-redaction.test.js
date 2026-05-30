/**
 * Pinning tests for pino redact paths defined in backend/config/logger.js.
 *
 * Strategy: spin up a real pino instance configured with the SAME
 * REDACT_PATHS array, point it at an in-memory stream so we can read
 * back exactly what would have been emitted, then assert that the
 * sensitive value does NOT appear in the wire output.
 *
 * This catches two regressions:
 *   1. A new sensitive field added to a log object but not to the
 *      redact path-set → secrets leak into Datadog/Loki.
 *   2. A typo in REDACT_PATHS — say "passowrd" → no redaction happens
 *      and the test silently passes today, fails tomorrow when the
 *      typo is fixed.
 *
 * We construct a fresh pino instance per test (instead of importing
 * the singleton from config/logger.js) so each test sees its own
 * stream and isn't affected by other tests that may have written to
 * stdout. The REDACT_PATHS import is the contract surface.
 */

import { describe, it, expect } from "vitest";
import pino from "pino";
import { Writable } from "node:stream";

import { REDACT_PATHS } from "../../backend/config/logger.js";

const SECRET_MARKER = "S3CRET-V4LU3-XYZ";   // any literal substring is fine

/**
 * Builds a pino instance with the SAME redact config as production
 * but writing to an in-memory stream. Returns { log, output }.
 */
function buildCapturingLogger() {
  let captured = "";
  const stream = new Writable({
    write(chunk, _enc, cb) { captured += chunk.toString(); cb(); },
  });
  const log = pino(
    {
      level:  "trace",                                 // never silence in tests
      redact: { paths: REDACT_PATHS, censor: "[REDACTED]", remove: false },
    },
    stream,
  );
  return { log, output: () => captured };
}

describe("logger redaction — body.* fields", () => {
  it("redacts body.password", () => {
    const { log, output } = buildCapturingLogger();
    log.error({ body: { password: SECRET_MARKER, email: "a@b.com" } }, "login attempt");
    const wire = output();
    expect(wire).not.toContain(SECRET_MARKER);
    expect(wire).toContain("[REDACTED]");
    expect(wire).toContain("a@b.com");  // non-secret peer fields still visible
  });

  it("redacts body.currentPassword + body.newPassword", () => {
    const { log, output } = buildCapturingLogger();
    log.error({ body: { currentPassword: SECRET_MARKER, newPassword: SECRET_MARKER + "2" } }, "pw change");
    expect(output()).not.toContain(SECRET_MARKER);
  });

  it("redacts body.encryptedContent + body.iv (E2EE blobs)", () => {
    const { log, output } = buildCapturingLogger();
    log.error({ body: { encryptedContent: SECRET_MARKER, iv: SECRET_MARKER + "2", conversationId: "c-1" } }, "send msg");
    expect(output()).not.toContain(SECRET_MARKER);
    expect(output()).toContain("c-1");
  });

  it("redacts body.razorpay_signature + body.razorpay_payment_id", () => {
    const { log, output } = buildCapturingLogger();
    log.error({
      body: {
        razorpay_signature:  SECRET_MARKER,
        razorpay_payment_id: SECRET_MARKER + "2",
        razorpay_order_id:   SECRET_MARKER + "3",
      },
    }, "verify");
    expect(output()).not.toContain(SECRET_MARKER);
  });

  it("redacts body.access_token / refresh_token / invite_token", () => {
    const { log, output } = buildCapturingLogger();
    log.error({
      body: {
        access_token:   SECRET_MARKER,
        refresh_token:  SECRET_MARKER + "2",
        invite_token:   SECRET_MARKER + "3",
        download_token: SECRET_MARKER + "4",
      },
    }, "auth");
    expect(output()).not.toContain(SECRET_MARKER);
  });
});

describe("logger redaction — top-level shortcuts", () => {
  it("redacts a top-level `token` field (the cert verify case)", () => {
    const { log, output } = buildCapturingLogger();
    log.warn({ err: new Error("lookup failed"), token: SECRET_MARKER }, "cert verify failed");
    expect(output()).not.toContain(SECRET_MARKER);
  });

  it("redacts a top-level `password` field", () => {
    const { log, output } = buildCapturingLogger();
    log.error({ password: SECRET_MARKER, attempt: 1 }, "auth");
    expect(output()).not.toContain(SECRET_MARKER);
    expect(output()).toContain('"attempt":1');
  });

  it("redacts a top-level publicKey blob (E2EE key registration)", () => {
    const { log, output } = buildCapturingLogger();
    log.info({ publicKey: SECRET_MARKER }, "key register");
    expect(output()).not.toContain(SECRET_MARKER);
  });
});

describe("logger redaction — HTTP headers", () => {
  it("redacts req.headers.authorization", () => {
    const { log, output } = buildCapturingLogger();
    log.info({ req: { headers: { authorization: `Bearer ${SECRET_MARKER}`, "x-request-id": "rid-1" } } }, "req");
    expect(output()).not.toContain(SECRET_MARKER);
    expect(output()).toContain("rid-1");
  });

  it("redacts req.headers.cookie", () => {
    const { log, output } = buildCapturingLogger();
    log.info({ req: { headers: { cookie: `sid=${SECRET_MARKER}` } } }, "req");
    expect(output()).not.toContain(SECRET_MARKER);
  });

  it("redacts res.headers['set-cookie']", () => {
    const { log, output } = buildCapturingLogger();
    log.info({ res: { headers: { "set-cookie": `sid=${SECRET_MARKER}; HttpOnly` } } }, "res");
    expect(output()).not.toContain(SECRET_MARKER);
  });

  it("redacts req.headers['x-razorpay-signature']", () => {
    const { log, output } = buildCapturingLogger();
    log.info({ req: { headers: { "x-razorpay-signature": SECRET_MARKER } } }, "webhook");
    expect(output()).not.toContain(SECRET_MARKER);
  });
});

describe("logger redaction — axios err envelopes", () => {
  it("redacts err.config.headers.Authorization (axios preserves header case)", () => {
    const { log, output } = buildCapturingLogger();
    // Synthesise an axios-shaped error.
    const err = new Error("401");
    err.config = { headers: { Authorization: `Bearer ${SECRET_MARKER}` } };
    log.error({ err }, "openrouter call failed");
    expect(output()).not.toContain(SECRET_MARKER);
  });

  it("redacts err.config.data (axios stuffs the request body here)", () => {
    const { log, output } = buildCapturingLogger();
    const err = new Error("502");
    err.config = { data: `{"password":"${SECRET_MARKER}"}` };
    log.error({ err }, "downstream call");
    expect(output()).not.toContain(SECRET_MARKER);
  });

  it("redacts err.response.data.access_token (Supabase 200-with-tokens reply)", () => {
    const { log, output } = buildCapturingLogger();
    const err = new Error("supabase weirdness");
    err.response = { data: { access_token: SECRET_MARKER, refresh_token: SECRET_MARKER + "2" } };
    log.error({ err }, "supabase auth");
    expect(output()).not.toContain(SECRET_MARKER);
  });
});

describe("logger redaction — session.user", () => {
  it("redacts the whole session.user object — no email, no role leak", () => {
    // We chose to redact `session.user` AS A WHOLE — peer-field
    // leakage (a future "ssn" or "phone" column) is the bigger risk
    // than losing the role/id on a log line. Operators still have
    // userId from the request-logger mixin, which sits at the
    // top level of every per-request log line.
    const { log, output } = buildCapturingLogger();
    log.error({ session: { user: { email: "real@email.com", role: "admin", id: "u-123" } } }, "session dump");
    expect(output()).not.toContain("real@email.com");
    expect(output()).not.toContain("admin");
    expect(output()).not.toContain("u-123");
    expect(output()).toContain("[REDACTED]");
  });
});

describe("logger redaction — request id is preserved", () => {
  it("the requestId mixin field is NOT redacted", () => {
    const { log, output } = buildCapturingLogger();
    log.info({ requestId: "rid-7" }, "test");
    expect(output()).toContain("rid-7");
  });
});
