/**
 * Zod schema for POST /api/contact/send.
 *
 * Replaces the ad-hoc email/length checks that were inline in
 * contactController.sendContactMessage. The HTML escaping step in
 * the controller still runs — Zod enforces presence / format /
 * length, escaping handles content that's legitimately present but
 * needs to be safe for inclusion in an HTML email.
 */

import { z } from "zod";

export const contactSchema = z.object({
  // `trim` happens BEFORE length checks so "   " doesn't slip past
  // min(1). The email format regex is Zod's built-in (RFC 5322-ish).
  name:    z.string().trim().max(200, "name too long").optional(),
  subject: z.string().trim().max(200, "subject too long").optional(),
  email:   z.string().trim().toLowerCase()
             .email("invalid email format")
             .max(320, "email too long"),
  message: z.string().trim()
             .min(1,    "message required")
             .max(5000, "message too long (max 5000 chars)"),
});
