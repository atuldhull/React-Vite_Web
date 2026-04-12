import supabase from "../../config/supabase.js";

/* Delete a team and its project — DELETE /api/admin/data/teams/:teamId */
export const deleteTeam = async (req, res) => {
  try {
    // Projects cascade delete via FK, but delete explicitly first
    await supabase.from("projects").delete().eq("team_id", req.params.teamId);
    const { error } = await supabase.from("teams").delete().eq("id", req.params.teamId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: "Team and project deleted" });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* Delete a project — DELETE /api/admin/data/projects/:projectId */
export const deleteProject = async (req, res) => {
  try {
    await supabase.from("project_votes").delete().eq("project_id", req.params.projectId);
    const { error } = await supabase.from("projects").delete().eq("id", req.params.projectId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: "Project deleted" });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* Get all teams with their projects — GET /api/admin/data/teams */
export const getAllTeams = async (req, res) => {
  try {
    const { data: teams, error } = await supabase
      .from("teams")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    const { data: projects } = await supabase
      .from("projects")
      .select("id, team_id, title, is_approved, total_points, category");

    const projectMap = {};
    (projects || []).forEach(p => { projectMap[p.team_id] = p; });

    // Enrich with member names
    const { data: students } = await supabase
      .from("students")
      .select("user_id, name, email");
    const studentMap = {};
    (students || []).forEach(s => { studentMap[s.user_id] = s; });

    const enriched = (teams || []).map(t => ({
      ...t,
      project: projectMap[t.id] || null,
      member_names: (t.members || []).map(uid => studentMap[uid]?.name || studentMap[uid]?.email || uid),
    }));

    return res.json(enriched);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};
