/**
 * Zod schema for POST /api/announcements (createAnnouncement).
 *
 * Tight bounds because announcements ship to every student in the
 * org via push + in-app banner — rendering a 50KB body would break
 * the UI and potentially overflow the push payload size limit.
 */

import { z } from "zod";

export const createAnnouncementSchema = z.object({
  title:       z.string().trim().min(1, "title required").max(120, "title too long"),
  body:        z.string().trim().min(1, "body required").max(2000, "body too long (max 2000 chars)"),
  target_role: z.enum(["all", "student", "teacher"]).default("all"),
});
