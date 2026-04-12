/**
 * Registration Controller — Event registration, cancellation, waitlist
 */

import supabase from "../../config/supabase.js";
import { sendNotification } from "../notificationController.js";
import { computeStatus, generateQrToken } from "./eventHelpers.js";

const EARLY_BIRD_THRESHOLD = 10; // first N registrations get bonus XP

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
      if ((count || 0) < EARLY_BIRD_THRESHOLD) {
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
  } catch {
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
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};
