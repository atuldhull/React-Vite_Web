import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { io } from "socket.io-client";
import SpaceBackground from "@/components/backgrounds/SpaceBackground";
import Loader from "@/components/ui/Loader";
import { useAuthStore } from "@/store/auth-store";

import JoinScreen from "./liveQuiz/JoinScreen";
import LobbyScreen from "./liveQuiz/LobbyScreen";
import QuestionScreen from "./liveQuiz/QuestionScreen";
import ResultScreen from "./liveQuiz/ResultScreen";
import FinishedScreen from "./liveQuiz/FinishedScreen";
import EndedScreen from "./liveQuiz/EndedScreen";

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

  /* ═══════════════════════════════════════════
     RENDER — phase switch
     ═══════════════════════════════════════════ */

  if (phase === PHASE.JOIN || phase === PHASE.ERROR) {
    return (
      <JoinScreen
        code={code}
        setCode={setCode}
        playerName={playerName}
        setPlayerName={setPlayerName}
        joining={joining}
        phase={phase}
        errorMsg={errorMsg}
        onJoin={handleJoin}
      />
    );
  }

  if (phase === PHASE.LOBBY) {
    return (
      <LobbyScreen
        sessionCode={sessionCode}
        lobbyPlayers={lobbyPlayers}
        lobbyCount={lobbyCount}
        onLeave={handleLeave}
      />
    );
  }

  if (phase === PHASE.QUESTION && question) {
    return (
      <QuestionScreen
        question={question}
        selectedAnswer={selectedAnswer}
        answerSubmitted={answerSubmitted}
        timeLeft={timeLeft}
        timerPercent={timerPercent}
        timerColor={timerColor}
        onSubmitAnswer={handleSubmitAnswer}
      />
    );
  }

  if (phase === PHASE.RESULT && result) {
    return (
      <ResultScreen
        result={result}
        question={question}
        selectedAnswer={selectedAnswer}
        playerName={playerName}
      />
    );
  }

  if (phase === PHASE.FINISHED) {
    return (
      <FinishedScreen
        leaderboard={leaderboard}
        playerName={playerName}
        onLeave={handleLeave}
      />
    );
  }

  if (phase === PHASE.ENDED) {
    return (
      <EndedScreen
        errorMsg={errorMsg}
        onLeave={handleLeave}
      />
    );
  }

  /* ── fallback ── */
  return (
    <>
      <SpaceBackground />
      <div className="relative z-10 flex min-h-[60vh] items-center justify-center">
        <Loader variant="orbit" size="lg" label="Loading..." />
      </div>
    </>
  );
}
