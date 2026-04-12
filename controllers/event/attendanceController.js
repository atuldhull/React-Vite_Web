/**
 * Attendance Controller — Check-in (code, manual, QR) and attendance records
 */

import supabase from "../../config/supabase.js";
import { checkEventAchievements } from "./achievementController.js";

/* POST /api/events/:id/checkin — student checks in with code */
export const checkinEvent = async (req, res) => {
  const userId = req.userId;
  const eventId = req.params.id;
  const { code, session_label } = req.body;

  try {
    // 1. Validate event
    const { data: event } = await supabase
      .from("events").select("*").eq("id", eventId).maybeSingle();
    if (!event) return res.status(404).json({ error: "Event not found" });

    // 2. Validate check-in code (if required)
    if (event.requires_checkin && event.checkin_code) {
      if (!code || code.trim() !== event.checkin_code.trim())
        return res.status(403).json({ error: "Invalid check-in code" });
    }

    // 3. Must be registered
    const { data: reg } = await supabase
      .from("event_registrations")
      .select("id, status")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!reg || reg.status === "cancelled")
      return res.status(400).json({ error: "Not registered for this event" });

    // 4. Check for duplicate attendance
    const { data: existing } = await supabase
      .from("event_attendance")
      .select("id")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .eq("session_label", session_label || null)
      .maybeSingle();

    if (existing)
      return res.status(409).json({ error: "Already checked in" });

    // 5. Create attendance record
    const xpToAward = event.xp_reward || 0;
    const { data: attendance, error } = await supabase
      .from("event_attendance")
      .insert({
        event_id: eventId,
        user_id: userId,
        checkin_method: code ? "code" : "manual",
        session_label: session_label || null,
        xp_awarded: xpToAward,
      }).select().single();

    if (error) return res.status(500).json({ error: error.message });

    // 6. Update registration status to attended
    await supabase.from("event_registrations")
      .update({ status: "attended", checked_in_at: new Date().toISOString() })
      .eq("event_id", eventId).eq("user_id", userId);

    // 7. Award XP
    if (xpToAward > 0) {
      const { data: student } = await supabase
        .from("students").select("xp, weekly_xp").eq("user_id", userId).maybeSingle();
      if (student) {
        await supabase.from("students").update({
          xp: (student.xp || 0) + xpToAward,
          weekly_xp: (student.weekly_xp || 0) + xpToAward,
        }).eq("user_id", userId);
      }
    }

    // 8. Check event attendance achievements
    await checkEventAchievements(userId);

    return res.json({ success: true, attendance, xp_awarded: xpToAward });
  } catch (err) {
    console.error("[Checkin]", err.message);
    return res.status(500).json({ error: "Check-in failed" });
  }
};

/* POST /api/events/:id/checkin-manual — admin marks attendance for a user */
export const manualCheckin = async (req, res) => {
  const { user_id, session_label } = req.body;
  if (!user_id) return res.status(400).json({ error: "user_id required" });

  try {
    const { data: event } = await supabase
      .from("events").select("xp_reward").eq("id", req.params.id).maybeSingle();
    if (!event) return res.status(404).json({ error: "Event not found" });

    const xp = event.xp_reward || 0;

    const { data, error } = await supabase.from("event_attendance").insert({
      event_id: req.params.id,
      user_id,
      checkin_method: "manual",
      session_label: session_label || null,
      xp_awarded: xp,
    }).select().single();

    if (error) {
      if (error.code === "23505") return res.status(409).json({ error: "Already checked in" });
      return res.status(500).json({ error: error.message });
    }

    // Update registration status
    await supabase.from("event_registrations")
      .update({ status: "attended", checked_in_at: new Date().toISOString() })
      .eq("event_id", req.params.id).eq("user_id", user_id);

    // Award XP
    if (xp > 0) {
      const { data: student } = await supabase
        .from("students").select("xp, weekly_xp").eq("user_id", user_id).maybeSingle();
      if (student) {
        await supabase.from("students").update({
          xp: (student.xp || 0) + xp,
          weekly_xp: (student.weekly_xp || 0) + xp,
        }).eq("user_id", user_id);
      }
    }

    await checkEventAchievements(user_id);

    return res.json({ success: true, attendance: data });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* POST /api/events/:id/scan-qr — teacher/admin scans student QR at venue */
export const scanQrCheckin = async (req, res) => {
  const { qr_token, session_label } = req.body;
  const eventId = req.params.id;

  if (!qr_token) return res.status(400).json({ error: "QR token required" });

  try {
    // 1. Look up registration by QR token
    const { data: reg } = await supabase
      .from("event_registrations")
      .select("*, students:user_id(name, email, avatar_emoji, xp, title)")
      .eq("qr_token", qr_token)
      .eq("event_id", eventId)
      .maybeSingle();

    if (!reg)
      return res.status(404).json({ error: "Invalid QR — no registration found for this event" });

    if (reg.status === "cancelled")
      return res.status(400).json({ error: "Registration was cancelled" });

    if (reg.status === "attended")
      return res.status(409).json({ error: "Already checked in", student: reg.students });

    // 2. Check for duplicate attendance (session-aware)
    const { data: existing } = await supabase
      .from("event_attendance")
      .select("id")
      .eq("event_id", eventId)
      .eq("user_id", reg.user_id)
      .eq("session_label", session_label || null)
      .maybeSingle();

    if (existing)
      return res.status(409).json({ error: "Already checked in for this session", student: reg.students });

    // 3. Get event for XP
    const { data: event } = await supabase
      .from("events").select("xp_reward, title").eq("id", eventId).maybeSingle();
    const xp = event?.xp_reward || 0;

    // 4. Create attendance record
    const { data: attendance, error } = await supabase.from("event_attendance").insert({
      event_id: eventId,
      user_id: reg.user_id,
      checkin_method: "qr",
      session_label: session_label || null,
      xp_awarded: xp,
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });

    // 5. Update registration status
    await supabase.from("event_registrations")
      .update({ status: "attended", checked_in_at: new Date().toISOString() })
      .eq("id", reg.id);

    // 6. Award XP
    if (xp > 0) {
      const { data: student } = await supabase
        .from("students").select("xp, weekly_xp").eq("user_id", reg.user_id).maybeSingle();
      if (student) {
        await supabase.from("students").update({
          xp: (student.xp || 0) + xp,
          weekly_xp: (student.weekly_xp || 0) + xp,
        }).eq("user_id", reg.user_id);
      }
    }

    // 7. Achievement check
    await checkEventAchievements(reg.user_id);

    return res.json({
      success: true,
      student: reg.students,
      xp_awarded: xp,
      attendance,
    });
  } catch (err) {
    console.error("[QR Scan]", err.message);
    return res.status(500).json({ error: "Scan failed" });
  }
};

/* GET /api/events/:id/attendance — list attendance (teacher/admin) */
export const getAttendance = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("event_attendance")
      .select("*, students:user_id(name, email, avatar_emoji)")
      .eq("event_id", req.params.id)
      .order("checkin_time", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};
