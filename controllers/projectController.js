import supabase from "../config/supabase.js";

/* GET ALL PROJECTS — GET /api/projects */
export const getProjects = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("projects")
      .select(`*, teams(name, members, leader_id)`)
      .eq("is_approved", true)
      .order("total_points", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* GET CATEGORIES — GET /api/projects/categories */
export const getCategories = async (req, res) => {
  try {
    const { data } = await supabase.from("project_categories").select("*").order("name");
    return res.json(data || []);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* GET MY TEAM — GET /api/projects/my-team */
export const getMyTeam = async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Login required" });
  try {
    // Check if user is in any team
    const { data: teams } = await supabase.from("teams").select("*");
    const myTeam = (teams || []).find(t => t.members?.includes(userId) || t.leader_id === userId);
    if (!myTeam) return res.json({ team: null });

    // Get their project
    const { data: project } = await supabase
      .from("projects").select("*").eq("team_id", myTeam.id).maybeSingle();

    return res.json({ team: myTeam, project: project || null });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* CREATE TEAM — POST /api/projects/teams */
export const createTeam = async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Login required" });

  try {
    const { name, memberEmails } = req.body;
    if (!name) return res.status(400).json({ error: "Team name required" });

    // Find user_ids from emails
    const emails = (memberEmails || []).filter(e => e && e !== req.session.user.email);
    let memberIds = [userId];

    if (emails.length) {
      const { data: members } = await supabase.from("students").select("user_id, email").in("email", emails);
      memberIds = [userId, ...(members || []).map(m => m.user_id)];
    }

    if (memberIds.length < 3) return res.status(400).json({ error: "Minimum 3 members required" });
    if (memberIds.length > 6) return res.status(400).json({ error: "Maximum 6 members allowed" });

    const { data, error } = await supabase.from("teams").insert({
      name, members: memberIds, leader_id: userId,
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ success: true, team: data });
  } catch {
    return res.status(500).json({ error: "Failed to create team" });
  }
};

/* SUBMIT PROJECT — POST /api/projects */
export const submitProject = async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Login required" });

  try {
    const { teamId, title, description, category, github_url, demo_url } = req.body;
    if (!title || !description || !category || !teamId) {
      return res.status(400).json({ error: "title, description, category, teamId required" });
    }

    // Verify user is in this team
    const { data: team } = await supabase.from("teams").select("*").eq("id", teamId).maybeSingle();
    if (!team || (!team.members?.includes(userId) && team.leader_id !== userId)) {
      return res.status(403).json({ error: "You must be in this team to submit" });
    }

    // Check no existing project for this team
    const { data: existing } = await supabase.from("projects").select("id").eq("team_id", teamId).maybeSingle();
    if (existing) return res.status(400).json({ error: "This team already has a project" });

    const { data, error } = await supabase.from("projects").insert({
      team_id: teamId, title, description, category,
      github_url: github_url || null, demo_url: demo_url || null,
      is_approved: false,  // teacher must approve
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ success: true, project: data });
  } catch {
    return res.status(500).json({ error: "Failed to submit project" });
  }
};

/* VOTE FOR PROJECT — POST /api/projects/:id/vote */
export const voteProject = async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Login required" });

  try {
    const projectId  = req.params.id;
    const userRole   = req.session.user.role;
    const voteType   = (userRole === 'teacher' || userRole === 'admin') ? 'teacher' : 'student';

    // Check already voted
    const { data: existing } = await supabase
      .from("project_votes").select("id")
      .eq("project_id", projectId).eq("user_id", userId).maybeSingle();
    if (existing) return res.status(400).json({ error: "Already voted for this project" });

    // Can't vote for own team's project
    const { data: project } = await supabase.from("projects").select("team_id").eq("id", projectId).maybeSingle();
    const { data: myTeam }  = await supabase.from("teams").select("id").eq("leader_id", userId).maybeSingle();
    if (myTeam && project?.team_id === myTeam.id) {
      return res.status(400).json({ error: "Cannot vote for your own team's project" });
    }

    // Record vote
    await supabase.from("project_votes").insert({ project_id: projectId, user_id: userId, vote_type: voteType });

    // Update vote count
    const field = voteType === 'teacher' ? 'teacher_votes' : 'student_votes';
    const { data: proj } = await supabase.from("projects").select(field).eq("id", projectId).maybeSingle();
    await supabase.from("projects").update({ [field]: (proj?.[field] || 0) + 1 }).eq("id", projectId);

    return res.json({ success: true, voteType });
  } catch {
    return res.status(500).json({ error: "Vote failed" });
  }
};

/* APPROVE PROJECT (teacher/admin) — PATCH /api/projects/:id/approve */
export const approveProject = async (req, res) => {
  try {
    const { error } = await supabase.from("projects").update({ is_approved: true }).eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* GET PENDING PROJECTS (teacher/admin) — GET /api/projects/pending */
export const getPendingProjects = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("projects").select(`*, teams(name)`)
      .eq("is_approved", false).order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* ADD CATEGORY (admin) — POST /api/projects/categories */
export const addCategory = async (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const { data, error } = await supabase.from("project_categories")
      .insert({ name, icon: icon || '🏆' }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ success: true, category: data });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* DELETE CATEGORY (admin) — DELETE /api/projects/categories/:id */
export const deleteCategory = async (req, res) => {
  try {
    await supabase.from("project_categories").delete().eq("id", req.params.id);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};
