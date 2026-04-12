import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { quiz } from "@/lib/api";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import { useMonument } from "@/hooks/useMonument";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5 },
  }),
};

const DIFFICULTY_OPTIONS = ["Easy", "Medium", "Hard", "Extreme"];

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
    if (liveSelectedQs.length === 0) { setError("Select at least one challenge for the live quiz"); return; }
    const questions = challengePool
      .filter((c) => liveSelectedQs.includes(c.id))
      .map((c) => ({
        title: c.title,
        question: c.question,
        options: c.options || [],
        correct_index: c.correct_index ?? 0,
        timeLimit: c.difficulty?.toLowerCase() === "hard" ? 30 : c.difficulty?.toLowerCase() === "extreme" ? 45 : 20,
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
    return () => { if (socketRef.current) { socketRef.current.disconnect(); } };
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
      prev.includes(id)
        ? prev.filter((cid) => cid !== id)
        : [...prev, id],
    );
  }

  async function handleCreateTest() {
    if (!title.trim()) {
      setError("Test title is required");
      return;
    }
    if (selectedChallenges.length === 0) {
      setError("Select at least one challenge");
      return;
    }
    if (!startDate || !endDate) {
      setError("Start and end dates are required");
      return;
    }

    try {
      setCreatingTest(true);
      setError(null);
      setSuccess(null);
      await quiz.createTest({
        title,
        description,
        challenges: selectedChallenges,
        startDate,
        endDate,
      });
      setSuccess("Scheduled test created successfully!");
      setTitle("");
      setDescription("");
      setSelectedChallenges([]);
      setStartDate("");
      setEndDate("");
      // Refresh tests list
      const res = await quiz.listTests();
      setTests(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create test");
    } finally {
      setCreatingTest(false);
    }
  }

  async function handleAiBulk() {
    if (!aiTopics.trim()) {
      setError("Enter at least one topic");
      return;
    }

    try {
      setAiGenerating(true);
      setError(null);
      setAiResult(null);
      const res = await quiz.aiBulk({
        topics: aiTopics,
        count: aiCount,
        difficulty: aiDifficulty,
      });
      setAiResult(res.data);
      setSuccess(`Generated ${res.data?.questions?.length || res.data?.length || aiCount} questions`);
      // Refresh challenge pool
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

      {/* ═══════════ LIVE QUIZ HOST SECTION ═══════════ */}
      <Card variant="glow">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/15 text-base">⚡</span>
            <div>
              <p className="font-display text-lg font-bold text-white">Host Live Quiz</p>
              <p className="text-xs text-text-dim">Real-time quiz — students join with a code</p>
            </div>
          </div>
          {!liveActive && liveSelectedQs.length > 0 && (
            <span className="rounded-full bg-primary/15 px-3 py-1 font-mono text-[10px] text-primary">
              {liveSelectedQs.length} questions ready
            </span>
          )}
        </div>

        {!liveActive ? (
          <div className="mt-5 space-y-5">
            {/* Teacher name */}
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-dim">Your Name</label>
              <input type="text" value={teacherName} onChange={(e) => setTeacherName(e.target.value)}
                className="w-60 rounded-lg border border-line/15 bg-black/15 px-3 py-2 text-sm text-white outline-none focus:border-primary/30" />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {/* Left: Select from existing questions */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                    Pick from Question Bank ({liveSelectedQs.length} selected)
                  </label>
                  {liveSelectedQs.length > 0 && (
                    <button onClick={() => setLiveSelectedQs([])} className="font-mono text-[9px] text-danger hover:underline">Clear all</button>
                  )}
                </div>
                <div className="max-h-[360px] space-y-1 overflow-y-auto rounded-xl border border-line/10 bg-black/10 p-2.5">
                  {poolLoading ? (
                    <p className="py-6 text-center text-xs text-text-dim">Loading challenges...</p>
                  ) : (challengePool || []).length === 0 ? (
                    <p className="py-6 text-center text-xs text-text-dim">No challenges in bank. Use AI to generate some →</p>
                  ) : (
                    (challengePool || []).map((c) => (
                      <label key={c.id} className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition ${
                        liveSelectedQs.includes(c.id) ? "bg-primary/10 border border-primary/20" : "hover:bg-white/[0.03] border border-transparent"
                      }`}>
                        <input type="checkbox" checked={liveSelectedQs.includes(c.id)}
                          onChange={() => setLiveSelectedQs((prev) => prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id])}
                          className="accent-primary" />
                        <span className="flex-1 text-xs text-white">{c.title}</span>
                        <span className={`font-mono text-[9px] ${
                          (c.difficulty || "").toLowerCase() === "hard" ? "text-danger" :
                          (c.difficulty || "").toLowerCase() === "extreme" ? "text-glow" :
                          (c.difficulty || "").toLowerCase() === "easy" ? "text-success" : "text-warning"
                        }`}>{c.difficulty}</span>
                        <span className="font-mono text-[9px] text-text-dim">{c.points}pts</span>
                      </label>
                    ))
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setLiveSelectedQs((challengePool || []).map((c) => c.id))}
                    className="font-mono text-[9px] text-primary hover:underline">Select all</button>
                </div>
              </div>

              {/* Right: AI Generate questions */}
              <div>
                <label className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-text-dim">
                  Or Generate with AI 🐼
                </label>
                <div className="rounded-xl border border-primary/15 bg-primary/5 p-4 space-y-3">
                  <div>
                    <label className="mb-1 block text-[10px] text-text-dim">Topics (comma separated)</label>
                    <input type="text" value={aiTopics} onChange={(e) => setAiTopics(e.target.value)}
                      placeholder="Calculus, Number Theory, Probability"
                      className="w-full rounded-lg border border-line/15 bg-black/15 px-3 py-2 text-xs text-white outline-none focus:border-primary/30" />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-[10px] text-text-dim">Count</label>
                      <input type="number" min="1" max="20" value={aiCount} onChange={(e) => setAiCount(Number(e.target.value))}
                        className="w-full rounded-lg border border-line/15 bg-black/15 px-3 py-2 text-xs text-white outline-none focus:border-primary/30" />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-[10px] text-text-dim">Difficulty</label>
                      <select value={aiDifficulty} onChange={(e) => setAiDifficulty(e.target.value)}
                        className="w-full rounded-lg border border-line/15 bg-black/15 px-3 py-2 text-xs text-white outline-none">
                        {DIFFICULTY_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                  <Button size="sm" loading={aiGenerating} onClick={async () => {
                    if (!aiTopics.trim()) { setError("Enter at least one topic"); return; }
                    setAiGenerating(true);
                    setAiResult(null);
                    try {
                      const { data } = await quiz.aiBulk({
                        topics: aiTopics.split(",").map((t) => t.trim()).filter(Boolean),
                        count: aiCount,
                        difficulty: aiDifficulty,
                        saveToBank: false,
                      });
                      // Mark all as selected for review by default
                      const qs = (data.questions || []).map((q, i) => ({ ...q, _selected: true, _idx: i }));
                      setAiResult({ ...data, questions: qs });
                      setSuccess(`Generated ${data.generated || qs.length} questions — review below and save the ones you like`);
                    } catch (err) {
                      setError(err.response?.data?.error || "AI generation failed");
                    }
                    setAiGenerating(false);
                  }}>
                    Generate {aiCount} Questions
                  </Button>

                  {/* AI result: full preview with accept/reject per question */}
                  {aiResult && aiResult.questions && aiResult.questions.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-[10px] text-success">
                          {aiResult.questions.length} generated — pick the ones you want to save
                        </p>
                        <div className="flex gap-2">
                          <button onClick={() => setAiResult({ ...aiResult, questions: aiResult.questions.map((q) => ({ ...q, _selected: true })) })}
                            className="font-mono text-[9px] text-primary hover:underline">Select all</button>
                          <button onClick={() => setAiResult({ ...aiResult, questions: aiResult.questions.map((q) => ({ ...q, _selected: false })) })}
                            className="font-mono text-[9px] text-text-dim hover:underline">Deselect all</button>
                        </div>
                      </div>

                      <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
                        {aiResult.questions.map((q, i) => (
                          <div key={i} className={`rounded-xl border p-3 transition ${
                            q._selected ? "border-primary/25 bg-primary/5" : "border-line/10 bg-black/10 opacity-60"
                          }`}>
                            <div className="flex items-start gap-2">
                              <input type="checkbox" checked={q._selected}
                                onChange={() => {
                                  const updated = [...aiResult.questions];
                                  updated[i] = { ...updated[i], _selected: !updated[i]._selected };
                                  setAiResult({ ...aiResult, questions: updated });
                                }}
                                className="mt-1 accent-primary" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-white">{q.title}</p>
                                <p className="mt-1 text-[11px] text-text-muted line-clamp-2">{q.question}</p>
                                {q.options && (
                                  <div className="mt-2 grid grid-cols-2 gap-1">
                                    {q.options.map((opt, oi) => (
                                      <div key={oi} className={`rounded px-2 py-1 text-[10px] ${
                                        oi === q.correct_index ? "bg-success/10 text-success font-medium" : "bg-white/[0.02] text-text-dim"
                                      }`}>
                                        {String.fromCharCode(65 + oi)}. {opt}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {q.solution && (
                                  <p className="mt-1.5 text-[10px] italic text-text-dim">Solution: {q.solution}</p>
                                )}
                                <div className="mt-1 flex gap-2 font-mono text-[9px] text-text-dim">
                                  <span>{q.difficulty || aiDifficulty}</span>
                                  <span>{q.points || 50} pts</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Save selected to bank */}
                      <Button size="sm" onClick={async () => {
                        const toSave = aiResult.questions.filter((q) => q._selected);
                        if (toSave.length === 0) { setError("Select at least one question to save"); return; }
                        setAiGenerating(true);
                        let saved = 0;
                        for (const q of toSave) {
                          try {
                            await (await import("@/lib/api")).challenges.create({
                              title: q.title,
                              question: q.question,
                              options: q.options,
                              correct_index: q.correct_index ?? 0,
                              difficulty: (q.difficulty || aiDifficulty).toLowerCase(),
                              points: q.points || 50,
                              solution: q.solution || "",
                            });
                            saved++;
                          } catch { /* skip failed */ }
                        }
                        setSuccess(`Saved ${saved}/${toSave.length} questions to bank`);
                        setAiResult(null);
                        // Refresh pool
                        const poolRes = await quiz.challenges();
                        setChallengePool(poolRes.data || []);
                        setAiGenerating(false);
                      }} loading={aiGenerating}>
                        Save {aiResult.questions.filter((q) => q._selected).length} Selected to Bank
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Button onClick={startLiveQuiz} disabled={liveSelectedQs.length === 0} size="lg" className="w-full justify-center">
              Start Live Quiz ({liveSelectedQs.length} questions)
            </Button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {/* Session info */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="rounded-xl border border-success/30 bg-success/10 px-5 py-3 text-center">
                <p className="font-mono text-[10px] text-success">QUIZ CODE</p>
                <p className="math-text" style={{ fontSize: "3rem", letterSpacing: "0.5em", color: "var(--monument-city)" }}>{liveCode}</p>
                <p className="mt-0.5 text-[10px] text-text-dim">Share this with students</p>
              </div>
              <div>
                <p className="text-sm text-white">{livePlayers.length} player{livePlayers.length !== 1 ? "s" : ""} joined</p>
                <p className="font-mono text-[10px] text-text-dim">
                  Status: <span className="text-success">{liveStatus}</span>
                  {liveStatus === "question" && ` · Q${liveQuestionNum}/${liveTotalQ}`}
                </p>
                {liveStatus === "question" && (
                  <p className="mt-1 font-mono text-[10px] text-secondary">
                    {liveAnswered.answered}/{liveAnswered.total} answered
                  </p>
                )}
              </div>
            </div>

            {/* Players */}
            {livePlayers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {livePlayers.map((p, i) => (
                  <span key={i} className="rounded-full border border-line/15 bg-white/5 px-3 py-1 font-mono text-[10px] text-text-muted">
                    {p.name} <span className="text-primary">{p.score || 0}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Podium (after results) */}
            {(liveStatus === "results" || liveStatus === "finished") && livePodium.length > 0 && (
              <div className="rounded-xl border border-line/10 bg-black/10 p-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-warning">
                  {liveStatus === "finished" ? "Final Leaderboard" : "Current Standings"}
                </p>
                {livePodium.map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-1">
                    <span className="text-xs text-white">#{p.rank} {p.name}</span>
                    <span className="font-mono text-xs text-primary">{p.score}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Controls */}
            <div className="flex flex-wrap gap-3">
              {liveStatus === "lobby" && (
                <Button size="sm" onClick={nextQuestion} disabled={livePlayers.length === 0}>
                  Start First Question
                </Button>
              )}
              {liveStatus === "question" && (
                <Button size="sm" variant="secondary" onClick={revealAnswer}>
                  Reveal Answer Now
                </Button>
              )}
              {liveStatus === "results" && liveQuestionNum < liveTotalQ && (
                <Button size="sm" onClick={nextQuestion}>
                  Next Question ({liveQuestionNum + 1}/{liveTotalQ})
                </Button>
              )}
              <Button size="sm" variant="danger" onClick={endLiveQuiz}>
                End Quiz
              </Button>
            </div>
          </div>
        )}
      </Card>

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
              <button onClick={() => setError(null)} className="ml-4 text-danger/60 hover:text-danger">
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
              <button onClick={() => setSuccess(null)} className="ml-4 text-success/60 hover:text-success">
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
        <motion.div custom={0} variants={fadeUp}>
          <Card variant="glass">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">
              Schedule
            </p>
            <h3 className="mt-2 font-display text-xl font-bold text-white">
              Create Scheduled Test
            </h3>

            <div className="mt-5 space-y-4">
              {/* Title */}
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-dim">
                  Test Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Weekly Challenge Set #5"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-line/15 bg-surface/50 px-4 py-3 text-sm text-white placeholder-text-dim backdrop-blur outline-none transition focus:border-primary/30"
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-dim">
                  Description
                </label>
                <textarea
                  placeholder="Brief description of the test..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-xl border border-line/15 bg-surface/50 px-4 py-3 text-sm text-white placeholder-text-dim backdrop-blur outline-none transition focus:border-primary/30"
                />
              </div>

              {/* Date range */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-dim">
                    Start Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl border border-line/15 bg-surface/50 px-4 py-3 text-sm text-white backdrop-blur outline-none transition focus:border-primary/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-dim">
                    End Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-xl border border-line/15 bg-surface/50 px-4 py-3 text-sm text-white backdrop-blur outline-none transition focus:border-primary/30"
                  />
                </div>
              </div>

              {/* Challenge selection */}
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-dim">
                  Select Challenges ({selectedChallenges.length} selected)
                </label>
                <input
                  type="text"
                  placeholder="Search challenges..."
                  value={challengeSearch}
                  onChange={(e) => setChallengeSearch(e.target.value)}
                  className="mb-3 w-full rounded-xl border border-line/15 bg-surface/50 px-4 py-2.5 text-sm text-white placeholder-text-dim backdrop-blur outline-none transition focus:border-primary/30"
                />

                {poolLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="h-12 animate-pulse rounded-xl border border-line/10 bg-surface/30"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                    {filteredPool.length === 0 ? (
                      <p className="py-4 text-center text-sm text-text-dim">
                        {challengeSearch ? "No challenges match" : "No challenges available"}
                      </p>
                    ) : (
                      filteredPool.map((c) => {
                        const isSelected = selectedChallenges.includes(c._id);
                        return (
                          <button
                            key={c._id}
                            onClick={() => toggleChallenge(c._id)}
                            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition ${
                              isSelected
                                ? "border-primary/30 bg-primary/12 text-white"
                                : "border-line/10 bg-black/10 text-text-muted hover:border-line/20 hover:text-white"
                            }`}
                          >
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs ${
                                isSelected
                                  ? "border-primary bg-primary text-white"
                                  : "border-line/20 bg-transparent"
                              }`}
                            >
                              {isSelected && (
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>
                            <div className="flex-1">
                              <p className="text-sm">{c.title}</p>
                              <p className="font-mono text-[10px] text-text-dim">
                                {c.difficulty || "—"} &middot; {c.points ?? 0} pts
                              </p>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <Button
                onClick={handleCreateTest}
                loading={creatingTest}
                disabled={!title.trim() || selectedChallenges.length === 0}
                size="sm"
              >
                Create Test
              </Button>
            </div>
          </Card>
        </motion.div>

        {/* AI Bulk Generation */}
        <motion.div custom={1} variants={fadeUp}>
          <Card variant="glass">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-secondary">
              AI Powered
            </p>
            <h3 className="mt-2 font-display text-xl font-bold text-white">
              Bulk Question Generator
            </h3>

            <div className="mt-5 space-y-4">
              {/* Topics */}
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-dim">
                  Topics (comma-separated)
                </label>
                <textarea
                  placeholder="e.g. Algebra, Geometry, Probability, Number Theory"
                  value={aiTopics}
                  onChange={(e) => setAiTopics(e.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-xl border border-line/15 bg-surface/50 px-4 py-3 text-sm text-white placeholder-text-dim backdrop-blur outline-none transition focus:border-primary/30"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Count */}
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-dim">
                    Number of Questions
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={aiCount}
                    onChange={(e) => setAiCount(Math.max(1, Math.min(50, Number(e.target.value))))}
                    className="w-full rounded-xl border border-line/15 bg-surface/50 px-4 py-3 text-sm text-white backdrop-blur outline-none transition focus:border-primary/30"
                  />
                </div>

                {/* Difficulty */}
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-dim">
                    Difficulty
                  </label>
                  <select
                    value={aiDifficulty}
                    onChange={(e) => setAiDifficulty(e.target.value)}
                    className="w-full rounded-xl border border-line/15 bg-surface/50 px-4 py-3 text-sm text-white backdrop-blur outline-none transition focus:border-primary/30"
                  >
                    {DIFFICULTY_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Button
                onClick={handleAiBulk}
                loading={aiGenerating}
                disabled={!aiTopics.trim()}
                size="sm"
                variant="secondary"
              >
                {aiGenerating ? "Generating..." : "Generate Questions"}
              </Button>

              {/* AI result preview */}
              <AnimatePresence>
                {aiResult && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-4">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-secondary">
                        Generated{" "}
                        {aiResult.questions?.length ||
                          aiResult.length ||
                          0}{" "}
                        questions
                      </p>
                      <div className="mt-3 max-h-60 space-y-2 overflow-y-auto pr-1">
                        {(aiResult.questions || aiResult || []).slice(0, 10).map((q, i) => (
                          <div
                            key={i}
                            className="rounded-lg border border-line/10 bg-black/10 px-3 py-2"
                          >
                            <p className="text-sm text-white">
                              {i + 1}. {q.title || q.question || q.text}
                            </p>
                            <p className="mt-1 font-mono text-[10px] text-text-dim">
                              {q.difficulty || aiDifficulty} &middot; {q.topic || "General"}
                            </p>
                          </div>
                        ))}
                        {(aiResult.questions?.length || aiResult.length || 0) > 10 && (
                          <p className="py-2 text-center text-xs text-text-dim">
                            ...and {(aiResult.questions?.length || aiResult.length) - 10} more
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Existing tests */}
      <motion.div custom={2} variants={fadeUp}>
        <Card variant="solid">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warning">
            Scheduled
          </p>
          <h3 className="mt-2 font-display text-xl font-bold text-white">
            Existing Tests
          </h3>

          {testsLoading ? (
            <div className="mt-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-xl border border-line/10 bg-surface/30"
                />
              ))}
            </div>
          ) : tests.length === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-2 py-8 text-center">
              <svg className="h-8 w-8 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-text-dim">No scheduled tests yet</p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {tests.map((test) => {
                const isActive =
                  new Date(test.startDate) <= new Date() &&
                  new Date(test.endDate) >= new Date();
                const isPast = new Date(test.endDate) < new Date();

                return (
                  <div
                    key={test._id}
                    className="flex items-center justify-between rounded-xl border border-line/10 bg-black/10 px-4 py-3"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">
                          {test.title || "Untitled Test"}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase ${
                            isActive
                              ? "bg-success/10 text-success"
                              : isPast
                                ? "bg-text-dim/10 text-text-dim"
                                : "bg-warning/10 text-warning"
                          }`}
                        >
                          {isActive ? "Live" : isPast ? "Ended" : "Upcoming"}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] text-text-dim">
                        {test.challenges?.length || 0} challenges &middot;{" "}
                        {test.startDate
                          ? new Date(test.startDate).toLocaleString()
                          : "—"}{" "}
                        &rarr;{" "}
                        {test.endDate
                          ? new Date(test.endDate).toLocaleString()
                          : "—"}
                      </p>
                      {test.description && (
                        <p className="mt-1 text-xs text-text-muted line-clamp-1">
                          {test.description}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleDeleteTest(test._id)}
                      loading={deletingId === test._id}
                    >
                      Delete
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </motion.div>
    </motion.div>
    </div>
  );
}
