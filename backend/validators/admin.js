/**
 * Zod schemas for org-admin mutations under /api/admin/* and
 * /api/org-admin/*.
 *
 * Roles enum is intentionally narrow — `super_admin` is NOT
 * assignable here (only the platform owner via super-admin tooling
 * can mint a super_admin). Trying to PATCH a user's role to
 * super_admin via /api/admin/users/:id/role gets a 400 with a
 * field-level message instead of a confusing controller-level reject.
 */

import { z } from "zod";

const orgRole = z.enum(["student", "teacher", "admin"]);

export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase()
           .email("must be a valid email")
           .max(320, "email too long"),
  role:  orgRole.default("student"),
});

export const updateUserRoleSchema = z.object({
  role: orgRole,  // required — there's nothing else this endpoint does
});

export const toggleOrgFeatureSchema = z.object({
  feature: z.string().trim().min(1, "feature name required").max(60),
  enabled: z.boolean(),  // explicit boolean — coerced bools (e.g. from "false" strings) hide bugs
});
