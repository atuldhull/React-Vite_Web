/**
 * Event CRUD Controller — Create, read, update, delete events
 */

import supabase from "../../config/supabase.js";
import { sendNotification } from "../notificationController.js";
import { computeStatus, validateUUID } from "./eventHelpers.js";

/* GET /api/events — list all active events with registration counts */
export const getEvents = async (req, res) => {
  try {
    const { data, error } = await req.db
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
  } catch {
    return res.status(500).json({ error: "Failed to fetch events" });
  }
};

/* GET /api/events/:id — single event with full details */
export const getEvent = async (req, res) => {
  try {
    if (!validateUUID(req.params.id))
      return res.status(400).json({ error: "Invalid event ID" });

    const { data, error } = await req.db
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
  } catch {
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

    const { data, error } = await req.db.from("events").insert({
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
    // Notify only students within the SAME org as the event creator —
    // the Proxy adds eq("org_id", req.orgId) automatically.
    const { data: students } = await req.db
      .from("students").select("user_id").eq("role", "student");
    if (students && students.length > 0) {
      await sendNotification({
        userIds: students.map(s => s.user_id),
        orgId: req.orgId,
        title: "New Event",
        body: `${title} — ${event_type || "general"}`,
        type: "info",
        link: `/events`,
      });
    }

    return res.status(201).json({ success: true, event: { ...data, status: computeStatus(data) } });
  } catch {
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

    const { data, error } = await req.db.from("events")
      .update(updates).eq("id", req.params.id).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, event: { ...data, status: computeStatus(data) } });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* DELETE /api/events/:id — soft delete (teacher/admin) */
export const deleteEvent = async (req, res) => {
  try {
    await req.db.from("events").update({ is_active: false }).eq("id", req.params.id);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};

/* PATCH /api/events/:id/toggle-reg — toggle registration (teacher/admin) */
export const toggleRegistration = async (req, res) => {
  try {
    const { data: ev } = await req.db.from("events")
      .select("registration_open").eq("id", req.params.id).maybeSingle();
    if (!ev) return res.status(404).json({ error: "Not found" });

    const { data, error } = await req.db.from("events")
      .update({ registration_open: !ev.registration_open })
      .eq("id", req.params.id).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, registration_open: data.registration_open });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
};
