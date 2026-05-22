/**
 * Core Team — meeting / event scheduler.
 *
 * The council posts a meeting (whole-club or aimed at one team); a
 * team head can post one for their own team. Every core member can
 * RSVP going / maybe / can't.
 */
import supabase from "../../config/supabase.js";
import { catchAsync } from "../../lib/asyncHandler.js";
import { sendNotification } from "../notificationController.js";

/* GET /api/core/meetings — meetings the caller can see */
export const listMeetings = catchAsync(async (req, res) => {
  const me = req.coreMember;

  const { data: meetings, error } = await supabase
    .from("core_meetings")
    .select("*, core_teams(id, name, slug, accent), host:core_members!created_by(id, name)")
    .order("scheduled_at", { ascending: true });
  if (error) return res.status(500).json({ error: "Could not load meetings." });

  // Council sees everything; everyone else sees club-wide meetings plus
  // their own team's.
  const visible = (meetings || []).filter((m) =>
    me.tier === "council" || !m.team_id || m.team_id === me.team_id,
  );

  // Attach RSVP tallies + the caller's own response.
  const ids = visible.map((m) => m.id);
  let rsvps = [];
  if (ids.length) {
    const { data } = await supabase
      .from("core_meeting_rsvps")
      .select("meeting_id, member_id, status")
      .in("meeting_id", ids);
    rsvps = data || [];
  }

  const withRsvps = visible.map((m) => {
    const mine = rsvps.find((r) => r.meeting_id === m.id && r.member_id === me.id);
    const counts = { going: 0, maybe: 0, no: 0 };
    rsvps.filter((r) => r.meeting_id === m.id).forEach((r) => { counts[r.status]++; });
    return { ...m, counts, myRsvp: mine?.status || null };
  });

  return res.json(withRsvps);
});

/* POST /api/core/meetings — council (any) or head (own team) */
export const createMeeting = catchAsync(async (req, res) => {
  const me = req.coreMember;
  let { title, description, location, scheduledAt, teamId } = req.body;

  // A head can only schedule meetings for their own team.
  if (me.tier === "head") teamId = me.team_id;

  const { data: meeting, error } = await supabase
    .from("core_meetings")
    .insert({
      title,
      description: description || null,
      location:    location || null,
      scheduled_at: scheduledAt,
      team_id:     teamId || null,
      created_by:  me.id,
    })
    .select("*, core_teams(id, name, slug, accent), host:core_members!created_by(id, name)")
    .single();
  if (error) return res.status(500).json({ error: "Could not create meeting." });

  // Notify the right audience — the whole team, or every core member.
  let q = supabase.from("core_members").select("user_id").not("user_id", "is", null).eq("is_active", true);
  if (teamId) q = q.eq("team_id", teamId);
  const { data: recipients } = await q;
  const userIds = (recipients || []).map((r) => r.user_id).filter((id) => id && id !== me.user_id);
  if (userIds.length) {
    const when = new Date(scheduledAt).toLocaleString();
    sendNotification({
      userIds,
      title: "New core team meeting",
      body:  `${title} — ${when}`,
      type:  "info",
      link:  "/core/meetings",
    });
  }

  return res.status(201).json({ success: true, meeting: { ...meeting, counts: { going: 0, maybe: 0, no: 0 }, myRsvp: null } });
});

/* POST /api/core/meetings/:id/rsvp — going | maybe | no */
export const rsvpMeeting = catchAsync(async (req, res) => {
  const me = req.coreMember;
  const { status } = req.body;

  const { data: meeting } = await supabase
    .from("core_meetings").select("id").eq("id", req.params.id).maybeSingle();
  if (!meeting) return res.status(404).json({ error: "Meeting not found." });

  const { error } = await supabase
    .from("core_meeting_rsvps")
    .upsert({ meeting_id: meeting.id, member_id: me.id, status }, { onConflict: "meeting_id,member_id" });
  if (error) return res.status(500).json({ error: "Could not save your RSVP." });

  return res.json({ success: true, status });
});

/* DELETE /api/core/meetings/:id — council, or the head who owns the team */
export const deleteMeeting = catchAsync(async (req, res) => {
  const me = req.coreMember;
  const { data: meeting } = await supabase
    .from("core_meetings").select("id, team_id").eq("id", req.params.id).maybeSingle();
  if (!meeting) return res.status(404).json({ error: "Meeting not found." });

  const canDelete =
    me.tier === "council" ||
    (me.tier === "head" && meeting.team_id && me.team_id === meeting.team_id);
  if (!canDelete) return res.status(403).json({ error: "You can't delete this meeting." });

  await supabase.from("core_meetings").delete().eq("id", meeting.id);
  return res.json({ success: true });
});
