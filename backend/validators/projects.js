/**
 * Zod schemas for /api/projects/* mutations.
 *
 * createTeam — { name, memberEmails[] }
 * submitProject — full project shape
 * addCategory — admin-only category add
 *
 * URL params (e.g. :id on /vote, /approve) aren't validated here —
 * those are UUIDs already verified at the DB layer (FK lookup
 * returns null on miss, controller returns 404).
 */

import { z } from "zod";

const email = z.string().trim().toLowerCase()
  .email("must be a valid email")
  .max(320, "email too long");

export const createTeamSchema = z.object({
  name:         z.string().trim().min(1, "team name required").max(80, "name too long"),
  // Up to 5 EXTRA member emails (the 6th member is the leader).
  // Empty/null entries get filtered by the controller; we cap the
  // array size to bound DB lookup cost.
  memberEmails: z.array(email.or(z.literal(""))).max(20, "too many members").optional(),
});

export const submitProjectSchema = z.object({
  teamId:      z.string().uuid("teamId must be a UUID"),
  title:       z.string().trim().min(1, "title required").max(200),
  description: z.string().trim().min(1, "description required").max(8000),
  category:    z.string().trim().min(1, "category required").max(60),
  github_url:  z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
  demo_url:    z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
});

export const addCategorySchema = z.object({
  name: z.string().trim().min(1, "name required").max(60, "name too long"),
  icon: z.string().trim().max(8, "icon too long").optional(),  // 1 emoji typically
});
