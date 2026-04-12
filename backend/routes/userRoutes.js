import express from "express";
import { getProfile, updateProfile, getUserStats, changePassword, getTestHistory } from "../controllers/userController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/profile",          requireAuth, getProfile);
router.patch("/profile",        requireAuth, updateProfile);
router.get("/stats",            requireAuth, getUserStats);
router.post("/change-password", requireAuth, changePassword);
router.get("/test-history",     requireAuth, getTestHistory);

// Public student profile (for viewing other students)
router.get("/student/:userId",  requireAuth, async (req, res) => {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await supabase
      .from("students")
      .select("user_id, name, email, xp, weekly_xp, title, bio, avatar_emoji, avatar_color, avatar_config, role, department")
      .eq("user_id", req.params.userId)
      .single();
    if (!data) return res.status(404).json({ error: "Student not found" });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
