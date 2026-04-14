/**
 * Zod schemas for /api/challenge/* mutations.
 *
 * createChallenge: full schema, all fields required where the
 * controller would 400 on missing.
 * updateChallenge: partial — only the fields the caller wants to
 * change; the controller does PATCH-style merge.
 */

import { z } from "zod";

const difficultyEnum = z.enum(["easy", "medium", "hard", "extreme"]);

const challengeShape = {
  title:         z.string().trim().min(1, "title required").max(200, "title too long"),
  question:      z.string().trim().min(1, "question required").max(4000, "question too long"),
  options:       z.array(z.string().trim().min(1).max(500))
                  .length(4, "options must be array of exactly 4 strings"),
  correct_index: z.coerce.number().int("must be integer").min(0).max(3, "correct_index must be 0..3"),
  difficulty:    difficultyEnum.default("medium"),
  points:        z.coerce.number().int().min(1).max(1000).default(50),
  solution:      z.string().trim().max(8000).optional().nullable(),
};

export const createChallengeSchema = z.object(challengeShape);

// Update accepts the same fields, but all optional. partial() handles
// that mechanically. The controller then merges into the existing row.
export const updateChallengeSchema = z.object(challengeShape).partial();
