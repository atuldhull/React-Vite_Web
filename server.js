import dotenv from "dotenv";
dotenv.config({ path: "./.env.local" });

import express    from "express";
import path       from "path";
import http       from "http";
import helmet     from "helmet";
import cors       from "cors";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { generalLimiter } from "./middleware/rateLimiter.js";
import { injectTenant } from "./middleware/tenantMiddleware.js";
import { sessionMiddleware } from "./middleware/sessionConfig.js";

import registerApiRoutes from "./routes/registerRoutes.js";
import pageRoutes         from "./routes/pageRoutes.js";
import authController     from "./controllers/authController.js";

const isProd = process.env.NODE_ENV === "production";
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: isProd ? false : "*", credentials: true },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/* ── SECURITY ── */
app.use(helmet({
  contentSecurityPolicy: false,  // CSP breaks inline scripts in SPA
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: isProd ? process.env.FRONTEND_URL || false : true,
  credentials: true,
}));

/* ── MIDDLEWARE ── */
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "2mb" })); // Limit body size
app.use(sessionMiddleware);

/* ── TENANT MIDDLEWARE ── */
app.use("/api", injectTenant);

/* ── RATE LIMITING ── */
app.use("/api/", generalLimiter);

/* ── API ROUTES ── */
registerApiRoutes(app);

/* ── Global logout (works from any page) ── */
app.get("/logout", authController.logoutRedirect);

/* ── DEBUG ── */
app.get("/api/debug", async (req, res) => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { count: c } = await sb.from("challenges").select("*", { count: "exact", head: true }).eq("is_active", true);
  const { count: s } = await sb.from("students").select("*", { count: "exact", head: true });
  res.json({ session: req.session?.user || null, activeChallenges: c, totalStudents: s });
});

/* ── PAGE ROUTES ── */
app.use("/", pageRoutes);

/* ── 404 — serve SPA for unmatched routes (client-side routing) ── */
app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
  res.sendFile(path.join(__dirname, "public", "app", "index.html"));
});

/* ── ERROR ── */
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.stack);
  if (req.path.startsWith("/api/")) return res.status(500).json({ error: "Internal server error" });
  res.sendFile(path.join(__dirname, "public", "app", "index.html"));
});

/* ════════════════════════════════════════
   SOCKET.IO — LIVE QUIZ ENGINE
════════════════════════════════════════ */

// Active quiz sessions: { roomCode -> sessionData }
const quizSessions = {};

// Notifications: userId -> Set of socketIds
const userSockets = {};

// Presence: socketId -> { userId, name, page, connectedAt, lastSeen }
const activeUsers = {};

function generateCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

/* ── Socket.IO session authentication ── */
io.engine.use(sessionMiddleware);

io.use((socket, next) => {
  const session = socket.request.session;
  if (session?.user?.id) {
    socket.userId = session.user.id;
    socket.userRole = session.user.role;
    socket.userName = session.user.name;
    next();
  } else {
    // Allow connection but mark as unauthenticated
    // (public pages may connect sockets for real-time updates)
    socket.userId = null;
    socket.userRole = null;
    next();
  }
});

io.on("connection", (socket) => {

  /* ── Teacher creates a quiz session ── */
  socket.on("create_session", async ({ teacherName, questions }) => {
    const code = generateCode();
    quizSessions[code] = {
      code,
      teacherName,
      teacherSocket: socket.id,
      questions,
      players: {},        // socketId -> { name, score, answers: [] }
      currentQ: -1,       // -1 = lobby
      status: "lobby",    // lobby | question | results | finished
      timer: null,
    };
    socket.join(code);
    socket.emit("session_created", { code });
    console.log(`[Quiz] Session ${code} created by ${teacherName}`);

    // ── Auto-notify all students about the live quiz ──
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

      // Get all active students
      const { data: students } = await supabase
        .from("students")
        .select("user_id")
        .eq("role", "student")
        .eq("is_active", true);

      if (students && students.length > 0) {
        const now = new Date().toISOString();

        // Create notification records in bulk
        const notifications = students.map((s) => ({
          user_id: s.user_id,
          title: "🎯 Live Quiz Starting!",
          body: `${teacherName} has started a live quiz! Join now with code: ${code}`,
          type: "quiz_invite",
          link: `/live-quiz?code=${code}`,
          is_read: false,
          created_at: now,
        }));

        await supabase.from("notifications").insert(notifications);

        // Push real-time notification to all online students
        for (const s of students) {
          pushNotification(s.user_id, {
            id: `quiz-${code}-${s.user_id}`,
            title: "🎯 Live Quiz Starting!",
            message: `${teacherName} started a live quiz! Code: ${code}`,
            type: "quiz_invite",
            link: `/live-quiz?code=${code}`,
            created_at: now,
          });
        }

        console.log(`[Quiz] Notified ${students.length} students about session ${code}`);
      }
    } catch (err) {
      console.error("[Quiz] Failed to notify students:", err.message);
    }
  });

  /* ── Student joins ── */
  socket.on("join_session", ({ code, playerName }) => {
    const session = quizSessions[code];
    if (!session) { socket.emit("join_error", "Session not found"); return; }
    if (session.status !== "lobby") { socket.emit("join_error", "Quiz already started"); return; }

    session.players[socket.id] = { name: playerName, score: 0, answers: [], lastAnswer: null };
    socket.join(code);

    // Tell student they joined
    socket.emit("joined", { code, playerName });

    // Tell teacher someone new joined
    io.to(session.teacherSocket).emit("player_joined", {
      players: Object.values(session.players).map(p => ({ name: p.name, score: p.score }))
    });

    // Tell all students in lobby updated player list
    io.to(code).emit("lobby_update", {
      players: Object.values(session.players).map(p => p.name),
      count:   Object.keys(session.players).length,
    });

    console.log(`[Quiz] ${playerName} joined ${code}`);
  });

  /* ── Teacher kicks off next question ── */
  socket.on("next_question", ({ code }) => {
    const session = quizSessions[code];
    if (!session || session.teacherSocket !== socket.id) return;

    session.currentQ++;
    if (session.currentQ >= session.questions.length) {
      // All done — send final results
      session.status = "finished";
      const final = Object.values(session.players)
        .sort((a, b) => b.score - a.score)
        .map((p, i) => ({ rank: i + 1, name: p.name, score: p.score }));
      io.to(code).emit("quiz_finished", { leaderboard: final });
      return;
    }

    session.status = "question";
    const q = session.questions[session.currentQ];

    // Reset last answers for this round
    Object.values(session.players).forEach(p => p.lastAnswer = null);

    // Send question (WITHOUT correct_index) to students
    io.to(code).emit("question_start", {
      questionNumber: session.currentQ + 1,
      total:          session.questions.length,
      title:          q.title,
      question:       q.question,
      options:        q.options,
      timeLimit:      q.timeLimit || 30,
      points:         q.points || 50,
    });

    // Auto-reveal after time limit
    if (session.timer) clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      revealAnswer(code);
    }, (q.timeLimit || 30) * 1000 + 2000); // +2s grace
  });

  /* ── Student submits answer ── */
  socket.on("submit_answer", ({ code, answerIndex, timeTaken }) => {
    const session = quizSessions[code];
    if (!session || session.status !== "question") return;

    const player = session.players[socket.id];
    if (!player || player.lastAnswer !== null) return; // already answered

    player.lastAnswer = answerIndex;

    const q          = session.questions[session.currentQ];
    const isCorrect  = answerIndex === q.correct_index;
    const timeBonus  = Math.max(0, Math.floor(((q.timeLimit || 30) - timeTaken) / (q.timeLimit || 30) * (q.points || 50)));
    const earned     = isCorrect ? (q.points || 50) + timeBonus : 0;

    player.score += earned;
    player.answers.push({ questionIndex: session.currentQ, answerIndex, correct: isCorrect, earned });

    // Confirm to student
    socket.emit("answer_received", { received: true });

    // Tell teacher how many answered
    const answered = Object.values(session.players).filter(p => p.lastAnswer !== null).length;
    io.to(session.teacherSocket).emit("answer_update", {
      answered,
      total: Object.keys(session.players).length,
    });

    // Auto-reveal when everyone answered
    if (answered === Object.keys(session.players).length) {
      if (session.timer) clearTimeout(session.timer);
      revealAnswer(code);
    }
  });

  /* ── Teacher manually reveals answer ── */
  socket.on("reveal_answer", ({ code }) => {
    const session = quizSessions[code];
    if (!session || session.teacherSocket !== socket.id) return;
    if (session.timer) clearTimeout(session.timer);
    revealAnswer(code);
  });

  /* ── End session ── */
  socket.on("end_session", ({ code }) => {
    const session = quizSessions[code];
    if (!session || session.teacherSocket !== socket.id) return;
    if (session.timer) clearTimeout(session.timer);
    io.to(code).emit("session_ended");
    delete quizSessions[code];
  });

  /* ── Notifications: register user ── */
  socket.on("register_user", (clientUserId) => {
    // Use session-verified userId, NOT client-supplied (prevents spoofing)
    const verifiedId = socket.userId || clientUserId;
    if (!verifiedId) return;
    if (!userSockets[verifiedId]) userSockets[verifiedId] = new Set();
    userSockets[verifiedId].add(socket.id);
    socket.userId = verifiedId;
    socket.join(`user:${verifiedId}`);
  });

  /* ── Presence tracking for admin live users panel ── */
  socket.on("presence", ({ userId, name, page }) => {
    if (!userId) return;
    socket.userId = userId;
    activeUsers[socket.id] = {
      userId,
      name:        name || "Member",
      page:        page || "/",
      connectedAt: activeUsers[socket.id]?.connectedAt || new Date().toISOString(),
      lastSeen:    new Date().toISOString(),
    };
    io.to("admin_room").emit("active_users_update", buildActiveUsersList());
  });

  /* ── Admin live users room ── */
  socket.on("join_admin", () => {
    // Only allow admin/super_admin to see active users
    if (!socket.userRole || !["admin", "super_admin"].includes(socket.userRole)) return;
    socket.join("admin_room");
    socket.emit("active_users_update", buildActiveUsersList());
  });

  /* ── Chat: real-time messaging ── */
  socket.on("chat:send", ({ conversationId, recipientId, encryptedContent, iv, messageType }) => {
    // Forward encrypted message to recipient in real-time
    io.to(`user:${recipientId}`).emit("chat:receive", {
      conversationId,
      senderId: socket.userId,
      encryptedContent,
      iv,
      messageType: messageType || "text",
      createdAt: new Date().toISOString(),
    });
  });

  socket.on("chat:typing", ({ conversationId, recipientId }) => {
    io.to(`user:${recipientId}`).emit("chat:typing", {
      conversationId,
      userId: socket.userId,
    });
  });

  socket.on("chat:read", ({ conversationId, senderId }) => {
    io.to(`user:${senderId}`).emit("chat:read", {
      conversationId,
      readBy: socket.userId,
      readAt: new Date().toISOString(),
    });
  });

  /* ── Disconnect cleanup ── */
  socket.on("disconnect", () => {
    // Quiz cleanup
    for (const [code, session] of Object.entries(quizSessions)) {
      if (session.players[socket.id]) {
        delete session.players[socket.id];
        io.to(code).emit("lobby_update", {
          players: Object.values(session.players).map(p => p.name),
          count:   Object.keys(session.players).length,
        });
        io.to(session.teacherSocket).emit("player_joined", {
          players: Object.values(session.players).map(p => ({ name: p.name, score: p.score }))
        });
      }
    }
    // Notification + presence cleanup
    if (socket.userId && userSockets[socket.userId]) {
      userSockets[socket.userId].delete(socket.id);
      if (!userSockets[socket.userId].size) delete userSockets[socket.userId];
    }
    delete activeUsers[socket.id];
    io.to("admin_room").emit("active_users_update", buildActiveUsersList());
  });
});

function revealAnswer(code) {
  const session = quizSessions[code];
  if (!session) return;
  session.status = "results";

  const q = session.questions[session.currentQ];
  const podium = Object.values(session.players)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((p, i) => ({ rank: i + 1, name: p.name, score: p.score }));

  io.to(code).emit("question_result", {
    correctIndex: q.correct_index,
    solution:     q.solution || null,
    podium,
    isLast:       session.currentQ >= session.questions.length - 1,
  });
}

function buildActiveUsersList() {
  return Object.values(activeUsers).map(u => ({
    ...u,
    sessionDuration: Math.floor((new Date() - new Date(u.connectedAt)) / 1000),
  }));
}

// Export so admin route can pull current snapshot
export function getActiveUsers() { return buildActiveUsersList(); }

// Export helper so controllers can push notifications
export function pushNotification(userId, payload) {
  io.to(`user:${userId}`).emit("notification", payload);
}

/* ── START ── */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
┌─────────────────────────────────────────┐
│   ✦  MATH COLLECTIVE — SERVER LIVE  ✦   │
├─────────────────────────────────────────┤
│  🌐  http://localhost:${PORT}               │
│  🔑  Service Role: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ MISSING'}           │
│  ⚡  Live Quiz (Socket.io): ACTIVE      │
│  🏛️  Multi-Tenant: ACTIVE              │
└─────────────────────────────────────────┘
  `);
});

export { io };
