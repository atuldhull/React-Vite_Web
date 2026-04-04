/**
 * AI CONTROLLER
 *
 * BUG FIXES:
 *  1. openrouter.js used process.env.OPENROUTER_URL (undefined) — now uses URL directly
 *  2. JSON parsing is now robust (strips markdown, finds first {...})
 *  3. Inserts into challenges using `solution` column (not theorem/method/hint)
 *  4. Validates all fields before inserting
 */

import axios   from "axios";
import supabase from "../config/supabase.js";

const TOPICS = [
  "Matrices and Linear Algebra", "Differential Calculus", "Integral Calculus",
  "Probability and Statistics", "Discrete Mathematics", "Graph Theory",
  "Boolean Algebra", "Differential Equations", "Laplace Transforms",
  "Fourier Series", "Numerical Methods", "Vector Calculus",
  "Electric Circuits", "Digital Electronics", "Control Systems",
  "Thermodynamics", "Fluid Mechanics", "Kinematics",
  "Eigenvalues and Eigenvectors", "Algorithms and Time Complexity",
];

/* ─────────────────────────────────────
   GENERATE AND STORE QUESTION
   Route: POST /api/ai/generate-question
───────────────────────────────────── */
export const generateAndStoreQuestion = async (req, res) => {
  const topic      = req.body?.topic || TOPICS[Math.floor(Math.random() * TOPICS.length)];
  const difficulty = req.body?.difficulty || "medium";

  try {
    // ── 1. Call OpenRouter AI ──
    const prompt = `Generate ONE engineering mathematics MCQ for BMSIT students.
Topic: ${topic}
Difficulty: ${difficulty}

Return ONLY this JSON (no markdown, no extra text):
{
  "title": "short title",
  "question": "full question text",
  "options": ["option A", "option B", "option C", "option D"],
  "correct_index": 0,
  "difficulty": "${difficulty}",
  "points": ${difficulty === "easy" ? 20 : difficulty === "hard" ? 100 : 50},
  "solution": "brief explanation of the correct answer"
}`;

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model:    "deepseek/deepseek-chat",
        messages: [
          { role: "system", content: "You output only valid JSON. No markdown. No explanation outside JSON." },
          { role: "user",   content: prompt },
        ],
        temperature: 0.3,
        max_tokens:  800,
      },
      {
        headers: {
          "Authorization":  `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type":   "application/json",
          "HTTP-Referer":   "https://mathcollective.bmsit.in",
          "X-Title":        "Math Collective",
        },
        timeout: 35000,
      }
    );

    let text = response.data?.choices?.[0]?.message?.content || "";
    console.log("[AI] Raw response:", text.slice(0, 300));

    // ── 2. Parse JSON robustly ──
    text = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const start = text.indexOf("{");
    const end   = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error("AI returned no JSON. Response: " + text.slice(0, 200));
    }
    const aiData = JSON.parse(text.slice(start, end + 1));

    // ── 3. Validate ──
    if (!aiData.title || !aiData.question) throw new Error("AI: missing title or question");
    if (!Array.isArray(aiData.options) || aiData.options.length !== 4) throw new Error("AI: options must be array of 4");
    if (aiData.correct_index < 0 || aiData.correct_index > 3) throw new Error("AI: correct_index out of range");

    // ── 4. Insert into Supabase ──
    const { data, error } = await supabase
      .from("challenges")
      .insert({
        title:         aiData.title,
        question:      aiData.question,
        options:       aiData.options,
        correct_index: Number(aiData.correct_index),
        difficulty:    (aiData.difficulty || difficulty).toLowerCase(),
        points:        Number(aiData.points) || 50,
        solution:      aiData.solution || null,   // ← uses `solution` column
        is_active:     true,
      })
      .select()
      .single();

    if (error) {
      console.error("[AI] DB insert error:", error.message);
      return res.status(500).json({ error: "DB insert failed: " + error.message, aiData });
    }

    console.log("[AI] Stored challenge:", data.id, data.title);

    return res.json({
      success:  true,
      message:  "Challenge generated and stored ✓",
      question: data,
    });

  } catch (err) {
    console.error("[AI] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

/* ─────────────────────────────────────
   GENERATE ONLY (no store) — for admin preview
   Route: GET /api/ai/preview?difficulty=medium&topic=X
───────────────────────────────────── */
export const previewQuestion = async (req, res) => {
  const topic      = req.query.topic || TOPICS[Math.floor(Math.random() * TOPICS.length)];
  const difficulty = req.query.difficulty || "medium";

  try {
    const prompt = `Generate ONE engineering mathematics MCQ.
Topic: ${topic}
Difficulty: ${difficulty}

Return ONLY this JSON:
{
  "title": "",
  "question": "",
  "options": ["", "", "", ""],
  "correct_index": 0,
  "difficulty": "${difficulty}",
  "points": ${difficulty === "easy" ? 20 : difficulty === "hard" ? 100 : 50},
  "solution": ""
}`;

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model:    "deepseek/deepseek-chat",
        messages: [
          { role: "system", content: "Output only valid JSON. No markdown." },
          { role: "user",   content: prompt },
        ],
        temperature: 0.4,
        max_tokens:  800,
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type":  "application/json",
        },
        timeout: 35000,
      }
    );

    let text = response.data?.choices?.[0]?.message?.content || "";
    text = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const start = text.indexOf("{");
    const end   = text.lastIndexOf("}");
    if (start === -1) throw new Error("No JSON in AI response");

    const aiData = JSON.parse(text.slice(start, end + 1));
    return res.json(aiData);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
