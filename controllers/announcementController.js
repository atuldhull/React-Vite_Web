import supabase from "../config/supabase.js";

/* GET ACTIVE ANNOUNCEMENTS — GET /api/announcements */
export const getAnnouncements = async (req, res) => {
  const role = req.session?.user?.role || "student";
  try {
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .eq("is_active", true)
      .or(`target_role.eq.all,target_role.eq.${role}`)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* CREATE ANNOUNCEMENT — POST /api/announcements */
export const createAnnouncement = async (req, res) => {
  const userId = req.session?.user?.id;
  try {
    const { title, body, target_role = "all" } = req.body;
    if (!title || !body) return res.status(400).json({ error: "title and body required" });

    const { data, error } = await supabase.from("announcements").insert({
      title, body, target_role, created_by: userId, is_active: true,
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ success: true, announcement: data });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* DEACTIVATE ANNOUNCEMENT — DELETE /api/announcements/:id */
export const deleteAnnouncement = async (req, res) => {
  try {
    await supabase.from("announcements").update({ is_active: false }).eq("id", req.params.id);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};
