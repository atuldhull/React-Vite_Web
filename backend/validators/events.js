/**
 * Zod schemas for /api/events mutations.
 *
 * Event records are the largest mutation payloads in the app — many
 * fields, many optional. Keep types loose for free-form fields
 * (description, organiser) but strict on enums + numerics.
 */

import { z } from "zod";

// Common pieces
const isoDate     = z.string().trim().datetime().or(z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "must be ISO-8601 or YYYY-MM-DD"));
const venueType   = z.enum(["in-person", "online", "hybrid"]);
const eventType   = z.string().trim().min(1).max(50).default("general");
const hexColor    = z.string().trim().regex(/^#[0-9a-fA-F]{3,8}$/, "must be a hex color like #7c3aed");
const httpUrl     = z.string().trim().url("must be a URL");

const eventShape = {
  title:                  z.string().trim().min(1, "title required").max(200, "title too long"),
  description:            z.string().trim().max(8000).optional().nullable(),
  date:                   isoDate.optional().nullable(),
  location:               z.string().trim().max(300).optional().nullable(),
  time:                   z.string().trim().max(60).optional().nullable(),
  registration_form_url:  httpUrl.optional().nullable(),
  registration_deadline:  isoDate.optional().nullable(),
  registration_open:      z.boolean().optional(),
  max_registrations:      z.coerce.number().int().min(0).max(100000).optional().nullable(),
  event_type:             eventType.optional(),
  organiser:              z.string().trim().max(200).optional().nullable(),
  tags:                   z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  banner_color:           hexColor.optional(),
  is_active:              z.boolean().optional(),

  // Phase 2 event-upgrade fields
  capacity:               z.coerce.number().int().min(0).max(100000).optional().nullable(),
  venue_type:             venueType.optional(),
  venue_link:             httpUrl.optional().nullable(),
  xp_reward:              z.coerce.number().int().min(0).max(10000).optional(),
  xp_bonus_first:         z.coerce.number().int().min(0).max(10000).optional(),
  xp_bonus_winner:        z.coerce.number().int().min(0).max(10000).optional(),
  requires_checkin:       z.boolean().optional(),
  checkin_code:           z.string().trim().max(40).optional().nullable(),
  starts_at:              isoDate.optional().nullable(),
  ends_at:                isoDate.optional().nullable(),
  cover_image_url:        httpUrl.optional().nullable(),
};

// Create requires a title; controller treats everything else as optional.
export const createEventSchema = z.object(eventShape);

// Update: all-partial. The controller's `allowed` list gates which
// fields actually persist; Zod gates the SHAPE of those that do.
export const updateEventSchema = z.object(eventShape).partial();
