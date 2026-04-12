import axios   from "axios";
import supabase from "../../config/supabase.js";

/* ═══════════════════════════════════════════
   AI QUESTION — Generate preview (admin)
   GET /api/admin/generate
═══════════════════════════════════════════ */
export const generateAIQuestion = async (req, res) => {
  try {
    const TOPICS = [
      "Matrices and Linear Algebra","Eigenvalues and Eigenvectors","Differential Calculus",
      "Integral Calculus","Probability and Statistics","Discrete Mathematics","Graph Theory",
      "Boolean Algebra","Differential Equations","Laplace Transforms","Fourier Series",
      "Numerical Methods","Vector Calculus","Electric Circuits","Digital Electronics",
      "Control Systems","Thermodynamics","Fluid Mechanics","Kinematics",
      "Algorithms and Time Complexity","Cryptography Basics","Optimization Techniques",
    ];
    const topic      = req.query.topic || TOPICS[Math.floor(Math.random() * TOPICS.length)];
    const difficulty = req.query.difficulty || "medium";

    const prompt = `Generate ONE engineering mathematics MCQ for BMSIT students.
Topic: ${topic}
Difficulty: ${difficulty}

Return ONLY this JSON (no markdown):
{
  "title": "short descriptive title",
  "question": "full question text",
  "options": ["option A", "option B", "option C", "option D"],
  "correct_index": 0,
  "difficulty": "${difficulty}",
  "points": ${difficulty === "easy" ? 20 : difficulty === "hard" ? 100 : 50},
  "solution": "step-by-step explanation of the correct answer"
}`;

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model:    "deepseek/deepseek-chat",
        messages: [
          { role: "system", content: "Output only valid JSON. No markdown. No extra text." },
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
    if (start === -1 || end === -1) throw new Error("No JSON in AI response");

    const question = JSON.parse(text.slice(start, end + 1));
    if (!question.title || !question.question || !Array.isArray(question.options)) {
      throw new Error("AI returned incomplete question");
    }

    return res.json(question);
  } catch (err) {
    console.error("[AdminAI] Error:", err.message);
    return res.status(500).json({ error: "AI generation failed: " + err.message });
  }
};

/* ═══════════════════════════════════════════
   AI QUESTION — Save to DB
   POST /api/admin/save
═══════════════════════════════════════════ */
export const saveAIQuestion = async (req, res) => {
  try {
    const q = req.body;

    if (!q.title || !q.question || !Array.isArray(q.options) || q.options.length !== 4) {
      return res.status(400).json({ error: "Invalid question format" });
    }

    // Shuffle to avoid correct answer always being first
    const correctAnswer = q.options[q.correct_index];
    const shuffled      = [...q.options].sort(() => Math.random() - 0.5);

    const { data, error } = await supabase
      .from("challenges")
      .insert({
        title:         q.title,
        question:      q.question,
        options:       shuffled,
        correct_index: shuffled.indexOf(correctAnswer),
        difficulty:    (q.difficulty || "medium").toLowerCase(),
        points:        Number(q.points) || 50,
        solution:      q.solution || null,      // ← uses `solution` column
        is_active:     true,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ success: true, challenge: data });
  } catch {
    return res.status(500).json({ error: "Failed to save question" });
  }
};
