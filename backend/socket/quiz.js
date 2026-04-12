/**
 * Live Quiz engine. State is in-memory (`quizSessions`) keyed by room code.
 * All session mutations happen in this module; the orchestrator passes an
 * `io` + `pushNotification` into the attach function so we can reach across
 * to the notification module for student invites without importing it here.
 */

const quizSessions = {};

function generateCode() {
  // 6-char uppercase alphanumeric room code
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function revealAnswer(io, code) {
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

/**
 * Notify every active student row about a newly created quiz. Takes
 * `pushNotification` as a dependency so this module doesn't import
 * from socket/notifications.js (keeps the dep graph shallow).
 */
async function announceNewQuiz(code, teacherName, pushNotificationFn) {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: students } = await supabase
      .from("students")
      .select("user_id")
      .eq("role", "student")
      .eq("is_active", true);

    if (!students?.length) return;

    const now = new Date().toISOString();
    const notifications = students.map((s) => ({
      user_id:    s.user_id,
      title:      "\u{1F3AF} Live Quiz Starting!",
      body:       `${teacherName} has started a live quiz! Join now with code: ${code}`,
      type:       "quiz_invite",
      link:       `/live-quiz?code=${code}`,
      is_read:    false,
      created_at: now,
    }));
    await supabase.from("notifications").insert(notifications);

    for (const s of students) {
      pushNotificationFn(s.user_id, {
        id:         `quiz-${code}-${s.user_id}`,
        title:      "\u{1F3AF} Live Quiz Starting!",
        message:    `${teacherName} started a live quiz! Code: ${code}`,
        type:       "quiz_invite",
        link:       `/live-quiz?code=${code}`,
        created_at: now,
      });
    }
    console.log(`[Quiz] Notified ${students.length} students about session ${code}`);
  } catch (err) {
    console.error("[Quiz] Failed to notify students:", err.message);
  }
}

export function attachQuiz(io, socket, { pushNotification }) {
  /* Teacher creates a quiz session. */
  socket.on("create_session", async ({ teacherName, questions }) => {
    const code = generateCode();
    quizSessions[code] = {
      code,
      teacherName,
      teacherSocket: socket.id,
      questions,
      players: {},        // socketId -> { name, score, answers: [], lastAnswer }
      currentQ: -1,       // -1 = lobby
      status: "lobby",    // lobby | question | results | finished
      timer: null,
    };
    socket.join(code);
    socket.emit("session_created", { code });
    console.log(`[Quiz] Session ${code} created by ${teacherName}`);

    await announceNewQuiz(code, teacherName, pushNotification);
  });

  /* Student joins the lobby. */
  socket.on("join_session", ({ code, playerName }) => {
    const session = quizSessions[code];
    if (!session) { socket.emit("join_error", "Session not found"); return; }
    if (session.status !== "lobby") { socket.emit("join_error", "Quiz already started"); return; }

    session.players[socket.id] = { name: playerName, score: 0, answers: [], lastAnswer: null };
    socket.join(code);

    socket.emit("joined", { code, playerName });

    io.to(session.teacherSocket).emit("player_joined", {
      players: Object.values(session.players).map((p) => ({ name: p.name, score: p.score })),
    });

    io.to(code).emit("lobby_update", {
      players: Object.values(session.players).map((p) => p.name),
      count:   Object.keys(session.players).length,
    });

    console.log(`[Quiz] ${playerName} joined ${code}`);
  });

  /* Teacher advances to the next question. */
  socket.on("next_question", ({ code }) => {
    const session = quizSessions[code];
    if (!session || session.teacherSocket !== socket.id) return;

    session.currentQ++;
    if (session.currentQ >= session.questions.length) {
      session.status = "finished";
      const final = Object.values(session.players)
        .sort((a, b) => b.score - a.score)
        .map((p, i) => ({ rank: i + 1, name: p.name, score: p.score }));
      io.to(code).emit("quiz_finished", { leaderboard: final });
      return;
    }

    session.status = "question";
    const q = session.questions[session.currentQ];

    Object.values(session.players).forEach((p) => (p.lastAnswer = null));

    io.to(code).emit("question_start", {
      questionNumber: session.currentQ + 1,
      total:          session.questions.length,
      title:          q.title,
      question:       q.question,
      options:        q.options,
      timeLimit:      q.timeLimit || 30,
      points:         q.points || 50,
    });

    if (session.timer) clearTimeout(session.timer);
    session.timer = setTimeout(() => revealAnswer(io, code), (q.timeLimit || 30) * 1000 + 2000);
  });

  /* Student submits an answer. */
  socket.on("submit_answer", ({ code, answerIndex, timeTaken }) => {
    const session = quizSessions[code];
    if (!session || session.status !== "question") return;

    const player = session.players[socket.id];
    if (!player || player.lastAnswer !== null) return; // already answered

    player.lastAnswer = answerIndex;

    const q         = session.questions[session.currentQ];
    const isCorrect = answerIndex === q.correct_index;
    const timeBonus = Math.max(
      0,
      Math.floor(((q.timeLimit || 30) - timeTaken) / (q.timeLimit || 30) * (q.points || 50)),
    );
    const earned = isCorrect ? (q.points || 50) + timeBonus : 0;

    player.score += earned;
    player.answers.push({ questionIndex: session.currentQ, answerIndex, correct: isCorrect, earned });

    socket.emit("answer_received", { received: true });

    const answered = Object.values(session.players).filter((p) => p.lastAnswer !== null).length;
    io.to(session.teacherSocket).emit("answer_update", {
      answered,
      total: Object.keys(session.players).length,
    });

    // Auto-reveal when everyone has answered
    if (answered === Object.keys(session.players).length) {
      if (session.timer) clearTimeout(session.timer);
      revealAnswer(io, code);
    }
  });

  /* Teacher force-reveals the current answer. */
  socket.on("reveal_answer", ({ code }) => {
    const session = quizSessions[code];
    if (!session || session.teacherSocket !== socket.id) return;
    if (session.timer) clearTimeout(session.timer);
    revealAnswer(io, code);
  });

  /* Teacher ends the session entirely. */
  socket.on("end_session", ({ code }) => {
    const session = quizSessions[code];
    if (!session || session.teacherSocket !== socket.id) return;
    if (session.timer) clearTimeout(session.timer);
    io.to(code).emit("session_ended");
    delete quizSessions[code];
  });
}

/**
 * On disconnect, remove the socket from any quiz lobbies and notify the
 * teacher of updated player counts.
 */
export function cleanupQuiz(io, socket) {
  for (const [code, session] of Object.entries(quizSessions)) {
    if (session.players[socket.id]) {
      delete session.players[socket.id];
      io.to(code).emit("lobby_update", {
        players: Object.values(session.players).map((p) => p.name),
        count:   Object.keys(session.players).length,
      });
      io.to(session.teacherSocket).emit("player_joined", {
        players: Object.values(session.players).map((p) => ({ name: p.name, score: p.score })),
      });
    }
  }
}
