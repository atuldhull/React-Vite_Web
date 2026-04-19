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

const recipientSchema = z.object({
  name:   z.string().trim().min(1).max(200),
  email:  email.optional(),
  userId: z.string().uuid().optional().nullable(),
});

const signatorySchema = z.object({
  name:                z.string().trim().max(200).optional(),
  title:               z.string().trim().max(200).optional(),
  signatureFilename:   z.string().trim().max(200).optional().nullable(),
});

export const createCertificateBatchSchema = z.object({
  title:           z.string().trim().min(1, "title required").max(200),
  eventName:       z.string().trim().min(1, "eventName required").max(200),
  eventDate:       z.string().trim().max(40).optional().nullable(),
  issuedBy:        z.string().trim().max(200).optional().nullable(),
  // Frontend sends lowercase short names ("participation", "achievement",
  // "winner", "merit"). Schema accepts BOTH those AND the legacy
  // uppercase enum that was here originally — upper-case the input,
  // then pipe into the union so a future UI refactor doesn't need to
  // change the backend. Older rows in the DB (created before this
  // commit) may carry "EXCELLENCE" or "APPRECIATION" — still valid.
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
  logoFilenames:   z.array(z.string().trim().max(200)).max(5, "max 5 logos").optional(),
  signatories:     z.array(signatorySchema).max(4, "max 4 signatories").optional(),
  recipients:      z.array(recipientSchema)
                    .min(1, "at least one recipient required")
                    .max(500, "max 500 recipients per batch"),
  sendEmail:       z.boolean().optional(),
});
