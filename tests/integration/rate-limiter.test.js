/**
 * Integration tests for backend/middleware/rateLimiter.js.
 *
 * Coverage gap before: 52% statements, 25% branches. The limiters
 * are exported as fully-constructed middleware so we can't introspect
 * their config from outside — but we CAN exercise the behaviour by
 * mounting each one on a tiny Express app and firing requests at it.
 *
 * Caveat: express-rate-limit uses an in-memory store keyed by
 * (request key, limiter instance). Each describe-block here re-imports
 * the module via dynamic import so a fresh limiter (with a fresh
 * store) is created — that way one block's traffic doesn't leak into
 * another's and explode the assertions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Fresh module load per describe — express-rate-limit closes over a
// MemoryStore that lives for the lifetime of the limiter instance.
async function freshLimiters() {
  // vitest doesn't reset module cache between tests by default; we
  // do it explicitly so each describe gets unpolluted counters.
  // @ts-expect-error — vi is a global in vitest setup
  globalThis.vi?.resetModules?.();
  return import("../../backend/middleware/rateLimiter.js?t=" + Date.now());
}

// ════════════════════════════════════════════════════════════
// authLimiter — POST max 10 per 15min, skips GETs entirely
// ════════════════════════════════════════════════════════════

describe("authLimiter", () => {
  let app;

  beforeEach(async () => {
    const { authLimiter } = await freshLimiters();
    app = express();
    app.use(express.json());
    app.use(authLimiter);
    app.post("/login", (_req, res) => res.json({ ok: true }));
    app.get("/login", (_req, res) => res.json({ ok: true }));
  });

  it("allows the first 10 POST requests, blocks the 11th with 429", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post("/login");
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).post("/login");
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({
      error: "Too many requests",
    });
    expect(blocked.body.message).toBeTruthy();
  });

  it("does not count GETs against the budget (skip predicate)", async () => {
    // Slam 30 GETs first. If the skip predicate is wrong, these
    // would exhaust the 10/window budget and the POST below would
    // be limited. With the correct skip(GET → true) the POST runs
    // against a clean counter.
    for (let i = 0; i < 30; i++) {
      const res = await request(app).get("/login");
      expect(res.status).toBe(200);
    }
    const post = await request(app).post("/login");
    expect(post.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════
// arenaLimiter — per-user 15/hour. Skips when no session user.
// ════════════════════════════════════════════════════════════

describe("arenaLimiter", () => {
  let app;

  beforeEach(async () => {
    const { arenaLimiter } = await freshLimiters();
    app = express();
    app.use(express.json());
    // Fake session injector — read user id from header so tests can
    // exercise per-user keying without spinning up real sessions.
    app.use((req, _res, next) => {
      const uid = req.header("X-Fake-User");
      if (uid) req.session = { user: { id: uid } };
      next();
    });
    app.use(arenaLimiter);
    app.post("/arena/submit", (_req, res) => res.json({ ok: true }));
  });

  it("blocks the 16th request from the same user", async () => {
    for (let i = 0; i < 15; i++) {
      const res = await request(app)
        .post("/arena/submit")
        .set("X-Fake-User", "u1");
      expect(res.status).toBe(200);
    }
    const blocked = await request(app)
      .post("/arena/submit")
      .set("X-Fake-User", "u1");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("Hourly limit reached");
  });

  it("budgets are per-user — u1 hitting the limit does not affect u2", async () => {
    for (let i = 0; i < 15; i++) {
      await request(app).post("/arena/submit").set("X-Fake-User", "u1");
    }
    const u2Res = await request(app)
      .post("/arena/submit")
      .set("X-Fake-User", "u2");
    expect(u2Res.status).toBe(200);
  });

  it("anon (no session) requests are skipped entirely — never limited", async () => {
    // The skip predicate returns true when there's no req.session.user.id.
    // Hit it far past the would-be limit and verify all succeed.
    for (let i = 0; i < 30; i++) {
      const res = await request(app).post("/arena/submit");
      expect(res.status).toBe(200);
    }
  });
});

// ════════════════════════════════════════════════════════════
// generalLimiter — 200/min/IP for /api/*, skips static + health
// ════════════════════════════════════════════════════════════

describe("generalLimiter skip predicate", () => {
  let app;

  beforeEach(async () => {
    const { generalLimiter } = await freshLimiters();
    app = express();
    app.use(generalLimiter);
    app.get("/api/users", (_req, res) => res.json({ ok: true }));
    app.get("/api/health", (_req, res) => res.json({ ok: true }));
    app.get("/api/ready", (_req, res) => res.json({ ok: true }));
    app.get("/static/img.png", (_req, res) => res.json({ ok: true }));
  });

  it("limits /api/* routes (counter is active)", async () => {
    // Verify the limiter is engaged at all on /api/* by reading
    // the standardHeaders (RateLimit-*).
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit-limit"]).toBeDefined();
  });

  it("skips /api/health — uptime monitors poll this constantly", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    // standardHeaders are not set when the limiter is skipped.
    expect(res.headers["ratelimit-limit"]).toBeUndefined();
  });

  it("skips /api/ready — same reasoning as /api/health", async () => {
    const res = await request(app).get("/api/ready");
    expect(res.headers["ratelimit-limit"]).toBeUndefined();
  });

  it("skips non-/api/ paths entirely (static, SPA fallback)", async () => {
    const res = await request(app).get("/static/img.png");
    expect(res.headers["ratelimit-limit"]).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════
// contactLimiter — 5/hour, simple IP-keyed
// ════════════════════════════════════════════════════════════

describe("contactLimiter", () => {
  let app;

  beforeEach(async () => {
    const { contactLimiter } = await freshLimiters();
    app = express();
    app.use(express.json());
    app.use(contactLimiter);
    app.post("/contact", (_req, res) => res.json({ ok: true }));
  });

  it("allows 5 submissions, blocks the 6th", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/contact");
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).post("/contact");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("Too many requests");
  });
});

// ════════════════════════════════════════════════════════════
// aiLimiter — per-user (or IP fallback) 20/hour
// ════════════════════════════════════════════════════════════

describe("aiLimiter", () => {
  let app;

  beforeEach(async () => {
    const { aiLimiter } = await freshLimiters();
    app = express();
    app.use((req, _res, next) => {
      const uid = req.header("X-Fake-User");
      if (uid) req.session = { user: { id: uid } };
      next();
    });
    app.use(aiLimiter);
    app.get("/ai", (_req, res) => res.json({ ok: true }));
  });

  it("blocks the 21st request from the same user", async () => {
    for (let i = 0; i < 20; i++) {
      const res = await request(app).get("/ai").set("X-Fake-User", "u1");
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).get("/ai").set("X-Fake-User", "u1");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("AI limit reached");
  });

  it("per-user keying isolates u1 from u2", async () => {
    for (let i = 0; i < 20; i++) {
      await request(app).get("/ai").set("X-Fake-User", "u1");
    }
    const u2 = await request(app).get("/ai").set("X-Fake-User", "u2");
    expect(u2.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════
// paymentLimiter — per-org 10/10min (IP fallback for missing org)
// ════════════════════════════════════════════════════════════

describe("paymentLimiter", () => {
  let app;

  beforeEach(async () => {
    const { paymentLimiter } = await freshLimiters();
    app = express();
    app.use((req, _res, next) => {
      const orgId = req.header("X-Fake-Org");
      if (orgId) req.orgId = orgId;
      next();
    });
    app.use(paymentLimiter);
    app.post("/pay", (_req, res) => res.json({ ok: true }));
  });

  it("blocks the 11th payment from the same org", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post("/pay")
        .set("X-Fake-Org", "org1");
      expect(res.status).toBe(200);
    }
    const blocked = await request(app)
      .post("/pay")
      .set("X-Fake-Org", "org1");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("Payment rate limit");
  });

  it("per-org keying isolates org1 from org2", async () => {
    for (let i = 0; i < 10; i++) {
      await request(app).post("/pay").set("X-Fake-Org", "org1");
    }
    const org2 = await request(app).post("/pay").set("X-Fake-Org", "org2");
    expect(org2.status).toBe(200);
  });
});
