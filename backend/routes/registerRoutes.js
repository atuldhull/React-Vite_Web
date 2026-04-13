/**
 * Central API route registrar.
 * Keeps all existing endpoints intact while giving server.js a single import.
 */
import botRoutes          from "./botRoutes.js";
import contactRoutes      from "./contactRoutes.js";
import aiRoutes           from "./aiRoutes.js";
import adminRoutes        from "./adminRoutes.js";
import superAdminRoutes   from "./superAdminRoutes.js";
import orgAdminRoutes     from "./orgAdminRoutes.js";
import authRoutes         from "./authRoutes.js";
import challengeRoutes    from "./challengeRoutes.js";
import leaderboardRoutes  from "./leaderboardRoutes.js";
import arenaRoutes        from "./arenaRoutes.js";
import userRoutes         from "./userRoutes.js";
import eventRoutes        from "./eventRoutes.js";
import teacherRoutes      from "./teacherRoutes.js";
import quizRoutes         from "./quizRoutes.js";
import projectRoutes      from "./projectRoutes.js";
import announcementRoutes from "./announcementRoutes.js";
import galleryRoutes      from "./galleryRoutes.js";
import notificationRoutes from "./notificationRoutes.js";
import certificateRoutes  from "./certificateRoutes.js";
import paymentRoutes      from "./paymentRoutes.js";
import commentRoutes      from "./commentRoutes.js";
import messagingRoutes    from "./messagingRoutes.js";
import referralRoutes     from "./referralRoutes.js";
import achievementRoutes  from "./achievementRoutes.js";
import insightsRoutes     from "./insightsRoutes.js";
import statsRoutes        from "./statsRoutes.js";
import { authLimiter, contactLimiter } from "../middleware/rateLimiter.js";

export default function registerApiRoutes(app) {
  app.use("/api/super-admin",   superAdminRoutes);
  app.use("/api/org-admin",     orgAdminRoutes);
  app.use("/api/ai",            aiRoutes);
  app.use("/api/admin",         adminRoutes);
  app.use("/api/auth",          authLimiter, authRoutes);
  app.use("/api/challenge",     challengeRoutes);
  app.use("/api/leaderboard",   leaderboardRoutes);
  app.use("/api/arena",         arenaRoutes);
  app.use("/api/user",          userRoutes);
  app.use("/api/events",        eventRoutes);
  app.use("/api/contact",       contactLimiter, contactRoutes);
  app.use("/api/teacher",       teacherRoutes);
  app.use("/api/quiz",          quizRoutes);
  app.use("/api/projects",      projectRoutes);
  app.use("/api/announcements", announcementRoutes);
  app.use("/api/gallery",       galleryRoutes);
  app.use("/api/bot",           botRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/certificates",  certificateRoutes);
  app.use("/api/payment",       paymentRoutes);
  app.use("/api/comments",      commentRoutes);
  app.use("/api/chat",          messagingRoutes);
  app.use("/api/referral",      referralRoutes);
  app.use("/api/achievements",  achievementRoutes);
  app.use("/api/insights",      insightsRoutes);
  app.use("/api/stats",         statsRoutes);
}
