/**
 * Zod schemas for /api/certificates/* mutations.
 *
 * createCertificateBatch is the heaviest validation surface in the
 * app — it accepts arrays of recipients, optional asset references,
 * and free-form text the AI generator embeds in LaTeX. Bound array
 * sizes so a malicious caller can't trigger a 10k-cert generation
 * loop with one POST.
 *
 * matchStudents is a small lookup — bound the email array to keep
 * the IN(...) query under Postgres's parameter limit.
 */

import { z } from "zod";

const email = z.string().trim().toLowerCase()
  .email()
  .max(320);

export const matchStudentsSchema = z.object({
  emails: z.array(email).min(1, "emails required").max(500, "too many emails (max 500)"),
});

const recipientObjectSchema = z.object({
  name:   z.string().trim().min(1).max(200),
  email:  email.optional(),
  userId: z.string().uuid().optional().nullable(),
});

const signatorySchema = z.object({
  name:                z.string().trim().max(200).optional(),
  title:               z.string().trim().max(200).optional(),
  signatureFilename:   z.string().trim().max(200).optional().nullable(),
});

// The current teacher UI (TeacherCertificatesPage) sends a simpler
// shape than what the original richer controller expected:
//   - recipients as a newline-separated string rather than an array
//     of {name,email,userId} objects
//   - logoUrl / sigUrl (the full upload path) instead of the richer
//     logoFilenames[] + signatories[] arrays
//   - no `title` field — the event name is used as the batch title
//   - a `palette` colour key that the older schema ignored
//
// Rather than force a frontend refactor and risk a day of bug
// chasing mid-prod, we accept BOTH shapes: the rich shape stays
// valid for API callers + future frontends, and the simple shape
// is normalised into the rich shape by the controller before use.
// Schema is a union so a payload missing `title` + with a string
// `recipients` + with `logoUrl` still passes validation.

const logoUrlToFilename = z
  .string()
  .trim()
  .max(400)
  .transform((s) => s.replace(/^.*\/cert-assets\//, "").replace(/^\/+/, ""));

const recipientsField = z.union([
  z.array(recipientObjectSchema)
    .min(1, "at least one recipient required")
    .max(500, "max 500 recipients per batch"),
  // Simple string form — split by newlines in the controller. Capped
  // well below 500-line input to keep the transform cheap.
  z.string().trim().min(1).max(30_000),
]);

export const createCertificateBatchSchema = z.object({
  // title becomes optional — controller falls back to eventName when
  // absent (the simple UI's batch "title" == the event name anyway).
  title:           z.string().trim().min(1).max(200).optional(),
  eventName:       z.string().trim().min(1, "eventName required").max(200),
  eventDate:       z.string().trim().max(40).optional().nullable(),
  issuedBy:        z.string().trim().max(200).optional().nullable(),
  certType:        z.string().trim().toUpperCase()
                    .pipe(z.enum([
                      "PARTICIPATION",
                      "ACHIEVEMENT",
                      "WINNER",
                      "MERIT",
                      "EXCELLENCE",
                      "APPRECIATION",
                    ]))
                    .default("PARTICIPATION"),
  organiserLine:   z.string().trim().max(400).optional(),
  bodyText:        z.string().trim().max(4000).optional(),
  // Rich form (original API).
  logoFilenames:   z.array(z.string().trim().max(200)).max(5).optional(),
  signatories:     z.array(signatorySchema).max(4).optional(),
  // Simple form (what the teacher UI actually sends — a single
  // upload URL per asset). Either form is accepted; controller
  // reconciles into the rich form.
  logoUrl:         logoUrlToFilename.optional().nullable(),
  sigUrl:          logoUrlToFilename.optional().nullable(),
  // UI colour-palette hint — cosmetic, safe to accept any string.
  palette:         z.string().trim().max(40).optional(),
  recipients:      recipientsField,
  sendEmail:       z.boolean().optional(),
});
