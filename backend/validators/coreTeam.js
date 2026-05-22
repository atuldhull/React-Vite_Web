/**
 * Zod schemas for /api/core/* mutations (Core Team portal).
 *
 * UUID path params (:id) aren't validated here — a bad id resolves
 * to a null row and the controller returns 404.
 */

import { z } from "zod";

const uuid = z.string().uuid();

/* ── Access ── */
// The controller upper-cases the code itself, so the schema just
// trims + length-checks — keeps it independent of the zod version's
// string-transform support.
export const redeemCodeSchema = z.object({
  code: z.string().trim().min(4, "code required").max(40),
});

/* ── Teams / members (council only) ── */
export const createTeamSchema = z.object({
  name:        z.string().trim().min(2, "team name required").max(60),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  accent:      z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "accent must be a hex colour").optional(),
});

export const addMemberSchema = z.object({
  name:     z.string().trim().min(2, "name required").max(80),
  email:    z.string().trim().toLowerCase().email("valid email required").max(320),
  teamId:   uuid.nullable().optional(),
  position: z.string().trim().min(2).max(40).optional(),
  tier:     z.enum(["council", "head", "member"]).optional(),
});

/* ── Tasks ── */
export const createTaskSchema = z.object({
  title:       z.string().trim().min(3, "title required").max(160),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  teamId:      uuid.nullable().optional(),       // null + isOpen → anonymous task
  isOpen:      z.boolean().optional(),
  points:      z.coerce.number().int().min(1).max(500).optional(),
  deadline:    z.string().datetime().optional().or(z.literal("")).nullable(),
});

export const submitTaskSchema = z.object({
  submission: z.string().trim().min(1, "add a note about what you did").max(4000),
});

/* ── Feedback ── */
export const createFeedbackSchema = z.object({
  scope:  z.enum(["club", "team"]),
  teamId: uuid.nullable().optional(),
  kind:   z.enum(["suggestion", "complaint"]),
  body:   z.string().trim().min(5, "say a little more").max(3000),
});

export const feedbackStatusSchema = z.object({
  status: z.enum(["open", "reviewed", "resolved"]),
});

/* ── Ideas ── */
export const createIdeaSchema = z.object({
  field: z.string().trim().min(2).max(40),
  title: z.string().trim().min(3, "title required").max(160),
  body:  z.string().trim().min(10, "describe the idea").max(4000),
});

/* ── Meetings ── */
export const createMeetingSchema = z.object({
  title:       z.string().trim().min(3, "title required").max(160),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  location:    z.string().trim().max(200).optional().or(z.literal("")),
  scheduledAt: z.string().datetime("pick a date and time"),
  teamId:      uuid.nullable().optional(),
});

export const rsvpSchema = z.object({
  status: z.enum(["going", "maybe", "no"]),
});

/* ── Chat ── */
export const chatMessageSchema = z.object({
  body: z.string().trim().min(1, "type a message").max(1000, "message too long"),
});
