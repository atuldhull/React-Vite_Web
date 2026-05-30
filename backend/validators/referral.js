/**
 * Zod schema for POST /api/referral/apply.
 *
 * Anti-abuse here mirrors the controller's invariants:
 *   - codes are uppercased + trimmed inside the controller before lookup
 *   - codes are uniformly short (referral_codes.code is a varchar)
 * Capping length stops a megabyte body from reaching the .toUpperCase()
 * + .trim() + Supabase query chain. The strict schema rejects extra
 * keys, which closes a hypothetical "code + force_referrer_id" body
 * shape an attacker might probe for.
 */

import { z } from "zod";

export const applyReferralCodeSchema = z.object({
  code: z.string().trim().min(3, "code too short").max(32, "code too long"),
}).strict();
