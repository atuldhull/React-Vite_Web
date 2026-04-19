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

// UPI VPA regex — deliberately forgiving: a VPA is `handle@psp` where
// handle is alphanum/./-/_ and psp is alphanum. We don't enforce a PSP
// allow-list (hdfc/ybl/paytm/...) because new ones launch every year
// and bouncing a legitimate payment UPI ID on VALIDATION_FAILED is
// worse than accepting a slightly wrong one — the admin sees it before
// students use it.
const upiVpa      = z.string().trim().regex(/^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z]{2,20}$/, "must be a UPI ID like name@okhdfcbank");

// QR image stored inline as a data URL. Accept PNG or JPEG. Cap at
// 200KB of encoded string — a QR image is ~2-8 KB, so 200KB is ample
// headroom without letting a malicious admin stuff a 5MB payload into
// every event page. (200_000 chars of base64 ≈ 150KB binary.)
const qrDataUrl   = z.string().trim()
  .regex(/^data:image\/(png|jpe?g);base64,/, "must be a data:image/png or jpeg;base64 URL")
  .max(200_000, "QR image is too large — re-export at a lower resolution (target <50KB)");

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

  // Phase 14 (paid events — migration 19)
  // Manual UPI/QR reconciliation. is_paid without price_paise > 0 is
  // nonsensical but we validate that in the controller where we have
  // access to the merged update (partial updates make it awkward in Zod).
  is_paid:                z.boolean().optional(),
  price_paise:            z.coerce.number().int().min(0).max(10_00_00_00, "price cannot exceed ₹10 lakh").optional(),
  payment_upi_id:         upiVpa.optional().nullable(),
  payment_qr_base64:      qrDataUrl.optional().nullable(),
  payment_instructions:   z.string().trim().max(2000).optional().nullable(),

  // Team events — migration 22
  // Solo when is_team_event=false (default). When true, the
  // registering leader must name a team and declare a member count
  // in [min_team_size, max_team_size]. DB CHECK enforces
  // 1 <= min <= max <= 50; we mirror that here so Zod fails the
  // admin form early with a clear message.
  is_team_event:          z.boolean().optional(),
  min_team_size:          z.coerce.number().int().min(1).max(50).optional(),
  max_team_size:          z.coerce.number().int().min(1).max(50).optional(),
};

// Create requires a title; controller treats everything else as optional.
export const createEventSchema = z.object(eventShape);

// Update: all-partial. The controller's `allowed` list gates which
// fields actually persist; Zod gates the SHAPE of those that do.
export const updateEventSchema = z.object(eventShape).partial();
