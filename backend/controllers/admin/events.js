import supabase from "../../config/supabase.js";

/* ═══════════════════════════════════════════
   EVENTS — All CRUD (use `date` column)
   BUG FIX: was using event_date — table has `date`
═══════════════════════════════════════════ */

export const getAdminEvents = async (req, res) => {
  try {
    const { data, error } = await req.db
      .from("events")
      .select("*")
      .order("date", { ascending: true });    // ← FIXED: was event_date

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch {
    return res.status(500).json({ error: "Failed to fetch events" });
  }
};

export const createEvent = async (req, res) => {
  try {
    const { title, description, location, date } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });

    const { data, error } = await req.db
      .from("events")
      .insert({ title, description, location, date })  // ← uses `date` column
      .select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ success: true, event: data });
  } catch {
    return res.status(500).json({ error: "Failed to create event" });
  }
};

export const updateEvent = async (req, res) => {
  try {
    const { data, error } = await req.db
      .from("events")
      .update(req.body)
      .eq("id", req.params.id)
      .select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, event: data });
  } catch {
    return res.status(500).json({ error: "Failed to update event" });
  }
};

export const deleteEvent = async (req, res) => {
  try {
    const { error } = await req.db.from("events").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Failed to delete event" });
  }
};
