/**
 * Core Team — trends wall.
 *
 * The actual fetching lives in services/coreTrends.js (runs every 4h).
 * This controller just reads the stored cards and lets the council
 * trigger an on-demand refresh.
 */
import supabase from "../../config/supabase.js";
import { catchAsync } from "../../lib/asyncHandler.js";
import { runTrendsFetch } from "../../services/coreTrends.js";

/* GET /api/core/trends — newest cards, optional ?category= filter */
export const listTrends = catchAsync(async (req, res) => {
  const { category } = req.query;
  let query = supabase
    .from("core_trends")
    .select("*")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("fetched_at", { ascending: false })
    .limit(60);
  if (category && category !== "All") query = query.eq("category", category);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: "Could not load trends." });

  const categories = [...new Set((data || []).map((t) => t.category))];
  return res.json({ trends: data || [], categories });
});

/* POST /api/core/trends/refresh — council triggers an immediate pull */
export const refreshTrends = catchAsync(async (_req, res) => {
  const added = await runTrendsFetch();
  return res.json({ success: true, added });
});
