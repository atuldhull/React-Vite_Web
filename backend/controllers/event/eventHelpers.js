/**
 * Event Helpers — Shared utilities for event controllers
 */

import crypto from "crypto";

export function generateQrToken() {
  return crypto.randomBytes(16).toString("hex"); // 32-char hex token
}

export function computeStatus(ev) {
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

export function validateUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}
