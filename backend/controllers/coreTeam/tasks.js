/**
 * Core Team — task board.
 *
 * Two kinds of task:
 *   - Team task   : team_id set, is_open false. Any member of that team
 *                   can claim it; the team head confirms it when done.
 *   - Open task   : team_id null, is_open true. First-come-first-serve —
 *                   any core member can claim it; council confirms.
 *
 * status flow:  open → (claim) → in_progress → (submit) → submitted
 *               → (confirm) → confirmed  [points awarded here]
 */
import supabase from "../../config/supabase.js";
import { catchAsync } from "../../lib/asyncHandler.js";
import { sendNotification } from "../notificationController.js";

/**
 * Fan a notification out to active, redeemed core members.
 * teamId null → every core member; otherwise just that team.
 */
async function notifyCore({ teamId, excludeUserId, title, body, type = "info" }) {
  let q = supabase
    .from("core_members")
    .select("user_id")
    .not("user_id", "is", null)
    .eq("is_active", true);
  if (teamId) q = q.eq("team_id", teamId);
  const { data } = await q;
  const userIds = (data || [])
    .map((r) => r.user_id)
    .filter((id) => id && id !== excludeUserId);
  if (userIds.length) {
    sendNotification({ userIds, title, body, type, link: "/core/tasks" });
  }
}

// core_tasks has three FKs to core_members (assigned_by / claimed_by /
// confirmed_by) — PostgREST needs the !column hint to disambiguate.
const TASK_SELECT =
  "*, core_teams(id, name, slug, accent), " +
  "claimer:core_members!claimed_by(id, name, tier), " +
  "assigner:core_members!assigned_by(id, name)";

/* GET /api/core/tasks — every task the caller can see */
export const listTasks = catchAsync(async (req, res) => {
  const { data, error } = await supabase
    .from("core_tasks")
    .select(TASK_SELECT)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: "Could not load tasks." });
  return res.json(data || []);
});

/* POST /api/core/tasks — council (any team / open) or head (own team) */
export const createTask = catchAsync(async (req, res) => {
  const me = req.coreMember;
  let { title, description, teamId, isOpen, points, deadline } = req.body;

  // A head can only create tasks for their own team — never open tasks.
  if (me.tier === "head") {
    teamId = me.team_id;
    isOpen = false;
  }
  // An open (anonymous) task has no team.
  if (isOpen) teamId = null;
  if (!isOpen && !teamId) {
    return res.status(400).json({ error: "Pick a team, or mark the task as open to all." });
  }

  const { data, error } = await supabase
    .from("core_tasks")
    .insert({
      title,
      description: description || null,
      team_id:  teamId || null,
      is_open:  !!isOpen,
      points:   points || 10,
      deadline: deadline || null,
      status:   isOpen ? "open" : "todo",
      assigned_by: me.id,
    })
    .select(TASK_SELECT)
    .single();
  if (error) return res.status(500).json({ error: "Could not create task." });

  // Tell the people who can pick it up.
  if (isOpen) {
    notifyCore({
      excludeUserId: me.user_id,
      title: "New open task up for grabs",
      body:  `${data.title} — first to claim it gets ${data.points} points`,
    });
  } else {
    notifyCore({
      teamId,
      excludeUserId: me.user_id,
      title: "New task for your team",
      body:  data.title,
    });
  }

  return res.status(201).json({ success: true, task: data });
});

/* POST /api/core/tasks/:id/claim — pick up a task */
export const claimTask = catchAsync(async (req, res) => {
  const me = req.coreMember;
  const { data: task } = await supabase
    .from("core_tasks").select("*").eq("id", req.params.id).maybeSingle();
  if (!task) return res.status(404).json({ error: "Task not found." });
  if (task.claimed_by) return res.status(409).json({ error: "Someone already picked this up." });
  if (!["open", "todo"].includes(task.status)) {
    return res.status(409).json({ error: "This task can't be claimed right now." });
  }
  // Team tasks: only that team's members (or council) may claim.
  if (task.team_id && me.tier !== "council" && me.team_id !== task.team_id) {
    return res.status(403).json({ error: "This task belongs to another team." });
  }

  // Conditional update guards the first-come-first-serve race: the
  // .is("claimed_by", null) filter means a second claimer's UPDATE
  // matches zero rows.
  const { data: updated } = await supabase
    .from("core_tasks")
    .update({ claimed_by: me.id, status: "in_progress", claimed_at: new Date().toISOString() })
    .eq("id", task.id)
    .is("claimed_by", null)
    .select(TASK_SELECT)
    .maybeSingle();

  if (!updated) return res.status(409).json({ error: "Someone just beat you to it." });
  return res.json({ success: true, task: updated });
});

/* POST /api/core/tasks/:id/submit — the claimer marks it done */
export const submitTask = catchAsync(async (req, res) => {
  const me = req.coreMember;
  const { data: task } = await supabase
    .from("core_tasks").select("*").eq("id", req.params.id).maybeSingle();
  if (!task) return res.status(404).json({ error: "Task not found." });
  if (task.claimed_by !== me.id) return res.status(403).json({ error: "Only the person who claimed this can submit it." });
  if (task.status !== "in_progress") return res.status(409).json({ error: "This task isn't in progress." });

  const { data, error } = await supabase
    .from("core_tasks")
    .update({ status: "submitted", submission: req.body.submission, submitted_at: new Date().toISOString() })
    .eq("id", task.id)
    .select(TASK_SELECT)
    .single();
  if (error) return res.status(500).json({ error: "Could not submit task." });

  // Nudge whoever can confirm it — the team's head + the council.
  const { data: leads } = await supabase
    .from("core_members")
    .select("user_id, tier, team_id")
    .not("user_id", "is", null)
    .eq("is_active", true);
  const confirmerIds = (leads || [])
    .filter((m) => m.tier === "council" || (m.tier === "head" && m.team_id === task.team_id))
    .map((m) => m.user_id)
    .filter((id) => id && id !== me.user_id);
  if (confirmerIds.length) {
    sendNotification({
      userIds: confirmerIds,
      title: "Task awaiting confirmation",
      body:  `${me.name} submitted "${task.title}"`,
      type:  "info",
      link:  "/core/tasks",
    });
  }

  return res.json({ success: true, task: data });
});

/* POST /api/core/tasks/:id/confirm — head/council confirms → award points */
export const confirmTask = catchAsync(async (req, res) => {
  const me = req.coreMember;
  const { data: task } = await supabase
    .from("core_tasks").select("*").eq("id", req.params.id).maybeSingle();
  if (!task) return res.status(404).json({ error: "Task not found." });
  if (task.status !== "submitted") return res.status(409).json({ error: "This task isn't awaiting confirmation." });

  // Council confirms anything; a head only confirms their own team's tasks.
  const canConfirm =
    me.tier === "council" ||
    (me.tier === "head" && task.team_id && me.team_id === task.team_id);
  if (!canConfirm) return res.status(403).json({ error: "Only the team head or council can confirm this." });

  const { data: confirmed, error } = await supabase
    .from("core_tasks")
    .update({ status: "confirmed", confirmed_by: me.id, confirmed_at: new Date().toISOString() })
    .eq("id", task.id)
    .select(TASK_SELECT)
    .single();
  if (error) return res.status(500).json({ error: "Could not confirm task." });

  // Award the task's points to whoever completed it.
  if (task.claimed_by) {
    const { data: member } = await supabase
      .from("core_members").select("points, user_id").eq("id", task.claimed_by).maybeSingle();
    await supabase
      .from("core_members")
      .update({ points: (member?.points || 0) + task.points })
      .eq("id", task.claimed_by);
    await supabase.from("core_points_log").insert({
      member_id: task.claimed_by,
      points:    task.points,
      reason:    `Task confirmed: ${task.title}`,
      ref_type:  "task",
      ref_id:    task.id,
    });
    // Tell the member their work was confirmed + points landed.
    if (member?.user_id) {
      sendNotification({
        userIds: [member.user_id],
        title:   "Task confirmed ✓",
        body:    `"${task.title}" — ${task.points} points added`,
        type:    "success",
        link:    "/core/tasks",
      });
    }
  }

  return res.json({ success: true, task: confirmed });
});

/* DELETE /api/core/tasks/:id — council, or a head deleting their team's task */
export const deleteTask = catchAsync(async (req, res) => {
  const me = req.coreMember;
  const { data: task } = await supabase
    .from("core_tasks").select("id, team_id").eq("id", req.params.id).maybeSingle();
  if (!task) return res.status(404).json({ error: "Task not found." });

  const canDelete =
    me.tier === "council" ||
    (me.tier === "head" && task.team_id && me.team_id === task.team_id);
  if (!canDelete) return res.status(403).json({ error: "You can't delete this task." });

  await supabase.from("core_tasks").delete().eq("id", task.id);
  return res.json({ success: true });
});
