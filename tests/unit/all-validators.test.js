/**
 * Unit tests for the remaining Zod validator schemas — challenges,
 * certificates, admin, contact, projects, announcements.
 *
 * Bundled into one file because each schema is small and they all
 * follow the same happy-path + enum-rejection + cap-enforcement
 * pattern. Splitting into six files would be ~30 lines of boilerplate
 * per file and no real maintainability win.
 *
 * Pure schema parsing — no Express, no Supabase, no controllers.
 */

import { describe, it, expect } from "vitest";
import {
  createChallengeSchema,
  updateChallengeSchema,
} from "../../backend/validators/challenges.js";
import {
  matchStudentsSchema,
  createCertificateBatchSchema,
} from "../../backend/validators/certificates.js";
import {
  inviteUserSchema,
  updateUserRoleSchema,
  toggleOrgFeatureSchema,
} from "../../backend/validators/admin.js";
import { contactSchema } from "../../backend/validators/contact.js";
import {
  createTeamSchema,
  submitProjectSchema,
  addCategorySchema,
} from "../../backend/validators/projects.js";
import { createAnnouncementSchema } from "../../backend/validators/announcements.js";

// ═══════════════════════════════════════════════════════════
// challenges.js
// ═══════════════════════════════════════════════════════════

const validChallenge = {
  title:         "Integrate x^2",
  question:      "Evaluate ∫ x² dx.",
  options:       ["x^2/2", "x^3/3 + C", "2x", "x^3 + C"],
  correct_index: 1,
  difficulty:    "medium",
  points:        50,
};

describe("createChallengeSchema", () => {
  it("accepts a complete valid payload", () => {
    expect(createChallengeSchema.safeParse(validChallenge).success).toBe(true);
  });

  it("rejects options array with the wrong length", () => {
    const r = createChallengeSchema.safeParse({ ...validChallenge, options: ["a","b","c"] });
    expect(r.success).toBe(false);
  });

  it("rejects correct_index outside 0..3", () => {
    expect(createChallengeSchema.safeParse({ ...validChallenge, correct_index: 4 }).success).toBe(false);
    expect(createChallengeSchema.safeParse({ ...validChallenge, correct_index: -1 }).success).toBe(false);
  });

  it("coerces string correct_index + points to numbers", () => {
    const r = createChallengeSchema.safeParse({ ...validChallenge, correct_index: "2", points: "100" });
    expect(r.success).toBe(true);
    expect(r.data.correct_index).toBe(2);
    expect(r.data.points).toBe(100);
  });

  it("rejects difficulty outside the enum", () => {
    const r = createChallengeSchema.safeParse({ ...validChallenge, difficulty: "insane" });
    expect(r.success).toBe(false);
  });

  it("rejects points > 1000 (DoS cap)", () => {
    const r = createChallengeSchema.safeParse({ ...validChallenge, points: 1001 });
    expect(r.success).toBe(false);
  });

  it("requires a non-empty title", () => {
    const r = createChallengeSchema.safeParse({ ...validChallenge, title: "   " });
    expect(r.success).toBe(false);
  });
});

describe("updateChallengeSchema", () => {
  it("accepts an empty patch", () => {
    expect(updateChallengeSchema.safeParse({}).success).toBe(true);
  });

  it("still enforces shape on the fields that ARE present", () => {
    const r = updateChallengeSchema.safeParse({ difficulty: "impossible" });
    expect(r.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// certificates.js
// ═══════════════════════════════════════════════════════════

describe("matchStudentsSchema", () => {
  it("accepts an email array", () => {
    const r = matchStudentsSchema.safeParse({ emails: ["a@b.com", "c@d.com"] });
    expect(r.success).toBe(true);
  });

  it("rejects empty array", () => {
    const r = matchStudentsSchema.safeParse({ emails: [] });
    expect(r.success).toBe(false);
  });

  it("rejects array larger than 500 (pg param-limit cap)", () => {
    const emails = Array(501).fill("a@b.com");
    const r = matchStudentsSchema.safeParse({ emails });
    expect(r.success).toBe(false);
  });

  it("rejects array with any malformed email", () => {
    const r = matchStudentsSchema.safeParse({ emails: ["a@b.com", "bad"] });
    expect(r.success).toBe(false);
  });
});

describe("createCertificateBatchSchema", () => {
  const validBatch = {
    title:      "Math Mania 2026",
    eventName:  "Math Mania",
    certType:   "PARTICIPATION",
    recipients: [{ name: "Alice", email: "alice@b.com" }],
  };

  it("accepts a minimal valid batch", () => {
    expect(createCertificateBatchSchema.safeParse(validBatch).success).toBe(true);
  });

  it("rejects unknown certType", () => {
    const r = createCertificateBatchSchema.safeParse({ ...validBatch, certType: "HEROIC" });
    expect(r.success).toBe(false);
  });

  it("defaults certType to PARTICIPATION when omitted", () => {
    const r = createCertificateBatchSchema.safeParse({
      title: "x", eventName: "y", recipients: [{ name: "A" }],
    });
    expect(r.success).toBe(true);
    expect(r.data.certType).toBe("PARTICIPATION");
  });

  it("requires at least one recipient", () => {
    const r = createCertificateBatchSchema.safeParse({ ...validBatch, recipients: [] });
    expect(r.success).toBe(false);
  });

  it("caps at 500 recipients per batch", () => {
    const recipients = Array(501).fill({ name: "A" });
    const r = createCertificateBatchSchema.safeParse({ ...validBatch, recipients });
    expect(r.success).toBe(false);
  });

  it("caps logos at 5", () => {
    const logoFilenames = Array(6).fill("logo.png");
    const r = createCertificateBatchSchema.safeParse({ ...validBatch, logoFilenames });
    expect(r.success).toBe(false);
  });

  it("caps signatories at 4", () => {
    const signatories = Array(5).fill({ name: "x" });
    const r = createCertificateBatchSchema.safeParse({ ...validBatch, signatories });
    expect(r.success).toBe(false);
  });

  it("rejects recipient with empty name", () => {
    const r = createCertificateBatchSchema.safeParse({ ...validBatch, recipients: [{ name: "" }] });
    expect(r.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// admin.js
// ═══════════════════════════════════════════════════════════

describe("inviteUserSchema", () => {
  it("accepts a valid invite", () => {
    const r = inviteUserSchema.safeParse({ email: "new@org.com", role: "teacher" });
    expect(r.success).toBe(true);
  });

  it("defaults role to student", () => {
    const r = inviteUserSchema.safeParse({ email: "new@org.com" });
    expect(r.success).toBe(true);
    expect(r.data.role).toBe("student");
  });

  it("REJECTS super_admin assignment (must be minted by platform owner only)", () => {
    const r = inviteUserSchema.safeParse({ email: "a@b.com", role: "super_admin" });
    expect(r.success).toBe(false);
  });

  it("rejects random role string", () => {
    const r = inviteUserSchema.safeParse({ email: "a@b.com", role: "moderator" });
    expect(r.success).toBe(false);
  });
});

describe("updateUserRoleSchema", () => {
  it("role is required", () => {
    expect(updateUserRoleSchema.safeParse({}).success).toBe(false);
  });

  it("rejects super_admin assignment via this endpoint", () => {
    expect(updateUserRoleSchema.safeParse({ role: "super_admin" }).success).toBe(false);
  });

  it.each(["student", "teacher", "admin"])("accepts %s", (role) => {
    expect(updateUserRoleSchema.safeParse({ role }).success).toBe(true);
  });
});

describe("toggleOrgFeatureSchema", () => {
  it("accepts a clean toggle", () => {
    const r = toggleOrgFeatureSchema.safeParse({ feature: "ai_tools", enabled: false });
    expect(r.success).toBe(true);
  });

  it("REFUSES to coerce a string 'false' to boolean (would mask bugs)", () => {
    const r = toggleOrgFeatureSchema.safeParse({ feature: "x", enabled: "false" });
    expect(r.success).toBe(false);
  });

  it("rejects empty feature name", () => {
    expect(toggleOrgFeatureSchema.safeParse({ feature: "", enabled: true }).success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// contact.js
// ═══════════════════════════════════════════════════════════

describe("contactSchema", () => {
  it("accepts a minimal contact message (email + message)", () => {
    const r = contactSchema.safeParse({ email: "a@b.com", message: "Hi" });
    expect(r.success).toBe(true);
  });

  it("rejects whitespace-only message", () => {
    const r = contactSchema.safeParse({ email: "a@b.com", message: "   " });
    expect(r.success).toBe(false);
  });

  it("rejects 5001-char message (DoS cap)", () => {
    const r = contactSchema.safeParse({ email: "a@b.com", message: "x".repeat(5001) });
    expect(r.success).toBe(false);
  });

  it("accepts optional name + subject", () => {
    const r = contactSchema.safeParse({
      email: "a@b.com", message: "Hi", name: "Alice", subject: "Question",
    });
    expect(r.success).toBe(true);
  });

  it("rejects malformed email even if message is fine", () => {
    expect(contactSchema.safeParse({ email: "not-email", message: "Hi" }).success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// projects.js
// ═══════════════════════════════════════════════════════════

describe("createTeamSchema", () => {
  it("accepts a team name alone", () => {
    expect(createTeamSchema.safeParse({ name: "Code Knights" }).success).toBe(true);
  });

  it("accepts member emails", () => {
    const r = createTeamSchema.safeParse({
      name: "Code Knights",
      memberEmails: ["a@b.com", "c@d.com"],
    });
    expect(r.success).toBe(true);
  });

  it("caps memberEmails at 20", () => {
    const memberEmails = Array(21).fill("a@b.com");
    expect(createTeamSchema.safeParse({ name: "T", memberEmails }).success).toBe(false);
  });

  it("accepts empty-string members (controller filters)", () => {
    const r = createTeamSchema.safeParse({ name: "T", memberEmails: ["", "a@b.com"] });
    expect(r.success).toBe(true);
  });

  it("rejects team name > 80 chars", () => {
    expect(createTeamSchema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
  });
});

describe("submitProjectSchema", () => {
  const valid = {
    teamId:      "00000000-0000-0000-0000-000000000000",
    title:       "X",
    description: "A project",
    category:    "Best Math Game",
  };

  it("accepts a valid submission", () => {
    expect(submitProjectSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects non-UUID teamId", () => {
    expect(submitProjectSchema.safeParse({ ...valid, teamId: "not-uuid" }).success).toBe(false);
  });

  it("accepts empty-string URLs (optional)", () => {
    const r = submitProjectSchema.safeParse({ ...valid, github_url: "", demo_url: "" });
    expect(r.success).toBe(true);
  });

  it("accepts valid URLs", () => {
    const r = submitProjectSchema.safeParse({
      ...valid,
      github_url: "https://github.com/a/b",
      demo_url:   "https://demo.com",
    });
    expect(r.success).toBe(true);
  });

  it("rejects malformed URL (not an http(s) URI)", () => {
    const r = submitProjectSchema.safeParse({ ...valid, github_url: "not a url" });
    expect(r.success).toBe(false);
  });
});

describe("addCategorySchema", () => {
  it("accepts a simple category", () => {
    expect(addCategorySchema.safeParse({ name: "ML" }).success).toBe(true);
  });

  it("accepts a category with an emoji icon", () => {
    expect(addCategorySchema.safeParse({ name: "Games", icon: "🎮" }).success).toBe(true);
  });

  it("caps icon at 8 chars (one emoji or a couple)", () => {
    expect(addCategorySchema.safeParse({ name: "x", icon: "x".repeat(9) }).success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// announcements.js
// ═══════════════════════════════════════════════════════════

describe("createAnnouncementSchema", () => {
  it("accepts a valid announcement with default target_role", () => {
    const r = createAnnouncementSchema.safeParse({
      title: "Maintenance",
      body:  "Site down 10-11 pm",
    });
    expect(r.success).toBe(true);
    expect(r.data.target_role).toBe("all");
  });

  it.each(["all", "student", "teacher"])("accepts target_role=%s", (target_role) => {
    const r = createAnnouncementSchema.safeParse({ title: "T", body: "B", target_role });
    expect(r.success).toBe(true);
  });

  it("rejects unknown target_role (e.g. 'admin' — announcements don't target admins)", () => {
    const r = createAnnouncementSchema.safeParse({ title: "T", body: "B", target_role: "admin" });
    expect(r.success).toBe(false);
  });

  it("enforces 2000-char body cap (push payload size)", () => {
    const r = createAnnouncementSchema.safeParse({ title: "T", body: "x".repeat(2001) });
    expect(r.success).toBe(false);
  });

  it("enforces 120-char title cap", () => {
    const r = createAnnouncementSchema.safeParse({ title: "x".repeat(121), body: "B" });
    expect(r.success).toBe(false);
  });
});
