/**
 * Tests for backend/middleware/tenantMiddleware.js.
 *
 * Multi-tenant isolation is the load-bearing security property of
 * this entire platform. Every bug here is, by definition, a data
 * leak between paying customers. So these tests exercise the
 * contract from both directions:
 *
 *   POSITIVE: a request from org A reads its own data.
 *   NEGATIVE: a request from org A CANNOT read org B's data, even
 *             if it tries to spoof the org_id in the URL or payload.
 *
 * We mock Supabase as a spy builder — it records the call chain
 * (from/select/eq/insert/...) and we assert on what was recorded.
 * That's strictly better than a real DB round-trip: any regression
 * in the auto-injection code surfaces here rather than only showing
 * up when a customer notices their data bleeding.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// Spy supabase: records .from().select/.insert/.update/.delete/.eq
// calls so we can assert exactly which filters got applied.
// ────────────────────────────────────────────────────────────

const calls = [];

function buildSpyBuilder(table) {
  const chain = { table, ops: [] };
  calls.push(chain);

  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        // .then makes the object awaitable; resolve with empty data
        // so any awaited code just proceeds.
        if (prop === "then") {
          return (resolve) => resolve({ data: [], error: null });
        }
        return (...args) => {
          chain.ops.push({ op: String(prop), args });
          return proxy;
        };
      },
    }
  );
  return proxy;
}

vi.mock("../../backend/config/supabase.js", () => ({
  default: {
    from: (table) => buildSpyBuilder(table),
  },
}));

const { injectTenant, validateOrgAccess } = await import(
  "../../backend/middleware/tenantMiddleware.js"
);

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function makeReq({ role = "admin", orgId = "org-A", session, ...rest } = {}) {
  return {
    userRole: role,
    orgId,
    userId:   "user-1",
    session:  session || { user: { id: "user-1", role, org_id: orgId } },
    headers:  {},
    ip:       "127.0.0.1",
    ...rest,
  };
}

function runMw(mw, req, res = {}) {
  return new Promise((resolve, reject) => {
    try { mw(req, res, resolve); } catch (e) { reject(e); }
  });
}

beforeEach(() => {
  calls.length = 0;
});

// ════════════════════════════════════════════════════════════
// SELECT — auto-inject eq('org_id', ...)
// ════════════════════════════════════════════════════════════

describe("injectTenant — SELECT on tenant tables", () => {
  it("auto-applies eq('org_id', orgA) when org A reads students", async () => {
    const req = makeReq({ orgId: "org-A" });
    await runMw(injectTenant, req);

    await req.db.from("students").select("*");

    expect(calls).toHaveLength(1);
    const chain = calls[0];
    expect(chain.table).toBe("students");
    // The proxy calls .select(...) on the real builder and chains .eq('org_id','org-A')
    expect(chain.ops[0]).toEqual({ op: "select", args: ["*"] });
    expect(chain.ops[1]).toEqual({ op: "eq", args: ["org_id", "org-A"] });
  });

  it("does NOT apply eq('org_id',...) on GLOBAL tables (organisations)", async () => {
    const req = makeReq({ orgId: "org-A" });
    await runMw(injectTenant, req);

    await req.db.from("organisations").select("*");

    const chain = calls[0];
    expect(chain.ops[0]).toEqual({ op: "select", args: ["*"] });
    // No org_id filter should be chained.
    expect(chain.ops.find((o) => o.op === "eq" && o.args[0] === "org_id")).toBeUndefined();
  });

  it("uses the CALLER's org_id — org B's request is scoped to org B, not leaked to org A", async () => {
    const reqA = makeReq({ orgId: "org-A" });
    const reqB = makeReq({ orgId: "org-B" });
    await runMw(injectTenant, reqA);
    await runMw(injectTenant, reqB);

    await reqA.db.from("events").select("*");
    await reqB.db.from("events").select("*");

    const [chainA, chainB] = calls;
    expect(chainA.ops.find((o) => o.op === "eq").args).toEqual(["org_id", "org-A"]);
    expect(chainB.ops.find((o) => o.op === "eq").args).toEqual(["org_id", "org-B"]);
  });
});

// ════════════════════════════════════════════════════════════
// INSERT — auto-inject org_id; override attempts are stomped
// ════════════════════════════════════════════════════════════

describe("injectTenant — INSERT on tenant tables", () => {
  it("auto-injects org_id onto the insert payload", async () => {
    const req = makeReq({ orgId: "org-A" });
    await runMw(injectTenant, req);

    await req.db.from("events").insert({ name: "hackathon" });

    const chain = calls[0];
    expect(chain.ops[0].op).toBe("insert");
    expect(chain.ops[0].args[0]).toEqual({ name: "hackathon", org_id: "org-A" });
  });

  it("OVERWRITES a spoofed org_id — caller from org A cannot insert into org B", async () => {
    const req = makeReq({ orgId: "org-A" });
    await runMw(injectTenant, req);

    // Hostile payload — try to write a row belonging to org B.
    await req.db.from("events").insert({ name: "sneaky", org_id: "org-B" });

    const chain = calls[0];
    // The middleware must have overwritten the attacker-supplied org_id.
    expect(chain.ops[0].args[0]).toEqual({ name: "sneaky", org_id: "org-A" });
  });

  it("applies org_id to every row in a batch insert", async () => {
    const req = makeReq({ orgId: "org-A" });
    await runMw(injectTenant, req);

    await req.db.from("events").insert([
      { name: "a" },
      { name: "b", org_id: "org-B" }, // also stomped
    ]);

    const chain = calls[0];
    expect(chain.ops[0].args[0]).toEqual([
      { name: "a", org_id: "org-A" },
      { name: "b", org_id: "org-A" },
    ]);
  });
});

// ════════════════════════════════════════════════════════════
// UPDATE / DELETE — auto-eq('org_id', ...)
// ════════════════════════════════════════════════════════════

describe("injectTenant — UPDATE / DELETE scoping", () => {
  it("UPDATE auto-chains eq('org_id', ...)", async () => {
    const req = makeReq({ orgId: "org-A" });
    await runMw(injectTenant, req);

    await req.db.from("events").update({ name: "renamed" });

    const chain = calls[0];
    expect(chain.ops[0]).toEqual({ op: "update", args: [{ name: "renamed" }] });
    expect(chain.ops[1]).toEqual({ op: "eq", args: ["org_id", "org-A"] });
  });

  it("DELETE auto-chains eq('org_id', ...)", async () => {
    const req = makeReq({ orgId: "org-A" });
    await runMw(injectTenant, req);

    await req.db.from("events").delete();

    const chain = calls[0];
    expect(chain.ops[0]).toEqual({ op: "delete", args: [] });
    expect(chain.ops[1]).toEqual({ op: "eq", args: ["org_id", "org-A"] });
  });

  it("a malicious DELETE cannot drop rows from another org — filter is still org-A", async () => {
    // The point: even if application code forgets to add its own
    // .eq("id", x), the org_id filter is present, so org A can never
    // delete org B's rows.
    const req = makeReq({ orgId: "org-A" });
    await runMw(injectTenant, req);

    await req.db.from("events").delete();

    const chain = calls[0];
    const orgIdFilters = chain.ops.filter((o) => o.op === "eq" && o.args[0] === "org_id");
    expect(orgIdFilters).toHaveLength(1);
    expect(orgIdFilters[0].args[1]).toBe("org-A");
  });
});

// ════════════════════════════════════════════════════════════
// Super admin + impersonation
// ════════════════════════════════════════════════════════════

describe("injectTenant — super_admin and impersonation", () => {
  it("super_admin WITHOUT impersonation sees tenant tables unfiltered", async () => {
    const req = makeReq({
      role:  "super_admin",
      orgId: undefined,
      session: { user: { id: "sa-1", role: "super_admin" } },
    });
    await runMw(injectTenant, req);

    await req.db.from("students").select("*");

    const chain = calls[0];
    expect(chain.ops[0]).toEqual({ op: "select", args: ["*"] });
    expect(chain.ops.find((o) => o.op === "eq" && o.args[0] === "org_id")).toBeUndefined();
  });

  it("super_admin WHILE impersonating is scoped to the impersonated org", async () => {
    const req = makeReq({
      role:  "super_admin",
      orgId: undefined,
      session: {
        user: { id: "sa-1", role: "super_admin" },
        impersonating_org_id: "org-TARGET",
      },
    });
    await runMw(injectTenant, req);

    await req.db.from("students").select("*");

    const chain = calls[0];
    expect(chain.ops[1]).toEqual({ op: "eq", args: ["org_id", "org-TARGET"] });
  });
});

// ════════════════════════════════════════════════════════════
// validateOrgAccess — URL param gating
// ════════════════════════════════════════════════════════════

describe("validateOrgAccess middleware", () => {
  function resSpy() {
    const res = {
      _status: null,
      _body:   null,
      status(c) { this._status = c; return this; },
      json(b)   { this._body   = b; return this; },
    };
    return res;
  }

  it("allows when user's orgId matches the :orgId URL param", async () => {
    const req = { params: { orgId: "org-A" }, userRole: "admin", orgId: "org-A" };
    const res = resSpy();
    let nextCalled = false;
    await validateOrgAccess(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(res._status).toBeNull();
  });

  it("returns 403 when a non-super-admin from org A hits a URL scoped to org B", async () => {
    const req = { params: { orgId: "org-B" }, userRole: "admin", orgId: "org-A" };
    const res = resSpy();
    let nextCalled = false;
    await validateOrgAccess(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res._status).toBe(403);
    expect(res._body).toEqual({ error: "Access denied to this organisation" });
  });

  it("allows super_admin regardless of the URL :orgId param", async () => {
    const req = { params: { orgId: "org-Z" }, userRole: "super_admin", orgId: undefined };
    const res = resSpy();
    let nextCalled = false;
    await validateOrgAccess(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.targetOrg).toBe("org-Z");
  });

  it("passes through when no :orgId param is present (route doesn't gate on it)", async () => {
    const req = { params: {}, userRole: "admin", orgId: "org-A" };
    const res = resSpy();
    let nextCalled = false;
    await validateOrgAccess(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(res._status).toBeNull();
  });
});
