/**
 * Tests that backend/controllers/certificate/* route every DB call
 * through req.db (the org-scoped wrapper installed by injectTenant)
 * rather than the raw supabase client. The Phase 2.2.1 conversion
 * introduced this property; these tests guard it from regression.
 *
 * Strategy:
 *   - Mock the supabase module with a spy that throws if anything
 *     calls .from() on it (proves no unscoped reads/writes leak).
 *   - Build a fake req.db with a recording proxy and exercise each
 *     controller — assert the proxy received the expected calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the raw supabase client. .from() throws on purpose: any
// controller that still reaches for the raw client is a bug. .auth.*
// is left intact for completeness (auth ops aren't tenant-scoped).
const RAW_FROM_THROW = "raw supabase.from() must NOT be called by tenant-scoped controllers";
vi.mock("../../backend/config/supabase.js", () => ({
  default: {
    from: () => { throw new Error(RAW_FROM_THROW); },
    auth: {},
  },
}));

// notificationController.sendNotification reaches for supabase, mock it
// out so cert controllers can be exercised in isolation.
vi.mock("../../backend/controllers/notificationController.js", () => ({
  sendNotification: vi.fn(async () => ({ ok: true })),
  __esModule: true,
}));

// Now import the modules under test (after mocks).
const downloadMod = await import("../../backend/controllers/certificate/download.js");
const batchMod    = await import("../../backend/controllers/certificate/batch.js");

// ── Spy req.db builder ──
function makeReq({ orgId = "org-A", userId = "u1", body = {}, params = {}, query = {} } = {}) {
  const calls = [];
  const proxy = (table) => {
    const chain = { table, ops: [] };
    calls.push(chain);
    const handler = new Proxy({}, {
      get(_t, prop) {
        if (prop === "then") {
          // Awaitable: resolve to a benign empty result. Inserts that
          // call .select().single() will go through this too.
          return (resolve) => resolve({ data: null, error: null });
        }
        return (...args) => {
          chain.ops.push({ op: String(prop), args });
          return handler;
        };
      },
    });
    return handler;
  };
  const req = {
    orgId, userId,
    session: { user: { id: userId, role: "admin", org_id: orgId } },
    body, params, query,
    db: { from: proxy, raw: {}, getOrg: async () => null, audit: async () => null },
  };
  return { req, calls };
}

function makeRes() {
  const res = {
    _status: 200, _body: null, _sent: null,
    status(c) { this._status = c; return this; },
    json(b)   { this._body   = b; return this; },
    send(b)   { this._sent = b; return this; },
    setHeader() { return this; },
  };
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// download.js
// ════════════════════════════════════════════════════════════

describe("certificate/download.js — tenant scoping", () => {
  it("downloadCertificate uses req.db.from('certificates'), never raw supabase", async () => {
    const { req, calls } = makeReq({ params: { id: "cert-1" } });
    const res = makeRes();
    // The controller will throw mid-way trying to build a PDF (no real
    // cert returned), but the DB call we want to assert on happens first.
    await downloadCallSafe(downloadMod.downloadCertificate, req, res);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("certificates");
    // .select(...) was called on req.db's chain — that's all we need
    // to prove the routing went through the scoped wrapper.
    expect(calls[0].ops[0].op).toBe("select");
  });

  it("downloadBatchZip uses req.db for both batch and certs lookups", async () => {
    const { req, calls } = makeReq({ params: { batchId: "batch-1" } });
    const res = makeRes();
    await downloadCallSafe(downloadMod.downloadBatchZip, req, res);
    // Batch lookup runs; the second call only fires if batch is non-null
    // (which our spy makes null), so we just need the first call.
    expect(calls[0].table).toBe("certificate_batches");
  });
});

// ════════════════════════════════════════════════════════════
// batch.js
// ════════════════════════════════════════════════════════════

describe("certificate/batch.js — tenant scoping", () => {
  it("matchStudents uses req.db.from('students')", async () => {
    const { req, calls } = makeReq({ body: { emails: ["x@y.co"] } });
    const res = makeRes();
    await batchMod.matchStudents(req, res);
    expect(calls[0].table).toBe("students");
    expect(calls[0].ops.find(o => o.op === "select")).toBeTruthy();
  });

  it("createCertificateBatch INSERTs go through req.db (org_id auto-injected by Proxy)", async () => {
    const { req, calls } = makeReq({
      body: {
        title: "T", eventName: "E", recipients: [{ name: "A", email: "a@x.co" }],
      },
    });
    const res = makeRes();
    await downloadCallSafe(batchMod.createCertificateBatch, req, res);
    // First call inserts the batch row.
    expect(calls[0].table).toBe("certificate_batches");
    expect(calls[0].ops[0].op).toBe("insert");
  });

  it("getBatches uses req.db.from('certificate_batches')", async () => {
    const { req, calls } = makeReq();
    const res = makeRes();
    await batchMod.getBatches(req, res);
    expect(calls[0].table).toBe("certificate_batches");
    expect(calls[0].ops[0].op).toBe("select");
  });

  it("getMyCertificates uses req.db.from('certificates') (org_id added by Proxy ON TOP of the user_id filter)", async () => {
    const { req, calls } = makeReq({ userId: "u-1" });
    const res = makeRes();
    await batchMod.getMyCertificates(req, res);
    expect(calls[0].table).toBe("certificates");
    // user_id filter present; the org_id one is auto-added by the real
    // tenantMiddleware Proxy at runtime — not visible to our spy here,
    // but proven separately in tests/unit/tenant-isolation.test.js.
    const eqs = calls[0].ops.filter(o => o.op === "eq");
    expect(eqs.find(o => o.args[0] === "user_id")).toBeTruthy();
  });

  it("deleteBatch deletes both certificates and certificate_batches via req.db", async () => {
    const { req, calls } = makeReq({ params: { id: "b1" } });
    const res = makeRes();
    await batchMod.deleteBatch(req, res);
    expect(calls.map(c => c.table)).toEqual(["certificates", "certificate_batches"]);
    for (const c of calls) {
      expect(c.ops[0].op).toBe("delete");
    }
  });
});

// ── Helpers ──

// Some controllers throw mid-way (PDF builder, archiver, etc.) once
// the spy returns no data. We don't care — we only want to observe
// the DB call BEFORE the failure. Swallow the throw.
async function downloadCallSafe(fn, req, res) {
  try { await fn(req, res); } catch (_) { /* expected */ }
}
