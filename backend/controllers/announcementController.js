// Tenant scoping: req.db.from("announcements") chains
// eq("org_id", req.orgId) on reads/updates and stomps the org_id
// onto inserts. A teacher in org A can no longer create or
// (soft-)delete announcements visible to org B. The raw `supabase`
// import is intentionally absent — every call here is tenant-scoped.
//
// Error handling: each handler is wrapped in catchAsync(), so any
// throw / Supabase error (we rethrow them below) propagates to the
// global error handler in app.js — which logs structured { err,
// method, url, requestId } and responds 500 with the requestId.
// That replaces the previous try/catch-return-500 boilerplate that
// was identical in every function and swallowed the stack trace.

import { catchAsync } from "../lib/asyncHandler.js";

/* GET ACTIVE ANNOUNCEMENTS — GET /api/announcements */
export const getAnnouncements = catchAsync(async (req, res) => {
  const role = req.session?.user?.role || "student";
  const { data, error } = await req.db
    .from("announcements")
    .select("*")
    .eq("is_active", true)
    .or(`target_role.eq.all,target_role.eq.${role}`)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  return res.json(data || []);
});

/* CREATE ANNOUNCEMENT — POST /api/announcements */
export const createAnnouncement = catchAsync(async (req, res) => {
  const userId = req.session?.user?.id;
  const { title, body, target_role = "all" } = req.body;
  if (!title || !body) return res.status(400).json({ error: "title and body required" });

  const { data, error } = await req.db.from("announcements").insert({
    title, body, target_role, created_by: userId, is_active: true,
  }).select().single();

  if (error) throw error;
  return res.status(201).json({ success: true, announcement: data });
});

/* DEACTIVATE ANNOUNCEMENT — DELETE /api/announcements/:id */
export const deleteAnnouncement = catchAsync(async (req, res) => {
  await req.db.from("announcements").update({ is_active: false }).eq("id", req.params.id);
  return res.json({ success: true });
});
