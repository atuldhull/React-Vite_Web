import supabase from "../../config/supabase.js";

/* Get all scheduled tests — GET /api/admin/data/tests */
export const getAllScheduledTests = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("scheduled_tests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* Delete a scheduled test — DELETE /api/admin/data/tests/:testId */
export const deleteScheduledTest = async (req, res) => {
  try {
    await supabase.from("test_attempts").delete().eq("test_id", req.params.testId);
    const { error } = await supabase.from("scheduled_tests").delete().eq("id", req.params.testId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};
