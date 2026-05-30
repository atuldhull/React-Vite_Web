/**
 * Zod schemas for /api/comments/* mutations.
 *
 * Two routes covered:
 *   POST /api/comments/:challengeId         — student posts a comment
 *   POST /api/comments/:challengeId/ask-ai  — student asks PANDA via OpenRouter
 *
 * The challenge_comments table caps content to 1000 chars (the
 * controller slices); pulling that limit into Zod stops a malicious
 * client from shipping a 1.9 MB JSON body (under the global 2 MB cap)
 * just to waste DB cycles before the truncation.
 */

import { z } from "zod";

/* POST /api/comments/:challengeId
   content matches the controller's .trim().slice(0, 1000) — same limit,
   enforced earlier. Strict-keyed: any extra field (e.g. an injected
   user_name override) is rejected outright. */
export const postCommentSchema = z.object({
  content: z.string().trim().min(1, "content required").max(1000, "comment too long"),
}).strict();

/* POST /api/comments/:challengeId/ask-ai
   question: bounded to a single-paragraph prompt; AI calls upstream
   are expensive and a long prompt costs tokens.
   challengeTitle: client-supplied context for the system prompt; bounded
   to a reasonable length so it can't be used to smuggle in a few-KB
   pseudo-prompt-injection payload. */
export const askAiSchema = z.object({
  question:       z.string().trim().min(1, "question required").max(2000, "question too long"),
  challengeTitle: z.string().trim().max(200, "title too long").optional(),
}).strict();
