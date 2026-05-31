/**
 * Zod schemas for /api/problems/* mutations.
 *
 * Reads are unvalidated (controller validates query params manually
 * with cheap whitelists — no Zod ceremony for "is this string in a
 * 6-element enum"). Writes are admin/teacher-only via requireTeacher
 * middleware upstream, but still validated here so a misbehaving
 * admin client can't ship a 5 MB description or smuggle extra keys.
 */

import { z } from "zod";

const DIFFICULTY = z.enum(["beginner", "intermediate", "advanced"]);
const SOURCE     = z.enum(["SIH", "GSoC", "Kaggle", "MLH", "Devfolio", "Unstop", "OpenSource"]);

// link arrays — bounded so a hostile admin can't bloat a row with
// 100K of resource_links.
const linkItem = z.object({
  label:  z.string().trim().min(1, "label required").max(120),
  url:    z.string().trim().url("must be a URL").max(500),
  format: z.string().trim().max(40).optional(),    // for dataset_links
  kind:   z.string().trim().max(40).optional(),    // for resource_links
}).strict();

export const createProblemSchema = z.object({
  slug:           z.string().trim().min(3).max(100).regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, digits, hyphens").optional(),
  title:          z.string().trim().min(3, "title too short").max(200, "title too long"),
  description:    z.string().trim().min(20, "description too short").max(8000, "description too long"),
  how_to_start:   z.string().trim().max(4000, "how_to_start too long").optional(),
  domain:         z.string().trim().min(2).max(40),
  difficulty:     DIFFICULTY.default("intermediate"),
  organisation:   z.string().trim().max(120).optional(),
  source:         SOURCE,
  source_event:   z.string().trim().max(60).optional(),
  official_url:   z.string().trim().url("must be a URL").max(500).optional(),
  dataset_links:  z.array(linkItem).max(20, "max 20 dataset links").default([]),
  resource_links: z.array(linkItem).max(30, "max 30 resource links").default([]),
  tags:           z.array(z.string().trim().min(1).max(40)).max(15, "max 15 tags").default([]),
  is_active:      z.boolean().default(true),
}).strict();

// PATCH variant — every field optional, but the same caps apply.
export const updateProblemSchema = createProblemSchema.partial();

// ─── Engagement: writeups ──────────────────────────────────────
// Students can post one writeup per problem (UNIQUE(problem,user)).
// 16KB body cap matches the column cap in the controller — keeps a
// hostile client from shipping a 5MB markdown blob. repo_url is
// optional; when present must be a URL.
export const writeupSchema = z.object({
  title:    z.string().trim().min(3, "title too short").max(200, "title too long"),
  body:     z.string().trim().min(20, "body too short").max(16000, "body too long"),
  repo_url: z.string().trim().url("must be a URL").max(500).optional().or(z.literal("")),
}).strict();
