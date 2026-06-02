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
import userProfileRoutes  from "./userProfileRoutes.js";
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
import healthRoutes       from "./healthRoutes.js";
import coreTeamRoutes     from "./coreTeamRoutes.js";
import problemRoutes      from "./problemRoutes.js";
import roadmapRoutes      from "./roadmapRoutes.js";
import portfolioRoutes    from "./portfolioRoutes.js";
import bookmarkRoutes     from "./bookmarkRoutes.js";
import problemSubmissionRoutes from "./problemSubmissionRoutes.js";
import searchRoutes        from "./searchRoutes.js";
import writeupCommentRoutes from "./writeupCommentRoutes.js";
import sprintRoutes        from "./sprintRoutes.js";
import { authLimiter, contactLimiter } from "../middleware/rateLimiter.js";

export default function registerApiRoutes(app) {
  // Health + readiness probes — mounted FIRST so they always answer
  // even if a later route mount throws. Public, no auth, no rate limit.
  app.use("/api",               healthRoutes);

  app.use("/api/super-admin",   superAdminRoutes);
  app.use("/api/org-admin",     orgAdminRoutes);
  app.use("/api/ai",            aiRoutes);
  app.use("/api/admin",         adminRoutes);
  app.use("/api/auth",          authLimiter, authRoutes);
  app.use("/api/challenge",     challengeRoutes);
  app.use("/api/leaderboard",   leaderboardRoutes);
  app.use("/api/arena",         arenaRoutes);
  app.use("/api/user",          userRoutes);
  app.use("/api/users",         userProfileRoutes);
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
  app.use("/api/core",          coreTeamRoutes);
  app.use("/api/problems",      problemRoutes);
  app.use("/api/roadmaps",      roadmapRoutes);
  app.use("/api/portfolio",     portfolioRoutes);
  app.use("/api/bookmarks",     bookmarkRoutes);
  app.use("/api/problem-submissions", problemSubmissionRoutes);
  app.use("/api/search",        searchRoutes);
  app.use("/api/writeups",      writeupCommentRoutes);
  app.use("/api/sprints",       sprintRoutes);
}
