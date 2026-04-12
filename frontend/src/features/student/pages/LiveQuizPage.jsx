import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { io } from "socket.io-client";
import SpaceBackground from "@/components/backgrounds/SpaceBackground";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import Loader from "@/components/ui/Loader";
import { useAuthStore } from "@/store/auth-store";

/* ── animation variants ── */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  }),
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

/* ── phase constants ── */
const PHASE = {
  JOIN: "join",
  LOBBY: "lobby",
  QUESTION: "question",
  RESULT: "result",
  FINISHED: "finished",
  ENDED: "ended",
  ERROR: "error",
};

export default function LiveQuizPage() {
  /* ── connection ── */
  const socketRef = useRef(null);

  /* ── Auto-fill code from URL (?code=ABC123) + name from auth ── */
  const [searchParams] = useSearchParams();
  const authUser = useAuthStore((s) => s.user);

  /* ── join form ── */
  const [code, setCode] = useState(() => searchParams.get("code") || "");
  const [playerName, setPlayerName] = useState(() => authUser?.name?.split(" ")[0] || "");
  const [joining, setJoining] = useState(false);

  /* ── phase ── */
  const [phase, setPhase] = useState(PHASE.JOIN);
  const [errorMsg, setErrorMsg] = useState("");

  /* ── lobby ── */
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [lobbyCount, setLobbyCount] = useState(0);

  /* ── question ── */
  const [question, setQuestion] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [answerSubmitted, setAnswerSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [questionStart, setQuestionStart] = useState(null);
  const timerRef = useRef(null);

  /* ── result ── */
  const [result, setResult] = useState(null);

  /* ── finished ── */
  const [leaderboard, setLeaderboard] = useState([]);

  /* ── session code (after join) ── */
  const [sessionCode, setSessionCode] = useState("");

  /* ── cleanup socket on unmount ── */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  /* ── countdown timer ── */
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (phase === PHASE.QUESTION && question?.timeLimit) {
      setTimeLeft(question.timeLimit);
      setQuestionStart(Date.now());

      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, question]);

  /* ── connect & join ── */
  const handleJoin = useCallback(() => {
    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = playerName.trim();

    if (!trimmedCode || !trimmedName) {
      setErrorMsg("Please enter both a quiz code and your name.");
      setPhase(PHASE.ERROR);
      return;
    }

    setJoining(true);
    setErrorMsg("");

    // Connect to same host
    const socket = io(window.location.origin, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join_session", { code: trimmedCode, playerName: trimmedName });
    });

    socket.on("connect_error", () => {
      setErrorMsg("Unable to connect to the quiz server. Please try again.");
      setPhase(PHASE.ERROR);
      setJoining(false);
      socket.disconnect();
    });

    /* ── joined successfully ── */
    socket.on("joined", ({ code: joinedCode }) => {
      setSessionCode(joinedCode);
      setPhase(PHASE.LOBBY);
      setJoining(false);
    });

    /* ── join error ── */
    socket.on("join_error", (msg) => {
      setErrorMsg(typeof msg === "string" ? msg : "Failed to join session.");
      setPhase(PHASE.ERROR);
      setJoining(false);
      socket.disconnect();
    });

    /* ── lobby updates ── */
    socket.on("lobby_update", ({ players, count }) => {
      setLobbyPlayers(players || []);
      setLobbyCount(count || 0);
    });

    /* ── question starts ── */
    socket.on("question_start", (data) => {
      setQuestion(data);
      setSelectedAnswer(null);
      setAnswerSubmitted(false);
      setResult(null);
      setPhase(PHASE.QUESTION);
    });

    /* ── answer confirmed ── */
    socket.on("answer_received", () => {
      setAnswerSubmitted(true);
    });

    /* ── question result ── */
    socket.on("question_result", (data) => {
      setResult(data);
      setPhase(PHASE.RESULT);
      if (timerRef.current) clearInterval(timerRef.current);
    });

    /* ── quiz finished ── */
    socket.on("quiz_finished", ({ leaderboard: lb }) => {
      setLeaderboard(lb || []);
      setPhase(PHASE.FINISHED);
      if (timerRef.current) clearInterval(timerRef.current);
    });

    /* ── session ended by teacher ── */
    socket.on("session_ended", () => {
      setPhase(PHASE.ENDED);
      if (timerRef.current) clearInterval(timerRef.current);
      socket.disconnect();
    });

    /* ── disconnect ── */
    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect" || reason === "transport close") {
        if (phase !== PHASE.FINISHED && phase !== PHASE.ENDED) {
          setErrorMsg("Connection lost. The session may have ended.");
          setPhase(PHASE.ENDED);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, playerName]);

  /* ── submit answer ── */
  const handleSubmitAnswer = useCallback(
    (answerIndex) => {
      if (answerSubmitted || !socketRef.current) return;

      setSelectedAnswer(answerIndex);

      const timeTaken = questionStart
        ? Math.round((Date.now() - questionStart) / 1000)
        : 0;

      socketRef.current.emit("submit_answer", {
        code: sessionCode,
        answerIndex,
        timeTaken,
      });
    },
    [answerSubmitted, sessionCode, questionStart]
  );

  /* ── leave / reset ── */
  const handleLeave = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setPhase(PHASE.JOIN);
    setCode("");
    setPlayerName("");
    setErrorMsg("");
    setQuestion(null);
    setSelectedAnswer(null);
    setAnswerSubmitted(false);
    setResult(null);
    setLeaderboard([]);
    setLobbyPlayers([]);
    setLobbyCount(0);
    setSessionCode("");
    setJoining(false);
  }, []);

  /* ── timer progress percentage ── */
  const timerPercent = question?.timeLimit ? (timeLeft / question.timeLimit) * 100 : 0;
  const timerColor =
    timerPercent > 50 ? "from-success to-secondary" :
    timerPercent > 25 ? "from-warning to-warning" :
    "from-danger to-danger";

  /* ── medal icons ── */
  const medalForRank = (rank) => {
    if (rank === 1) return { icon: "1st", color: "text-warning", bg: "bg-warning/15 border-warning/30" };
    if (rank === 2) return { icon: "2nd", color: "text-text-muted", bg: "bg-white/5 border-line/20" };
    if (rank === 3) return { icon: "3rd", color: "text-[#cd7f32]", bg: "bg-[#cd7f32]/10 border-[#cd7f32]/20" };
    return { icon: `#${rank}`, color: "text-text-dim", bg: "bg-white/[0.03] border-line/10" };
  };

  /* ═══════════════════════════════════════════
     RENDER — JOIN SCREEN
     ═══════════════════════════════════════════ */
  if (phase === PHASE.JOIN || phase === PHASE.ERROR) {
    return (
      <>
        <SpaceBackground />
        <div className="relative z-10 flex min-h-[70vh] items-center justify-center pb-16">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={scaleIn}
            className="w-full max-w-md"
          >
            <Card variant="glow">
              <div className="text-center">
                <motion.p
                  custom={0}
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  className="font-mono text-xs uppercase tracking-[0.3em] text-danger"
                >
                  Battle Mode
                </motion.p>
                <motion.h1
                  custom={1}
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  className="mt-3 font-display text-4xl font-extrabold tracking-[-0.05em] text-white"
                >
                  Live Quiz
                </motion.h1>
                <motion.p
                  custom={2}
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  className="mt-2 text-sm text-text-muted"
                >
                  Enter the code from your teacher to join the session.
                </motion.p>
              </div>

              <div className="mt-8 space-y-5">
                <InputField
                  label="Quiz Code"
                  placeholder="e.g. AB3X9K"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  inputClassName="text-center font-mono text-lg tracking-[0.3em] uppercase"
                />

                <InputField
                  label="Your Name"
                  placeholder="Enter your display name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                />

                {phase === PHASE.ERROR && errorMsg && (
                  <motion.p
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-center text-sm text-danger"
                  >
                    {errorMsg}
                  </motion.p>
                )}

                <Button
                  className="w-full justify-center"
                  loading={joining}
                  onClick={handleJoin}
                >
                  Join Session
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>
      </>
    );
  }

  /* ═══════════════════════════════════════════
     RENDER — LOBBY
     ═══════════════════════════════════════════ */
  if (phase === PHASE.LOBBY) {
    return (
      <>
        <SpaceBackground />
        <div className="relative z-10 flex min-h-[70vh] items-center justify-center pb-16">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={scaleIn}
            className="w-full max-w-lg"
          >
            <Card variant="glass">
              <div className="text-center">
                <p className="font-mono text-xs uppercase tracking-[0.3em] text-success">
                  Connected
                </p>
                <h2 className="mt-3 font-display text-3xl font-extrabold tracking-[-0.05em] text-white">
                  Waiting for Host
                </h2>
                <p className="mt-2 text-sm text-text-muted">
                  Session <span className="font-mono font-bold text-primary">{sessionCode}</span>
                </p>
              </div>

              {/* Animated waiting indicator */}
              <div className="mt-8 flex justify-center">
                <Loader variant="orbit" size="lg" label="The quiz will begin shortly..." />
              </div>

              {/* Player list */}
              <div className="mt-8">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-secondary">
                    Players in Lobby
                  </p>
                  <span className="rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1 font-mono text-[11px] font-bold text-secondary">
                    {lobbyCount}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <AnimatePresence mode="popLayout">
                    {lobbyPlayers.map((name, i) => (
                      <motion.div
                        key={name + i}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.3, delay: i * 0.05 }}
                        className="flex items-center gap-2 rounded-2xl border border-line/15 bg-white/[0.03] px-3 py-2"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary via-secondary to-glow text-xs font-bold text-white">
                          {name.charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate text-sm font-medium text-white">
                          {name}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              <div className="mt-8 text-center">
                <Button variant="ghost" size="sm" onClick={handleLeave}>
                  Leave Session
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>
      </>
    );
  }

  /* ═══════════════════════════════════════════
     RENDER — QUESTION
     ═══════════════════════════════════════════ */
  if (phase === PHASE.QUESTION && question) {
    const optionLetters = "ABCDEFGH";
    const optionColors = [
      { bg: "bg-primary/15", border: "border-primary/40", text: "text-primary" },
      { bg: "bg-secondary/15", border: "border-secondary/40", text: "text-secondary" },
      { bg: "bg-glow/15", border: "border-glow/40", text: "text-glow" },
      { bg: "bg-warning/15", border: "border-warning/40", text: "text-warning" },
      { bg: "bg-success/15", border: "border-success/40", text: "text-success" },
      { bg: "bg-danger/15", border: "border-danger/40", text: "text-danger" },
    ];

    return (
      <>
        <SpaceBackground />
        <div className="relative z-10 space-y-6 pb-16">
          {/* Header bar */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between"
          >
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-danger">
                Live Quiz
              </p>
              <p className="mt-1 font-mono text-sm text-text-muted">
                Question{" "}
                <span className="font-bold text-white">{question.questionNumber}</span>
                {" / "}
                <span className="text-white">{question.total}</span>
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                  Points
                </p>
                <p className="font-display text-xl font-bold text-warning">
                  {question.points || 50}
                </p>
              </div>

              {/* Timer circle */}
              <div className="relative flex h-14 w-14 items-center justify-center">
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 56 56">
                  <circle
                    cx="28"
                    cy="28"
                    r="24"
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="4"
                  />
                  <motion.circle
                    cx="28"
                    cy="28"
                    r="24"
                    fill="none"
                    stroke={timerPercent > 50 ? "#22c55e" : timerPercent > 25 ? "#f59e0b" : "#ef4444"}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 24}
                    strokeDashoffset={2 * Math.PI * 24 * (1 - timerPercent / 100)}
                    transition={{ duration: 0.5 }}
                  />
                </svg>
                <span className={`font-mono text-lg font-bold ${
                  timerPercent > 50 ? "text-success" : timerPercent > 25 ? "text-warning" : "text-danger"
                }`}>
                  {timeLeft}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Timer bar */}
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <motion.div
              className={`h-full rounded-full bg-gradient-to-r ${timerColor}`}
              animate={{ width: `${timerPercent}%` }}
              transition={{ duration: 0.8, ease: "linear" }}
            />
          </div>

          {/* Question card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={question.questionNumber}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <Card variant="glass">
                {question.title && (
                  <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary/80">
                    {question.title}
                  </p>
                )}
                <h2 className="mt-3 font-display text-xl font-bold leading-8 text-white sm:text-2xl">
                  {question.question}
                </h2>

                {/* Options */}
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {(question.options || []).map((option, oi) => {
                    const colors = optionColors[oi % optionColors.length];
                    const isSelected = selectedAnswer === oi;
                    const isLocked = answerSubmitted;

                    return (
                      <motion.button
                        key={oi}
                        whileHover={isLocked ? undefined : { scale: 1.02 }}
                        whileTap={isLocked ? undefined : { scale: 0.98 }}
                        onClick={() => !isLocked && handleSubmitAnswer(oi)}
                        disabled={isLocked}
                        className={`relative w-full rounded-2xl border px-5 py-4 text-left transition duration-200 ${
                          isSelected
                            ? `${colors.border} ${colors.bg} shadow-pulse`
                            : isLocked
                              ? "border-line/10 bg-white/[0.02] opacity-50"
                              : "border-line/15 bg-white/[0.03] hover:border-primary/25 hover:bg-white/[0.05]"
                        } ${isLocked && !isSelected ? "pointer-events-none" : ""}`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-bold ${
                              isSelected
                                ? `${colors.border} ${colors.bg} ${colors.text}`
                                : "border-line/20 bg-white/[0.05] text-text-dim"
                            }`}
                          >
                            {optionLetters[oi]}
                          </span>
                          <span className={`text-sm font-medium ${isSelected ? "text-white" : "text-text-muted"}`}>
                            {typeof option === "string" ? option : option.text || option.label}
                          </span>
                        </div>
                        {isSelected && answerSubmitted && (
                          <motion.span
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-wider text-success"
                          >
                            Locked
                          </motion.span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>

                {answerSubmitted && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-center"
                  >
                    <p className="text-sm font-medium text-success">
                      Answer submitted! Waiting for results...
                    </p>
                  </motion.div>
                )}

                {timeLeft === 0 && !answerSubmitted && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-center"
                  >
                    <p className="text-sm font-medium text-warning">
                      Time is up! Waiting for results...
                    </p>
                  </motion.div>
                )}
              </Card>
            </motion.div>
          </AnimatePresence>
        </div>
      </>
    );
  }

  /* ═══════════════════════════════════════════
     RENDER — QUESTION RESULT
     ═══════════════════════════════════════════ */
  if (phase === PHASE.RESULT && result) {
    const wasCorrect = selectedAnswer === result.correctIndex;
    const didNotAnswer = selectedAnswer === null;

    return (
      <>
        <SpaceBackground />
        <div className="relative z-10 space-y-8 pb-16">
          {/* Result header */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            {didNotAnswer ? (
              <>
                <p className="font-display text-5xl font-extrabold text-warning">--</p>
                <p className="mt-2 font-display text-2xl font-bold text-white">No Answer</p>
                <p className="mt-1 text-sm text-text-muted">You did not answer this question.</p>
              </>
            ) : wasCorrect ? (
              <>
                <motion.div
                  initial={{ rotate: -15, scale: 0 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 15 }}
                >
                  <p className="font-display text-6xl font-extrabold text-success">Correct!</p>
                </motion.div>
                <p className="mt-2 text-sm text-text-muted">Great job, keep it going!</p>
              </>
            ) : (
              <>
                <p className="font-display text-5xl font-extrabold text-danger">Wrong</p>
                <p className="mt-2 text-sm text-text-muted">The correct answer was highlighted below.</p>
              </>
            )}
          </motion.div>

          {/* Answer reveal */}
          {question && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card variant="solid">
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">
                  Question {question.questionNumber}
                </p>
                <h3 className="mt-2 font-display text-lg font-bold text-white">
                  {question.question}
                </h3>

                <div className="mt-5 space-y-2">
                  {(question.options || []).map((opt, oi) => {
                    const isCorrect = oi === result.correctIndex;
                    const isYours = oi === selectedAnswer;
                    const optText = typeof opt === "string" ? opt : opt.text || opt.label;

                    return (
                      <motion.div
                        key={oi}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + oi * 0.08 }}
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
                          isCorrect
                            ? "border-success/30 bg-success/10"
                            : isYours && !isCorrect
                              ? "border-danger/30 bg-danger/10"
                              : "border-line/10 bg-white/[0.02]"
                        }`}
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            isCorrect
                              ? "bg-success/20 text-success"
                              : isYours && !isCorrect
                                ? "bg-danger/20 text-danger"
                                : "bg-white/5 text-text-dim"
                          }`}
                        >
                          {isCorrect ? "\u2713" : isYours && !isCorrect ? "\u2717" : String.fromCharCode(65 + oi)}
                        </span>
                        <span className={`text-sm ${isCorrect ? "font-medium text-white" : "text-text-muted"}`}>
                          {optText}
                        </span>
                        {isYours && (
                          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-text-dim">
                            Your pick
                          </span>
                        )}
                      </motion.div>
                    );
                  })}
                </div>

                {result.solution && (
                  <div className="mt-5 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-primary">
                      Solution
                    </p>
                    <p className="mt-1 text-sm leading-7 text-text-muted">{result.solution}</p>
                  </div>
                )}
              </Card>
            </motion.div>
          )}

          {/* Podium */}
          {result.podium && result.podium.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card variant="glass">
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warning">
                  Top Players
                </p>

                <div className="mt-4 space-y-2">
                  {result.podium.map((p, i) => {
                    const medal = medalForRank(p.rank);
                    const isMe = p.name === playerName;

                    return (
                      <motion.div
                        key={p.rank}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + i * 0.08 }}
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 ${medal.bg} ${
                          isMe ? "ring-1 ring-primary/30" : ""
                        }`}
                      >
                        <span className={`font-mono text-sm font-bold ${medal.color}`}>
                          {medal.icon}
                        </span>
                        <span className={`flex-1 text-sm font-medium ${isMe ? "text-white" : "text-text-muted"}`}>
                          {p.name}
                          {isMe && (
                            <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-primary">
                              You
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-sm font-bold text-white">
                          {p.score}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </Card>
            </motion.div>
          )}

          {/* Waiting for next question */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-center"
          >
            <Loader variant="dots" label={result.isLast ? "Final results incoming..." : "Next question starting soon..."} />
          </motion.div>
        </div>
      </>
    );
  }

  /* ═══════════════════════════════════════════
     RENDER — FINAL LEADERBOARD
     ═══════════════════════════════════════════ */
  if (phase === PHASE.FINISHED) {
    return (
      <>
        <SpaceBackground />
        <div className="relative z-10 space-y-8 pb-16">
          <motion.section
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-warning">
              Final Results
            </p>
            <h1 className="mt-3 font-display text-5xl font-extrabold tracking-[-0.06em] text-white sm:text-6xl">
              Quiz Complete!
            </h1>
          </motion.section>

          {/* Top 3 podium */}
          {leaderboard.length >= 3 && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mx-auto flex max-w-lg items-end justify-center gap-3"
            >
              {/* 2nd place */}
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="flex w-28 flex-col items-center"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line/20 bg-white/5 text-lg font-bold text-text-muted">
                  {leaderboard[1].name.charAt(0).toUpperCase()}
                </div>
                <div className="mt-2 w-full rounded-t-2xl border border-line/15 bg-white/[0.03] px-3 pb-4 pt-6 text-center">
                  <p className="truncate text-sm font-medium text-white">{leaderboard[1].name}</p>
                  <p className="mt-1 font-mono text-lg font-bold text-text-muted">{leaderboard[1].score}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-text-dim">2nd</p>
                </div>
              </motion.div>

              {/* 1st place */}
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex w-32 flex-col items-center"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-warning/40 bg-warning/15 text-2xl font-bold text-warning shadow-orbit">
                  {leaderboard[0].name.charAt(0).toUpperCase()}
                </div>
                <div className="mt-2 w-full rounded-t-2xl border border-warning/20 bg-warning/5 px-3 pb-4 pt-8 text-center">
                  <p className="truncate text-sm font-bold text-white">{leaderboard[0].name}</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-warning">{leaderboard[0].score}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-warning">1st</p>
                </div>
              </motion.div>

              {/* 3rd place */}
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="flex w-28 flex-col items-center"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#cd7f32]/20 bg-[#cd7f32]/10 text-lg font-bold text-[#cd7f32]">
                  {leaderboard[2].name.charAt(0).toUpperCase()}
                </div>
                <div className="mt-2 w-full rounded-t-2xl border border-[#cd7f32]/15 bg-[#cd7f32]/5 px-3 pb-4 pt-5 text-center">
                  <p className="truncate text-sm font-medium text-white">{leaderboard[2].name}</p>
                  <p className="mt-1 font-mono text-lg font-bold text-[#cd7f32]">{leaderboard[2].score}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-text-dim">3rd</p>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Full leaderboard */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="mx-auto max-w-lg"
          >
            <Card variant="solid">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-secondary">
                Full Leaderboard
              </p>

              <div className="mt-5 space-y-2">
                {leaderboard.map((entry, i) => {
                  const medal = medalForRank(entry.rank);
                  const isMe = entry.name === playerName;

                  return (
                    <motion.div
                      key={entry.rank}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.8 + i * 0.06 }}
                      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${medal.bg} ${
                        isMe ? "ring-1 ring-primary/30" : ""
                      }`}
                    >
                      <span className={`font-mono text-sm font-bold ${medal.color}`}>
                        {medal.icon}
                      </span>
                      <span className={`flex-1 text-sm font-medium ${isMe ? "text-white" : "text-text-muted"}`}>
                        {entry.name}
                        {isMe && (
                          <span className="ml-2 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                            You
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-sm font-bold text-white">
                        {entry.score} pts
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="text-center"
          >
            <Button onClick={handleLeave}>Play Again</Button>
          </motion.div>
        </div>
      </>
    );
  }

  /* ═══════════════════════════════════════════
     RENDER — SESSION ENDED
     ═══════════════════════════════════════════ */
  if (phase === PHASE.ENDED) {
    return (
      <>
        <SpaceBackground />
        <div className="relative z-10 flex min-h-[70vh] items-center justify-center pb-16">
          <motion.div initial="hidden" animate="visible" variants={scaleIn} className="max-w-md">
            <Card variant="solid" className="text-center">
              <div className="py-8">
                <p className="font-display text-5xl font-extrabold text-text-dim">--</p>
                <h2 className="mt-4 font-display text-2xl font-bold text-white">
                  Session Ended
                </h2>
                <p className="mt-2 text-sm text-text-muted">
                  {errorMsg || "The host has ended this quiz session."}
                </p>
                <div className="mt-8">
                  <Button onClick={handleLeave}>Back to Join</Button>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </>
    );
  }

  /* ═══════════════════════════════════════════
     RENDER — FALLBACK
     ═══════════════════════════════════════════ */
  return (
    <>
      <SpaceBackground />
      <div className="relative z-10 flex min-h-[60vh] items-center justify-center">
        <Loader variant="orbit" size="lg" label="Loading..." />
      </div>
    </>
  );
}
