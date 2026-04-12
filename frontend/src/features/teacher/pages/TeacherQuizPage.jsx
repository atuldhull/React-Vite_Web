import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import { quiz } from "@/lib/api";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import { useMonument } from "@/hooks/useMonument";

import LiveQuizHost from "./teacherQuiz/LiveQuizHost";
import TestCreator from "./teacherQuiz/TestCreator";
import AIGenerator from "./teacherQuiz/AIGenerator";
import TestsList from "./teacherQuiz/TestsList";

export default function TeacherQuizPage() {
  useMonument("magma");

  // Challenge pool for selection
  const [challengePool, setChallengePool] = useState([]);
  const [poolLoading, setPoolLoading] = useState(true);

  // Scheduled test form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedChallenges, setSelectedChallenges] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [creatingTest, setCreatingTest] = useState(false);
  const [challengeSearch, setChallengeSearch] = useState("");

  // AI bulk generation
  const [aiTopics, setAiTopics] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const [aiDifficulty, setAiDifficulty] = useState("Medium");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  // Tests list
  const [tests, setTests] = useState([]);
  const [testsLoading, setTestsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // ── LIVE QUIZ HOST ──
  const socketRef = useRef(null);
  const [liveActive, setLiveActive] = useState(false);
  const [liveCode, setLiveCode] = useState("");
  const [livePlayers, setLivePlayers] = useState([]);
  const [liveStatus, setLiveStatus] = useState("idle"); // idle | lobby | question | results | finished
  const [liveQuestionNum, setLiveQuestionNum] = useState(0);
  const [liveTotalQ, setLiveTotalQ] = useState(0);
  const [liveAnswered, setLiveAnswered] = useState({ answered: 0, total: 0 });
  const [livePodium, setLivePodium] = useState([]);
  const [liveSelectedQs, setLiveSelectedQs] = useState([]);
  const [teacherName, setTeacherName] = useState("Teacher");

  const startLiveQuiz = useCallback(() => {
    if (liveSelectedQs.length === 0) {
      setError("Select at least one challenge for the live quiz");
      return;
    }
    const questions = challengePool
      .filter((c) => liveSelectedQs.includes(c.id))
      .map((c) => ({
        title: c.title,
        question: c.question,
        options: c.options || [],
        correct_index: c.correct_index ?? 0,
        timeLimit:
          c.difficulty?.toLowerCase() === "hard"
            ? 30
            : c.difficulty?.toLowerCase() === "extreme"
              ? 45
              : 20,
        points: c.points || 50,
        solution: c.solution || null,
      }));

    const sock = io(window.location.origin, { transports: ["websocket", "polling"] });
    socketRef.current = sock;

    sock.emit("create_session", { teacherName, questions });

    sock.on("session_created", ({ code }) => {
      setLiveCode(code);
      setLiveActive(true);
      setLiveStatus("lobby");
      setLiveTotalQ(questions.length);
      setSuccess(`Live quiz created! Code: ${code}`);
    });

    sock.on("player_joined", ({ players }) => {
      setLivePlayers(players || []);
    });

    sock.on("answer_update", ({ answered, total }) => {
      setLiveAnswered({ answered, total });
    });

    sock.on("question_result", ({ podium, isLast: _isLast }) => {
      setLivePodium(podium || []);
      setLiveStatus("results");
    });

    sock.on("quiz_finished", ({ leaderboard }) => {
      setLivePodium(leaderboard || []);
      setLiveStatus("finished");
    });
  }, [liveSelectedQs, challengePool, teacherName]);

  const nextQuestion = () => {
    if (!socketRef.current || !liveCode) return;
    socketRef.current.emit("next_question", { code: liveCode });
    setLiveQuestionNum((n) => n + 1);
    setLiveStatus("question");
    setLiveAnswered({ answered: 0, total: livePlayers.length });
  };

  const revealAnswer = () => {
    if (!socketRef.current || !liveCode) return;
    socketRef.current.emit("reveal_answer", { code: liveCode });
  };

  const endLiveQuiz = () => {
    if (!socketRef.current || !liveCode) return;
    socketRef.current.emit("end_session", { code: liveCode });
    socketRef.current.disconnect();
    socketRef.current = null;
    setLiveActive(false);
    setLiveCode("");
    setLiveStatus("idle");
    setLivePlayers([]);
    setLivePodium([]);
    setLiveQuestionNum(0);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    try {
      const [poolRes, testsRes] = await Promise.all([
        quiz.challenges(),
        quiz.listTests(),
      ]);
      setChallengePool(poolRes.data);
      setTests(testsRes.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load quiz data");
    } finally {
      setPoolLoading(false);
      setTestsLoading(false);
    }
  }

  function toggleChallenge(id) {
    setSelectedChallenges((prev) =>
      prev.includes(id) ? prev.filter((cid) => cid !== id) : [...prev, id],
    );
  }

  async function handleCreateTest() {
    if (!title.trim()) { setError("Test title is required"); return; }
    if (selectedChallenges.length === 0) { setError("Select at least one challenge"); return; }
    if (!startDate || !endDate) { setError("Start and end dates are required"); return; }

    try {
      setCreatingTest(true);
      setError(null);
      setSuccess(null);
      await quiz.createTest({ title, description, challenges: selectedChallenges, startDate, endDate });
      setSuccess("Scheduled test created successfully!");
      setTitle("");
      setDescription("");
      setSelectedChallenges([]);
      setStartDate("");
      setEndDate("");
      const res = await quiz.listTests();
      setTests(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create test");
    } finally {
      setCreatingTest(false);
    }
  }

  async function handleAiBulk() {
    if (!aiTopics.trim()) { setError("Enter at least one topic"); return; }

    try {
      setAiGenerating(true);
      setError(null);
      setAiResult(null);
      const res = await quiz.aiBulk({ topics: aiTopics, count: aiCount, difficulty: aiDifficulty });
      setAiResult(res.data);
      setSuccess(`Generated ${res.data?.questions?.length || res.data?.length || aiCount} questions`);
      const poolRes = await quiz.challenges();
      setChallengePool(poolRes.data);
    } catch (err) {
      setError(err.response?.data?.message || "AI bulk generation failed");
    } finally {
      setAiGenerating(false);
    }
  }

  async function handleDeleteTest(id) {
    try {
      setDeletingId(id);
      await quiz.deleteTest(id);
      setTests((prev) => prev.filter((t) => t._id !== id));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete test");
    } finally {
      setDeletingId(null);
    }
  }

  const filteredPool = challengePool.filter((c) =>
    (c.title || "").toLowerCase().includes(challengeSearch.toLowerCase()),
  );

  return (
    <div style={{ position: "relative" }}>
      <MonumentBackground monument="magma" intensity={0.1} />
      <motion.div initial="hidden" animate="visible" className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="font-display text-2xl font-bold text-white">Quiz Manager</h2>
          <p className="text-sm text-text-muted">Host live quizzes and create scheduled tests</p>
        </div>

        {/* Live Quiz Host */}
        <LiveQuizHost
          liveActive={liveActive}
          liveCode={liveCode}
          livePlayers={livePlayers}
          liveStatus={liveStatus}
          liveQuestionNum={liveQuestionNum}
          liveTotalQ={liveTotalQ}
          liveAnswered={liveAnswered}
          livePodium={livePodium}
          liveSelectedQs={liveSelectedQs}
          setLiveSelectedQs={setLiveSelectedQs}
          teacherName={teacherName}
          setTeacherName={setTeacherName}
          challengePool={challengePool}
          poolLoading={poolLoading}
          aiTopics={aiTopics}
          setAiTopics={setAiTopics}
          aiCount={aiCount}
          setAiCount={setAiCount}
          aiDifficulty={aiDifficulty}
          setAiDifficulty={setAiDifficulty}
          aiGenerating={aiGenerating}
          setAiGenerating={setAiGenerating}
          aiResult={aiResult}
          setAiResult={setAiResult}
          setChallengePool={setChallengePool}
          setError={setError}
          setSuccess={setSuccess}
          startLiveQuiz={startLiveQuiz}
          nextQuestion={nextQuestion}
          revealAnswer={revealAnswer}
          endLiveQuiz={endLiveQuiz}
        />

        {/* Alerts */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger"
            >
              <div className="flex items-center justify-between">
                {error}
                <button
                  onClick={() => setError(null)}
                  className="ml-4 text-danger/60 hover:text-danger"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </motion.div>
          )}
          {success && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success"
            >
              <div className="flex items-center justify-between">
                {success}
                <button
                  onClick={() => setSuccess(null)}
                  className="ml-4 text-success/60 hover:text-success"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid gap-6 xl:grid-cols-2">
          {/* Create scheduled test */}
          <TestCreator
            title={title}
            setTitle={setTitle}
            description={description}
            setDescription={setDescription}
            selectedChallenges={selectedChallenges}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            creatingTest={creatingTest}
            challengeSearch={challengeSearch}
            setChallengeSearch={setChallengeSearch}
            filteredPool={filteredPool}
            poolLoading={poolLoading}
            toggleChallenge={toggleChallenge}
            handleCreateTest={handleCreateTest}
          />

          {/* AI Bulk Generation */}
          <AIGenerator
            aiTopics={aiTopics}
            setAiTopics={setAiTopics}
            aiCount={aiCount}
            setAiCount={setAiCount}
            aiDifficulty={aiDifficulty}
            setAiDifficulty={setAiDifficulty}
            aiGenerating={aiGenerating}
            aiResult={aiResult}
            handleAiBulk={handleAiBulk}
          />
        </div>

        {/* Existing tests */}
        <TestsList
          tests={tests}
          testsLoading={testsLoading}
          deletingId={deletingId}
          handleDeleteTest={handleDeleteTest}
        />
      </motion.div>
    </div>
  );
}
