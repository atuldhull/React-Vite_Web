/**
 * Zod schemas for /api/auth/* endpoints.
 *
 * Each schema is paired with an Express middleware via validateBody()
 * in authRoutes.js. Replaces the ad-hoc `if (!email) return 400...`
 * checks that were scattered across authController.
 *
 * Policy notes:
 *   - We don't validate the SHAPE of an auth token or password against
 *     an arbitrary "strength" rule here — Supabase's own checks are
 *     authoritative (rejection comes back via signInWithPassword /
 *     updateUserById). We only enforce the invariants we own:
 *       * format (email must be an email)
 *       * presence (password can't be the empty string)
 *       * length caps (DoS defence — a 10MB "password" field would
 *         otherwise reach bcrypt)
 *   - Passwords have a floor of 6 for resetPassword to match what
 *     the controller already enforces; login has no floor because the
 *     existing password could be anything Supabase accepts.
 */

import { z } from "zod";

const email       = z.string().trim().toLowerCase()
  .email("must be a valid email")
  .max(320, "email too long");

const password    = z.string()
  .min(1, "password required")
  .max(128, "password too long");

const newPassword = z.string()
  .min(6,   "password must be at least 6 characters")
  .max(128, "password too long");

export const registerSchema = z.object({
  email,
  password: newPassword,
  name:         z.string().trim().min(1).max(100).optional(),
  invite_token: z.string().trim().min(1).max(200).optional(),
});

export const loginSchema = z.object({
  email,
  password,
});

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z.object({
  access_token: z.string().min(1, "token required"),
  new_password: newPassword,
});

export const resendVerificationSchema = z.object({
  email,
});
