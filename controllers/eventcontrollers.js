/**
 * EVENT CONTROLLER — Production-grade event management
 *
 * Services:
 *   1. Event CRUD (existing, expanded)
 *   2. Registration service (register, cancel, waitlist)
 *   3. Attendance service (check-in, checkout)
 *   4. Event Leaderboard service (score, rank)
 *   5. Achievement service (unlock, check criteria)
 *
 * All services share the same Supabase client, error pattern,
 * and auth middleware chain.
 *
 * Updated: April 4, 2026
 */

import crypto from "crypto";
import supabase from "../config/supabase.js";
import { sendNotification } from "./notificationController.js";

function generateQrToken() {
  return crypto.randomBytes(16).toString("hex"); // 32-char hex token
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function computeStatus(ev) {
  const now = new Date();
  const start = ev.starts_at ? new Date(ev.starts_at) : (ev.date ? new Date(ev.date) : null);
  const end = ev.ends_at ? new Date(ev.ends_at) : null;
  const deadline = ev.registration_deadline ? new Date(ev.registration_deadline) : null;

  if (!ev.is_active) return "cancelled";
  if (end && now > end) return "completed";
  if (start && now > start && (!end || now < end)) return "active";
  if (start && now > start) return "past";
  if (!ev.registration_open) return "closed";
  if (deadline && now > deadline) return "closed";
  if (deadline && now < deadline) return "registering";
  if (ev.registration_open) return "registering";
  return "upcoming";
}

function validateUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// ═══════════════════════════════════════════════════════════
// 1. EVENT CRUD SERVICE
// ═══════════════════════════════════════════════════════════

/* GET /api/events — list all active events with registration counts */
export const getEvents = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("is_active", true)
      .order("date", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    // Batch-fetch registration counts
    const eventIds = (data || []).map(e => e.id);
    let regCounts = {};
    let userRegsMap = {}; // per-event registration for the current user
    if (eventIds.length > 0) {
      const { data: regs } = await supabase
        .from("event_registrations")
        .select("event_id")
        .in("event_id", eventIds)
        .in("status", ["registered", "attended"]);
      (regs || []).forEach(r => {
        regCounts[r.event_id] = (regCounts[r.event_id] || 0) + 1;
      });

      // If user is logged in, fetch their registrations for all events
      const userId = req.session?.user?.id;
      if (userId) {
        const { data: userRegs } = await supabase
          .from("event_registrations")
          .select("*")
          .eq("user_id", userId)
          .in("event_id", eventIds);
        (userRegs || []).forEach(r => { userRegsMap[r.event_id] = r; });
      }
    }

    const enriched = (data || []).map(ev => ({
      ...ev,
      status: computeStatus(ev),
      registration_count: regCounts[ev.id] || 0,
      is_full: ev.capacity ? (regCounts[ev.id] || 0) >= ev.capacity : false,
      user_registration: userRegsMap[ev.id] || null,
    }));

    return res.json(enriched);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch events" });
  }
};

/* GET /api/events/:id — single event with full details */
export const getEvent = async (req, res) => {
  try {
    if (!validateUUID(req.params.id))
      return res.status(400).json({ error: "Invalid event ID" });

    const { data, error } = await supabase
      .from("events").select("*")
      .eq("id", req.params.id).maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Event not found" });

    // Get registration count
    const { count } = await supabase
      .from("event_registrations")
      .select("*", { count: "exact", head: true })
      .eq("event_id", data.id)
      .in("status", ["registered", "attended"]);

    // Check if current user is registered
    let userRegistration = null;
    if (req.session?.user?.id) {
      const { data: reg } = await supabase
        .from("event_registrations")
        .select("*")
        .eq("event_id", data.id)
        .eq("user_id", req.session.user.id)
        .maybeSingle();
      userRegistration = reg;
    }

    return res.json({
      ...data,
      status: computeStatus(data),
      registration_count: count || 0,
      is_full: data.capacity ? (count || 0) >= data.capacity : false,
      user_registration: userRegistration,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* POST /api/events — create event (teacher/admin) */
export const createEvent = async (req, res) => {
  try {
    const {
      title, description, date, location, time,
      registration_form_url, registration_deadline, max_registrations,
      event_type, organiser, tags, banner_color,
      // New fields
      capacity, venue_type, venue_link, xp_reward,
      xp_bonus_first, xp_bonus_winner, requires_checkin,
      starts_at, ends_at, cover_image_url,
    } = req.body;

    if (!title) return res.status(400).json({ error: "title required" });

    const { data, error } = await supabase.from("events").insert({
      title,
      description,
      date,
      location,
      time,
      registration_form_url:  registration_form_url  || null,
      registration_deadline:  registration_deadline  || null,
      max_registrations:      max_registrations      || null,
      event_type:             event_type             || "general",
      organiser:              organiser              || null,
      tags:                   tags                   || [],
      banner_color:           banner_color           || "#7c3aed",
      registration_open:      true,
      is_active:              true,
      // New fields
      capacity:               capacity               || null,
      venue_type:             venue_type             || "in-person",
      venue_link:             venue_link             || null,
      xp_reward:              xp_reward              || 0,
      xp_bonus_first:         xp_bonus_first         || 0,
      xp_bonus_winner:        xp_bonus_winner        || 0,
      requires_checkin:        requires_checkin       || false,
      starts_at:              starts_at              || null,
      ends_at:                ends_at                || null,
      created_by:             req.userId             || null,
      cover_image_url:        cover_image_url        || null,
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });

    // Notify all students about the new event
    const { data: students } = await supabase
      .from("students").select("user_id").eq("role", "student");
    if (students && students.length > 0) {
      await sendNotification({
        userIds: students.map(s => s.user_id),
        title: "New Event",
        body: `${title} — ${event_type || "general"}`,
        type: "info",
        link: `/events`,
      });
    }

    return res.status(201).json({ success: true, event: { ...data, status: computeStatus(data) } });
  } catch (err) {
    return res.status(500).json({ error: "Failed to create event" });
  }
};

/* PATCH /api/events/:id — update event (teacher/admin) */
export const updateEvent = async (req, res) => {
  try {
    const allowed = [
      "title", "description", "date", "location", "time",
      "registration_form_url", "registration_deadline",
      "registration_open", "max_registrations",
      "event_type", "organiser", "tags", "banner_color", "is_active",
      // New fields
      "capacity", "venue_type", "venue_link", "xp_reward",
      "xp_bonus_first", "xp_bonus_winner", "requires_checkin",
      "checkin_code", "starts_at", "ends_at", "cover_image_url",
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const { data, error } = await supabase.from("events")
      .update(updates).eq("id", req.params.id).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, event: { ...data, status: computeStatus(data) } });
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* DELETE /api/events/:id — soft delete (teacher/admin) */
export const deleteEvent = async (req, res) => {
  try {
    await supabase.from("events").update({ is_active: false }).eq("id", req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* PATCH /api/events/:id/toggle-reg — toggle registration (teacher/admin) */
export const toggleRegistration = async (req, res) => {
  try {
    const { data: ev } = await supabase.from("events")
      .select("registration_open").eq("id", req.params.id).maybeSingle();
    if (!ev) return res.status(404).json({ error: "Not found" });

    const { data, error } = await supabase.from("events")
      .update({ registration_open: !ev.registration_open })
      .eq("id", req.params.id).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, registration_open: data.registration_open });
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

// ═══════════════════════════════════════════════════════════
// 2. REGISTRATION SERVICE
// ═══════════════════════════════════════════════════════════

/* POST /api/events/:id/register — register for an event */
export const registerForEvent = async (req, res) => {
  const userId = req.userId;
  const eventId = req.params.id;

  try {
    // 1. Validate event exists and is open
    const { data: event } = await supabase
      .from("events").select("*").eq("id", eventId).eq("is_active", true).maybeSingle();

    if (!event) return res.status(404).json({ error: "Event not found" });

    const status = computeStatus(event);
    if (status === "completed" || status === "past")
      return res.status(400).json({ error: "Event has already ended" });
    if (status === "closed" || status === "cancelled")
      return res.status(400).json({ error: "Registration is closed" });

    // 2. Check duplicate
    const { data: existing } = await supabase
      .from("event_registrations")
      .select("id, status")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing && existing.status !== "cancelled")
      return res.status(409).json({ error: "Already registered", registration: existing });

    // 3. Check capacity
    const { count } = await supabase
      .from("event_registrations")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .in("status", ["registered", "attended"]);

    const isFull = event.capacity && (count || 0) >= event.capacity;
    const regStatus = isFull ? "waitlisted" : "registered";

    // 4. Create or re-activate registration
    let registration;
    if (existing && existing.status === "cancelled") {
      // Re-register (was cancelled before)
      const { data, error } = await supabase
        .from("event_registrations")
        .update({ status: regStatus, registered_at: new Date().toISOString(), cancelled_at: null, qr_token: generateQrToken() })
        .eq("id", existing.id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      registration = data;
    } else {
      const { data, error } = await supabase
        .from("event_registrations")
        .insert({
          event_id: eventId,
          user_id: userId,
          status: regStatus,
          team_name: req.body.team_name || null,
          notes: req.body.notes || null,
          qr_token: generateQrToken(),
        }).select().single();
      if (error) return res.status(500).json({ error: error.message });
      registration = data;
    }

    // 5. Award early bird XP (if applicable)
    if (regStatus === "registered" && event.xp_bonus_first > 0) {
      // Check if this is among the first N registrations
      const earlyBirdThreshold = 10; // first 10 get bonus
      if ((count || 0) < earlyBirdThreshold) {
        const { data: student } = await supabase
          .from("students").select("xp, weekly_xp").eq("user_id", userId).maybeSingle();
        if (student) {
          await supabase.from("students").update({
            xp: (student.xp || 0) + event.xp_bonus_first,
            weekly_xp: (student.weekly_xp || 0) + event.xp_bonus_first,
          }).eq("user_id", userId);
        }
      }
    }

    return res.status(201).json({
      success: true,
      registration,
      waitlisted: regStatus === "waitlisted",
    });
  } catch (err) {
    console.error("[Event Register]", err.message);
    return res.status(500).json({ error: "Registration failed" });
  }
};

/* DELETE /api/events/:id/register — cancel registration */
export const cancelRegistration = async (req, res) => {
  const userId = req.userId;
  try {
    const { data: reg } = await supabase
      .from("event_registrations")
      .select("id, status")
      .eq("event_id", req.params.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!reg) return res.status(404).json({ error: "Not registered" });
    if (reg.status === "cancelled") return res.status(400).json({ error: "Already cancelled" });
    if (reg.status === "attended") return res.status(400).json({ error: "Cannot cancel after attending" });

    await supabase.from("event_registrations")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", reg.id);

    // Promote first waitlisted user
    const { data: waitlisted } = await supabase
      .from("event_registrations")
      .select("id, user_id")
      .eq("event_id", req.params.id)
      .eq("status", "waitlisted")
      .order("registered_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (waitlisted) {
      await supabase.from("event_registrations")
        .update({ status: "registered" })
        .eq("id", waitlisted.id);
      await sendNotification({
        userIds: [waitlisted.user_id],
        title: "You're in!",
        body: "A spot opened up — you've been moved from the waitlist",
        type: "success",
        link: `/events`,
      });
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Cancellation failed" });
  }
};

/* GET /api/events/:id/registrations — list registrations (teacher/admin) */
export const getRegistrations = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("event_registrations")
      .select("*, students:user_id(name, email, avatar_emoji, xp, title)")
      .eq("event_id", req.params.id)
      .order("registered_at", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

// ═══════════════════════════════════════════════════════════
// 3. ATTENDANCE SERVICE
// ═══════════════════════════════════════════════════════════

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
  } catch (err) {
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
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

// ═══════════════════════════════════════════════════════════
// 4. EVENT LEADERBOARD SERVICE
// ═══════════════════════════════════════════════════════════

/* GET /api/events/:id/leaderboard — get event rankings */
export const getEventLeaderboard = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("event_leaderboard")
      .select("*, students:user_id(name, email, avatar_emoji, title)")
      .eq("event_id", req.params.id)
      .order("score", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Auto-assign ranks by score order
    const ranked = (data || []).map((entry, i) => ({
      ...entry,
      rank: i + 1,
    }));

    return res.json(ranked);
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* POST /api/events/:id/leaderboard — submit/update score (teacher/admin) */
export const updateEventScore = async (req, res) => {
  const { user_id, score, team_name, submission_url, notes } = req.body;
  if (!user_id || score === undefined) return res.status(400).json({ error: "user_id and score required" });

  try {
    const { data, error } = await supabase.from("event_leaderboard").upsert({
      event_id: req.params.id,
      user_id,
      score: Number(score),
      team_name: team_name || null,
      submission_url: submission_url || null,
      judged_by: req.userId,
      judged_at: new Date().toISOString(),
      notes: notes || null,
    }, { onConflict: "event_id,user_id" }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, entry: data });
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* POST /api/events/:id/leaderboard/publish — finalize ranks + award XP (admin) */
export const publishEventResults = async (req, res) => {
  try {
    // Get sorted leaderboard
    const { data: entries } = await supabase
      .from("event_leaderboard")
      .select("*")
      .eq("event_id", req.params.id)
      .order("score", { ascending: false });

    if (!entries || entries.length === 0)
      return res.status(400).json({ error: "No entries to publish" });

    // Get event for winner XP bonus
    const { data: event } = await supabase
      .from("events").select("xp_bonus_winner, title").eq("id", req.params.id).maybeSingle();
    const winnerXP = event?.xp_bonus_winner || 0;

    // Update ranks and award XP to top 3
    for (let i = 0; i < entries.length; i++) {
      const rank = i + 1;
      await supabase.from("event_leaderboard")
        .update({ rank }).eq("id", entries[i].id);

      // Award winner XP to top 3
      if (rank <= 3 && winnerXP > 0) {
        const xp = rank === 1 ? winnerXP : rank === 2 ? Math.round(winnerXP * 0.6) : Math.round(winnerXP * 0.3);
        const { data: student } = await supabase
          .from("students").select("xp, weekly_xp").eq("user_id", entries[i].user_id).maybeSingle();
        if (student) {
          await supabase.from("students").update({
            xp: (student.xp || 0) + xp,
            weekly_xp: (student.weekly_xp || 0) + xp,
          }).eq("user_id", entries[i].user_id);
        }

        // Notify winners
        await sendNotification({
          userIds: [entries[i].user_id],
          title: `${rank === 1 ? "🥇 1st" : rank === 2 ? "🥈 2nd" : "🥉 3rd"} Place!`,
          body: `You placed #${rank} in "${event?.title || "event"}" — +${xp} XP`,
          type: "success",
          link: `/events`,
        });

        // Check win achievements
        await checkWinAchievements(entries[i].user_id);
      }
    }

    return res.json({ success: true, count: entries.length });
  } catch (err) {
    console.error("[Publish Results]", err.message);
    return res.status(500).json({ error: "Failed to publish" });
  }
};

// ═══════════════════════════════════════════════════════════
// 5. ACHIEVEMENT SERVICE
// ═══════════════════════════════════════════════════════════

/* GET /api/achievements — list all achievements */
export const getAchievements = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("achievements")
      .select("*")
      .eq("is_active", true)
      .order("category");

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* GET /api/achievements/me — current user's unlocked achievements */
export const getMyAchievements = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_achievements")
      .select("*, achievements(*)")
      .eq("user_id", req.userId)
      .order("unlocked_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* GET /api/achievements/user/:userId — specific user's achievements */
export const getUserAchievements = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_achievements")
      .select("*, achievements(*)")
      .eq("user_id", req.params.userId)
      .order("unlocked_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

/* POST /api/achievements/grant — manually grant achievement (admin) */
export const grantAchievement = async (req, res) => {
  const { user_id, achievement_id, event_id } = req.body;
  if (!user_id || !achievement_id)
    return res.status(400).json({ error: "user_id and achievement_id required" });

  try {
    // Get achievement for XP
    const { data: ach } = await supabase
      .from("achievements").select("*").eq("id", achievement_id).maybeSingle();
    if (!ach) return res.status(404).json({ error: "Achievement not found" });

    const { data, error } = await supabase.from("user_achievements").insert({
      user_id,
      achievement_id,
      event_id: event_id || null,
      granted_by: req.userId,
      xp_awarded: ach.xp_reward || 0,
    }).select().single();

    if (error) {
      if (error.code === "23505") return res.status(409).json({ error: "Already unlocked" });
      return res.status(500).json({ error: error.message });
    }

    // Award XP
    if (ach.xp_reward > 0) {
      const { data: student } = await supabase
        .from("students").select("xp, weekly_xp").eq("user_id", user_id).maybeSingle();
      if (student) {
        await supabase.from("students").update({
          xp: (student.xp || 0) + ach.xp_reward,
          weekly_xp: (student.weekly_xp || 0) + ach.xp_reward,
        }).eq("user_id", user_id);
      }
    }

    // Notify user
    await sendNotification({
      userIds: [user_id],
      title: `${ach.icon} Achievement Unlocked!`,
      body: `${ach.title} — ${ach.description}${ach.xp_reward ? ` (+${ach.xp_reward} XP)` : ""}`,
      type: "success",
      link: `/profile`,
    });

    return res.json({ success: true, unlock: data });
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

// ── Internal: check event attendance achievements ──
async function checkEventAchievements(userId) {
  try {
    const { count } = await supabase
      .from("event_attendance")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    const total = count || 0;

    // Get event_attend achievements that match
    const { data: achievements } = await supabase
      .from("achievements")
      .select("*")
      .eq("criteria_type", "event_attend")
      .eq("is_active", true)
      .lte("criteria_value", total);

    if (!achievements) return;

    for (const ach of achievements) {
      // Try to insert (ignore if already exists)
      const { error } = await supabase.from("user_achievements").insert({
        user_id: userId,
        achievement_id: ach.id,
        xp_awarded: ach.xp_reward || 0,
      });

      if (!error && ach.xp_reward > 0) {
        // New achievement — award XP and notify
        const { data: student } = await supabase
          .from("students").select("xp, weekly_xp").eq("user_id", userId).maybeSingle();
        if (student) {
          await supabase.from("students").update({
            xp: (student.xp || 0) + ach.xp_reward,
            weekly_xp: (student.weekly_xp || 0) + ach.xp_reward,
          }).eq("user_id", userId);
        }
        await sendNotification({
          userIds: [userId],
          title: `${ach.icon} Achievement Unlocked!`,
          body: `${ach.title} — ${ach.description}`,
          type: "success",
          link: `/profile`,
        });
      }
    }
  } catch { /* non-blocking */ }
}

// ── Internal: check event win achievements ──
async function checkWinAchievements(userId) {
  try {
    const { count } = await supabase
      .from("event_leaderboard")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("rank", 1);

    const wins = count || 0;

    const { data: achievements } = await supabase
      .from("achievements")
      .select("*")
      .eq("criteria_type", "event_win")
      .eq("is_active", true)
      .lte("criteria_value", wins);

    if (!achievements) return;

    for (const ach of achievements) {
      const { error } = await supabase.from("user_achievements").insert({
        user_id: userId,
        achievement_id: ach.id,
        xp_awarded: ach.xp_reward || 0,
      });
      if (!error && ach.xp_reward > 0) {
        const { data: student } = await supabase
          .from("students").select("xp, weekly_xp").eq("user_id", userId).maybeSingle();
        if (student) {
          await supabase.from("students").update({
            xp: (student.xp || 0) + ach.xp_reward,
            weekly_xp: (student.weekly_xp || 0) + ach.xp_reward,
          }).eq("user_id", userId);
        }
        await sendNotification({
          userIds: [userId],
          title: `${ach.icon} Achievement Unlocked!`,
          body: `${ach.title} — ${ach.description}`,
          type: "success",
          link: `/profile`,
        });
      }
    }
  } catch { /* non-blocking */ }
}

// ═══════════════════════════════════════════════════════════
// SITE SETTINGS (unchanged)
// ═══════════════════════════════════════════════════════════

export const getSiteSettings = async (req, res) => {
  try {
    const { data, error } = await supabase.from("site_settings").select("*");
    if (error) return res.status(500).json({ error: error.message });
    const settings = {};
    (data || []).forEach(row => { settings[row.key] = row.value; });
    return res.json(settings);
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};

export const updateSiteSetting = async (req, res) => {
  const userId = req.session?.user?.id;
  try {
    const { value } = req.body;
    const key = req.params.key;
    const allowed_keys = ["registrations_open", "site_notice", "arena_open", "registration_message"];
    if (!allowed_keys.includes(key))
      return res.status(400).json({ error: "Unknown setting key" });

    const { error } = await supabase.from("site_settings")
      .upsert({ key, value: String(value), updated_at: new Date().toISOString(), updated_by: userId });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, key, value });
  } catch (err) {
    return res.status(500).json({ error: "Failed" });
  }
};
