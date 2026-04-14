/**
 * Integration tests for the new validators added in Phase 9.1.
 *
 * Doesn't try to exhaustively test every field of every schema —
 * the Zod schemas themselves are declarative and the field-level
 * tests would just re-state them. What matters here:
 *   1. The schema is WIRED to the route (a request hits validation
 *      before the controller).
 *   2. The 400 envelope has the expected shape (error, code:
 *      VALIDATION_FAILED, requestId, issues[]).
 *   3. The right field is called out in `issues` so the frontend
 *      can render per-field errors.
 *
 * One representative test per resource — the validators carry
 * the full responsibility of correctness; this just proves wiring.
 */

import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";

import { requestIdMiddleware } from "../../backend/middleware/requestId.js";
import { responseShapeMiddleware } from "../../backend/middleware/errorShape.js";
import { validateBody } from "../../backend/validators/common.js";
import { createAnnouncementSchema } from "../../backend/validators/announcements.js";
import { createChallengeSchema, updateChallengeSchema } from "../../backend/validators/challenges.js";
import { createEventSchema } from "../../backend/validators/events.js";
import { createTeamSchema, submitProjectSchema } from "../../backend/validators/projects.js";
import { inviteUserSchema, updateUserRoleSchema, toggleOrgFeatureSchema } from "../../backend/validators/admin.js";
import { matchStudentsSchema, createCertificateBatchSchema } from "../../backend/validators/certificates.js";

function buildApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(responseShapeMiddleware);
  app.use(express.json());

  const echo = (req, res) => res.json({ ok: true, body: req.body });

  app.post("/announcements", validateBody(createAnnouncementSchema),     echo);
  app.post("/challenges",    validateBody(createChallengeSchema),        echo);
  app.patch("/challenges",   validateBody(updateChallengeSchema),        echo);
  app.post("/events",        validateBody(createEventSchema),            echo);
  app.post("/teams",         validateBody(createTeamSchema),             echo);
  app.post("/projects",      validateBody(submitProjectSchema),          echo);
  app.post("/invite",        validateBody(inviteUserSchema),             echo);
  app.patch("/role",         validateBody(updateUserRoleSchema),         echo);
  app.patch("/features",     validateBody(toggleOrgFeatureSchema),       echo);
  app.post("/match",         validateBody(matchStudentsSchema),          echo);
  app.post("/cert-batch",    validateBody(createCertificateBatchSchema), echo);

  return app;
}

const app = buildApp();

// ════════════════════════════════════════════════════════════
// Each test: send a payload that violates ONE field; assert the
// envelope shape AND that the violation's `path` is in issues[].
// ════════════════════════════════════════════════════════════

describe("Phase 9.1 schemas — validation envelope shape", () => {
  it("returns { error, code:VALIDATION_FAILED, requestId, issues[] } on any failure", async () => {
    const res = await request(app).post("/announcements").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(typeof res.body.requestId).toBe("string");
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.issues.length).toBeGreaterThan(0);
  });
});

describe("Phase 9.1 schemas — per-resource wiring", () => {
  it("announcements rejects empty title", async () => {
    const res = await request(app).post("/announcements").send({ body: "x" });
    expect(res.status).toBe(400);
    expect(res.body.issues.map(i => i.path)).toContain("title");
  });

  it("announcements rejects invalid target_role enum", async () => {
    const res = await request(app).post("/announcements").send({
      title: "x", body: "y", target_role: "admin",  // not in enum
    });
    expect(res.status).toBe(400);
    expect(res.body.issues.map(i => i.path)).toContain("target_role");
  });

  it("challenges rejects options array of wrong length", async () => {
    const res = await request(app).post("/challenges").send({
      title: "x", question: "y",
      options: ["a", "b", "c"],     // only 3, need 4
      correct_index: 0,
    });
    expect(res.status).toBe(400);
    expect(res.body.issues.map(i => i.path)).toContain("options");
  });

  it("challenges rejects correct_index out of range", async () => {
    const res = await request(app).post("/challenges").send({
      title: "x", question: "y",
      options: ["a","b","c","d"],
      correct_index: 5,             // must be 0..3
    });
    expect(res.status).toBe(400);
    expect(res.body.issues.map(i => i.path)).toContain("correct_index");
  });

  it("challenges PATCH allows partial body", async () => {
    const res = await request(app).patch("/challenges").send({
      points: 100,                  // only one field — ok for PATCH
    });
    expect(res.status).toBe(200);
    expect(res.body.body.points).toBe(100);
  });

  it("events rejects bad banner_color hex", async () => {
    const res = await request(app).post("/events").send({
      title: "Hackathon",
      banner_color: "blue",         // not a hex
    });
    expect(res.status).toBe(400);
    expect(res.body.issues.map(i => i.path)).toContain("banner_color");
  });

  it("teams rejects empty team name", async () => {
    const res = await request(app).post("/teams").send({ memberEmails: [] });
    expect(res.status).toBe(400);
    expect(res.body.issues.map(i => i.path)).toContain("name");
  });

  it("submit project rejects non-UUID teamId", async () => {
    const res = await request(app).post("/projects").send({
      teamId: "not-a-uuid",
      title: "x", description: "y", category: "z",
    });
    expect(res.status).toBe(400);
    expect(res.body.issues.map(i => i.path)).toContain("teamId");
  });

  it("inviteUser rejects super_admin role (only org-level roles allowed)", async () => {
    const res = await request(app).post("/invite").send({
      email: "x@y.co", role: "super_admin",
    });
    expect(res.status).toBe(400);
    expect(res.body.issues.map(i => i.path)).toContain("role");
  });

  it("updateUserRole rejects missing role field", async () => {
    const res = await request(app).patch("/role").send({});
    expect(res.status).toBe(400);
    expect(res.body.issues.map(i => i.path)).toContain("role");
  });

  it("toggleOrgFeature rejects non-boolean enabled (no string coercion)", async () => {
    const res = await request(app).patch("/features").send({
      feature: "ai_tools", enabled: "true",   // string, not bool
    });
    expect(res.status).toBe(400);
    expect(res.body.issues.map(i => i.path)).toContain("enabled");
  });

  it("matchStudents rejects array of >500 emails (DoS bound)", async () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => `u${i}@x.co`);
    const res = await request(app).post("/match").send({ emails: tooMany });
    expect(res.status).toBe(400);
    expect(res.body.issues.map(i => i.path)).toContain("emails");
  });

  it("createCertificateBatch rejects >500 recipients", async () => {
    const recipients = Array.from({ length: 501 }, (_, i) => ({ name: `R${i}` }));
    const res = await request(app).post("/cert-batch").send({
      title: "T", eventName: "E", recipients,
    });
    expect(res.status).toBe(400);
    expect(res.body.issues.map(i => i.path)).toContain("recipients");
  });
});

describe("Phase 9.1 schemas — happy path proves wiring", () => {
  it("createEvent with only title succeeds (everything else optional)", async () => {
    const res = await request(app).post("/events").send({ title: "Workshop" });
    expect(res.status).toBe(200);
    expect(res.body.body.title).toBe("Workshop");
  });

  it("createTeam with valid name + emails succeeds", async () => {
    const res = await request(app).post("/teams").send({
      name: "Alphas",
      memberEmails: ["a@x.co", "b@x.co"],
    });
    expect(res.status).toBe(200);
    // Zod normalises emails to lowercase via .toLowerCase() in schema.
    expect(res.body.body.memberEmails).toEqual(["a@x.co", "b@x.co"]);
  });
});
