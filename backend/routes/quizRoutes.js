import express  from "express";
import multer   from "multer";
import { requireTeacher, requireAuth } from "../middleware/authMiddleware.js";
import supabase  from "../config/supabase.js";
import { callLLM, listProviders } from "../lib/llm.js";

const router  = express.Router();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/* ══════════════════════════════════════════════
   GET challenges for quiz picker
   GET /api/quiz/challenges
══════════════════════════════════════════════ */
router.get("/challenges", requireTeacher, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("challenges")
      .select("id, title, question, options, correct_index, difficulty, points, solution")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

/* ══════════════════════════════════════════════
   BULK AI GENERATE — many questions at once
   POST /api/quiz/ai-generate-bulk
   Body: { topics: ["topic1","topic2",...], difficulty, count, saveToBank }
   - topics: array of topic strings (can be mixed)
   - count: total questions to generate (distributed across topics)
   - saveToBank: bool — also save to challenges table
══════════════════════════════════════════════ */
router.post("/ai-generate-bulk", requireTeacher, async (req, res) => {
  const { topics = [], difficulty = "medium", count = 5, saveToBank = false } = req.body;

  if (!topics.length) return res.status(400).json({ error: "At least one topic required" });
  if (count < 1 || count > 30) return res.status(400).json({ error: "count must be 1–30" });

  // At least one LLM provider must be configured. Previously this hard-
  // coded OPENROUTER_API_KEY; now we accept either Gemini or OpenRouter
  // and the helper picks whichever is available (Gemini first).
  const providers = listProviders().filter((p) => p.hasKey);
  if (providers.length === 0) {
    return res.status(500).json({ error: "AI not configured (set GEMINI_API_KEY or OPENROUTER_API_KEY)" });
  }

  // Distribute questions across topics (round-robin)
  const assignments = [];
  for (let i = 0; i < count; i++) {
    assignments.push(topics[i % topics.length]);
  }

  const results   = [];
  const errors    = [];

  // Generate in parallel batches of 5 to avoid rate limits
  const BATCH = 5;
  for (let b = 0; b < assignments.length; b += BATCH) {
    const batch = assignments.slice(b, b + BATCH);
    const promises = batch.map(topic => generateOne(topic, difficulty));
    const settled  = await Promise.allSettled(promises);
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") results.push(r.value);
      else errors.push({ topic: batch[i], error: r.reason?.message || "Failed" });
    });
  }

  // Save to challenges bank if requested
  let savedIds = [];
  if (saveToBank && results.length) {
    const rows = results.map(q => ({
      title:         q.title,
      question:      q.question,
      options:       q.options,
      correct_index: q.correct_index,
      difficulty:    q.difficulty || difficulty,
      points:        q.points || (difficulty === "easy" ? 20 : difficulty === "hard" ? 100 : 50),
      solution:      q.solution || null,
      is_active:     true,
    }));
    const { data: saved } = await supabase.from("challenges").insert(rows).select("id");
    savedIds = (saved || []).map(r => r.id);
    // Attach IDs to results
    results.forEach((q, i) => { q.id = savedIds[i] || null; });
  }

  return res.json({
    success:   true,
    generated: results.length,
    saved:     savedIds.length,
    questions: results,
    errors:    errors.length ? errors : undefined,
  });
});

/* helper — call LLM (Gemini primary, OpenRouter fallback) for one question */
async function generateOne(topic, difficulty) {
  // Normalize to lowercase so "Easy"/"Extreme" from the frontend land
  // on the right points tier. The three-branch pts ternary only knew
  // lowercase, so capitalized "Extreme" silently landed on 50 points.
  const raw = (difficulty || "medium").toString().toLowerCase();
  const ALLOWED = ["easy", "medium", "hard", "extreme"];
  const safeDifficulty = ALLOWED.includes(raw) ? raw : "medium";
  const pts = { easy: 20, medium: 50, hard: 100, extreme: 200 }[safeDifficulty];
  const prompt = `Generate ONE engineering mathematics MCQ for university students.
Topic: ${topic}
Difficulty: ${safeDifficulty}

Return ONLY this JSON (no markdown, no extra text):
{
  "title": "short descriptive title",
  "question": "full question text",
  "options": ["option A", "option B", "option C", "option D"],
  "correct_index": 0,
  "difficulty": "${safeDifficulty}",
  "points": ${pts},
  "solution": "brief explanation of the correct answer"
}`;

  // "oneshot" mode: helper picks the non-thinking Gemini variant so
  // the full max_tokens budget lands on the JSON, not on invisible
  // reasoning. Same 700 cap as before; bumped to 900 on extreme to
  // accommodate longer solutions.
  const { response } = await callLLM({
    messages: [
      { role: "system", content: "You output only valid JSON. No markdown. No explanation outside JSON." },
      { role: "user",   content: prompt },
    ],
    temperature: 0.4,
    maxTokens:  safeDifficulty === "extreme" ? 900 : 700,
    mode:       "oneshot",
    timeoutMs:  30000,
  });

  let text = response.data?.choices?.[0]?.message?.content || "";
  text = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start === -1) throw new Error("AI returned no JSON for topic: " + topic);

  const q = JSON.parse(text.slice(start, end + 1));
  if (!q.title || !q.question || !Array.isArray(q.options) || q.options.length < 2) {
    throw new Error("Incomplete AI response for topic: " + topic);
  }
  q.options = q.options.slice(0, 4); // cap at 4 options
  return q;
}

/* ══════════════════════════════════════════════
   CSV UPLOAD — parse and return questions
   POST /api/quiz/upload-csv
   multipart: field = "csv"
   
   Accepted CSV formats:
   Format A (full):  Title, Question, A, B, C, D, CorrectIndex(0-3), Difficulty, Points, Solution
   Format B (simple): Question, A, B, C, D, CorrectIndex(0-3)
   Format C (answer letter): Question, A, B, C, D, CorrectLetter(A/B/C/D)
   
   Header row is auto-detected and skipped.
   Returns { questions: [...], errors: [...], total }
══════════════════════════════════════════════ */
router.post("/upload-csv", requireTeacher, upload.single("csv"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const raw  = req.file.buffer.toString("utf-8").replace(/\r/g, "");
  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);

  if (lines.length < 2) return res.status(400).json({ error: "CSV must have at least 2 rows" });

  // Detect if first line is a header by checking if col[0] has no question-like content
  const firstLow = lines[0].toLowerCase();
  const isHeader = firstLow.includes("question") || firstLow.includes("title") ||
                   firstLow.includes("option") || firstLow.includes("correct") ||
                   firstLow.startsWith("q,") || firstLow.startsWith('"q"');
  const dataLines = isHeader ? lines.slice(1) : lines;

  const questions = [];
  const errors    = [];

  dataLines.forEach((line, idx) => {
    const rowNum = idx + (isHeader ? 2 : 1);
    try {
      const cols = parseCSVLine(line);
      if (cols.length < 6) {
        errors.push(`Row ${rowNum}: needs at least 6 columns (Question, A, B, C, D, CorrectIndex/Letter)`);
        return;
      }

      let title, question, rest, options, correct_index, difficulty, points, solution;

      // Detect format by column count
      if (cols.length >= 9) {
        // Format A: Title, Question, A, B, C, D, CorrectIndex, Difficulty, Points[, Solution]
        [title, question, ...rest] = cols;
        options       = rest.slice(0, 4);
        correct_index = parseCorrect(rest[4]);
        difficulty    = (rest[5] || "medium").toLowerCase().trim();
        points        = parseInt(rest[6]) || (difficulty === "easy" ? 20 : difficulty === "hard" ? 100 : 50);
        solution      = rest[7] || null;
      } else {
        // Format B/C: Question, A, B, C, D, CorrectIndex/Letter[, Difficulty]
        question      = cols[0];
        options       = cols.slice(1, 5);
        correct_index = parseCorrect(cols[5]);
        difficulty    = cols[6] ? cols[6].toLowerCase().trim() : "medium";
        points        = cols[7] ? parseInt(cols[7]) : (difficulty === "easy" ? 20 : difficulty === "hard" ? 100 : 50);
        solution      = cols[8] || null;
        // Auto-generate title from first 60 chars of question
        title = question.length > 60 ? question.slice(0, 57) + "..." : question;
      }

      // Validate
      if (!question) { errors.push(`Row ${rowNum}: Question text is empty`); return; }
      const validOpts = options.filter(o => o.trim());
      if (validOpts.length < 2) { errors.push(`Row ${rowNum}: Need at least 2 options`); return; }
      if (correct_index === -1 || correct_index >= validOpts.length) {
        errors.push(`Row ${rowNum}: CorrectIndex (${cols[5]}) out of range`); return;
      }

      questions.push({
        title:         title?.trim() || question.slice(0, 60),
        question:      question.trim(),
        options:       validOpts.map(o => o.trim()),
        correct_index,
        difficulty:    ["easy","medium","hard"].includes(difficulty) ? difficulty : "medium",
        points:        isNaN(points) ? 50 : Math.max(5, Math.min(500, points)),
        solution:      solution?.trim() || null,
      });
    } catch (e) {
      errors.push(`Row ${rowNum}: Parse error — ${e.message}`);
    }
  });

  // Optionally save to bank
  const saveToBank = req.query.save === "true";
  let savedIds = [];
  if (saveToBank && questions.length) {
    const rows = questions.map(q => ({ ...q, is_active: true }));
    const { data: saved } = await supabase.from("challenges").insert(rows).select("id");
    savedIds = (saved || []).map(r => r.id);
    questions.forEach((q, i) => { q.id = savedIds[i] || null; });
  }

  return res.json({
    success:   true,
    total:     questions.length,
    saved:     savedIds.length,
    questions,
    errors:    errors.length ? errors : undefined,
  });
});

/* ── CSV parsing helpers ── */
function parseCSVLine(line) {
  const cols = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i+1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      cols.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols.map(c => c.trim());
}

function parseCorrect(val) {
  if (!val) return -1;
  val = val.trim().toUpperCase();
  if (val === "A") return 0;
  if (val === "B") return 1;
  if (val === "C") return 2;
  if (val === "D") return 3;
  const n = parseInt(val);
  return isNaN(n) ? -1 : n;
}

/* ══════════════════════════════════════════════
   SCHEDULED TESTS — unchanged from original
══════════════════════════════════════════════ */
router.post("/scheduled", requireTeacher, async (req, res) => {
  try {
    const { title, description, challenge_ids, starts_at, ends_at } = req.body;
    const userId = req.session.user.id;
    if (!title || !challenge_ids?.length || !starts_at || !ends_at) {
      return res.status(400).json({ error: "title, challenge_ids, starts_at, ends_at required" });
    }
    const { data, error } = await supabase.from("scheduled_tests").insert({
      title, description, created_by: userId, challenge_ids, starts_at, ends_at,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ success: true, test: data });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

router.get("/scheduled", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("scheduled_tests").select("*").eq("is_active", true)
      .order("starts_at", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

router.get("/active", requireAuth, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("scheduled_tests").select("*").eq("is_active", true)
      .lte("starts_at", now).gte("ends_at", now);
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

router.get("/scheduled/:id", requireAuth, async (req, res) => {
  try {
    const { data: test, error } = await supabase
      .from("scheduled_tests").select("*").eq("id", req.params.id).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!test) return res.status(404).json({ error: "Test not found" });
    const { data: challenges } = await supabase
      .from("challenges")
      .select("id, title, question, options, correct_index, difficulty, points, solution")
      .in("id", test.challenge_ids || []);
    return res.json({ ...test, challenges: challenges || [] });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

router.post("/scheduled/:id/submit", requireAuth, async (req, res) => {
  try {
    const { answers } = req.body;
    const userId = req.session.user.id;
    const testId = req.params.id;
    const { data: test } = await supabase
      .from("scheduled_tests").select("*").eq("id", testId).maybeSingle();
    if (!test) return res.status(404).json({ error: "Test not found" });
    const now = new Date();
    if (now < new Date(test.starts_at)) return res.status(400).json({ error: "Test not started yet" });
    if (now > new Date(test.ends_at))   return res.status(400).json({ error: "Test has ended" });
    const { data: existing } = await supabase
      .from("test_attempts").select("id").eq("test_id", testId).eq("user_id", userId).maybeSingle();
    if (existing) return res.status(400).json({ error: "Already submitted" });
    const { data: challenges } = await supabase
      .from("challenges").select("id, correct_index, points").in("id", test.challenge_ids || []);
    let score = 0, maxScore = 0;
    for (const ch of challenges || []) {
      maxScore += ch.points || 50;
      if (answers[ch.id] !== undefined && Number(answers[ch.id]) === ch.correct_index) {
        score += ch.points || 50;
      }
    }
    const { error } = await supabase.from("test_attempts").insert({
      test_id: testId, user_id: userId, answers, score, max_score: maxScore,
      submitted: true, submitted_at: new Date().toISOString(),
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    const { data: student } = await supabase.from("students").select("xp, weekly_xp").eq("user_id", userId).maybeSingle();
    await supabase.from("students").update({
      xp:        (student?.xp || 0) + score,
      weekly_xp: (student?.weekly_xp || 0) + score,
    }).eq("user_id", userId);
    return res.json({ success: true, score, maxScore, percentage: Math.round((score / maxScore) * 100) });
  } catch {
    return res.status(500).json({ error: "Submission failed" });
  }
});

router.delete("/scheduled/:id", requireTeacher, async (req, res) => {
  try {
    const { error } = await supabase.from("scheduled_tests").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

export default router;