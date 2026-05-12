/**
 * Integration tests for applyInputSanitizer — covers the
 * sanitizeValue / sanitizeObject helpers that strip XSS payloads,
 * event handler attributes, javascript: URIs, and SQL-injection-ish
 * substrings from req.body / req.query / req.params.
 *
 * These were the uncovered lines (140-192) in security.js — the
 * existing security-headers.test.js focuses on response-header
 * contract, not body sanitisation. Same harness pattern: build a
 * tiny Express app, fire a request through supertest, assert what
 * the route handler observes after sanitisation.
 */

import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import {
  applyInputSanitizer,
  applyHPP,
} from "../../backend/middleware/security.js";

function buildApp() {
  const app = express();
  app.use(express.json());
  // Production order: HPP runs BEFORE sanitizer. HPP replaces
  // Express-5's lazy `req.query` getter with an own-property
  // object, which means mutating individual keys on req.query
  // ACTUALLY STICKS for downstream middleware. Without HPP first,
  // sanitizer mutations on req.query are silently dropped on the
  // next access. Mirror prod here so the test reflects real
  // behavior, not a test-harness artefact.
  applyHPP(app);
  applyInputSanitizer(app);
  // Mirror the body/query back so assertions can read them.
  app.post("/echo", (req, res) => res.json({ body: req.body }));
  app.get("/echo", (req, res) => res.json({ query: req.query }));
  return app;
}

describe("applyInputSanitizer — XSS scrubbing in body", () => {
  it("strips <script>…</script> tags", async () => {
    const res = await request(buildApp())
      .post("/echo")
      .send({ name: "Alice<script>alert(1)</script>" });
    expect(res.body.body.name).toBe("Alice");
  });

  it("strips event-handler attributes like onclick=\"…\"", async () => {
    const res = await request(buildApp())
      .post("/echo")
      .send({ html: "hi onclick=\"evil()\" there" });
    expect(res.body.body.html).not.toContain("onclick");
  });

  it("strips javascript: pseudo-URLs", async () => {
    const res = await request(buildApp())
      .post("/echo")
      .send({ href: "javascript:alert(1)" });
    expect(res.body.body.href).not.toContain("javascript:");
  });

  it("strips data:text/html URIs (HTML-payload data URIs are an XSS vector)", async () => {
    const res = await request(buildApp())
      .post("/echo")
      .send({ src: "data:text/html,<script>bad()</script>" });
    expect(res.body.body.src).not.toMatch(/data\s*:\s*text\/html/);
  });

  it("strips ;DROP TABLE injection", async () => {
    const res = await request(buildApp())
      .post("/echo")
      .send({ q: "users'; DROP TABLE users" });
    expect(res.body.body.q).not.toMatch(/DROP\s+TABLE/i);
  });

  it("strips UNION SELECT injection", async () => {
    const res = await request(buildApp())
      .post("/echo")
      .send({ q: "1 UNION SELECT password FROM users" });
    expect(res.body.body.q).not.toMatch(/UNION\s+SELECT/i);
  });
});

describe("applyInputSanitizer — non-string values pass through", () => {
  it("preserves numbers, booleans, and nulls", async () => {
    const res = await request(buildApp())
      .post("/echo")
      .send({ age: 21, active: true, deleted: null });
    expect(res.body.body).toEqual({ age: 21, active: true, deleted: null });
  });

  it("recurses into nested objects", async () => {
    const res = await request(buildApp())
      .post("/echo")
      .send({
        user: {
          name: "Bob",
          bio: "<script>alert(1)</script>",
          stats: { score: 42 },
        },
      });
    expect(res.body.body.user.name).toBe("Bob");
    expect(res.body.body.user.bio).toBe("");
    expect(res.body.body.user.stats.score).toBe(42);
  });

  it("preserves legitimate text content (no over-sanitisation)", async () => {
    const res = await request(buildApp())
      .post("/echo")
      .send({ comment: "Loved the Pythagoras lesson — clear & helpful!" });
    expect(res.body.body.comment).toBe(
      "Loved the Pythagoras lesson — clear & helpful!",
    );
  });
});

describe("applyInputSanitizer — query string", () => {
  it("strips <script> from query params", async () => {
    const res = await request(buildApp()).get(
      "/echo?q=hello%3Cscript%3Ealert%3C%2Fscript%3E",
    );
    // After URL-decoding, the value contained <script>alert</script>.
    // After sanitisation, those tags are gone.
    expect(res.body.query.q).toBe("hello");
  });

  it("leaves benign query params alone", async () => {
    const res = await request(buildApp()).get("/echo?page=2&sort=name");
    expect(res.body.query).toEqual({ page: "2", sort: "name" });
  });
});

// Note: applyInputSanitizer also tries to mutate `req.params`, but
// route params don't exist yet at the app.use() level — they're only
// populated by Express AFTER route matching. So the params branch in
// applyInputSanitizer is dead code in practice; output-encoding +
// parameterised queries (Supabase) are the real defences here, not
// this middleware. No test for params: there's nothing to assert.

describe("applyRequestLogger — malformed URL", () => {
  // Covers line 267 (the catch branch on decodeURIComponent throwing).
  // Sends a malformed percent-encoded sequence which decodeURIComponent
  // rejects with a URIError. The middleware should treat that as
  // suspicious-by-default and return 400.
  it("rejects a malformed percent-encoded URL with 400", async () => {
    const { applyRequestLogger } = await import(
      "../../backend/middleware/security.js"
    );
    const app = express();
    applyRequestLogger(app);
    app.get("/x", (_req, res) => res.json({ ok: true }));

    // %E0%A4%A — incomplete UTF-8 sequence — decodeURIComponent throws.
    const res = await request(app).get("/x?bad=%E0%A4%A");
    expect(res.status).toBe(400);
  });
});
