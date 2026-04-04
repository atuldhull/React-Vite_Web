/**
 * OpenRouter config — kept for backward compatibility
 * The main AI logic is now in controllers/aiController.js
 * which calls OpenRouter directly without this file.
 *
 * This file is only used if you import generateMathQuestion elsewhere.
 */

import axios from "axios";

export async function generateMathQuestion(difficulty = "medium") {
  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",  // ← FIXED: was process.env.OPENROUTER_URL (undefined)
    {
      model: "deepseek/deepseek-chat",
      messages: [
        {
          role: "system",
          content: "You generate engineering math MCQs. Output ONLY valid JSON, no markdown."
        },
        {
          role: "user",
          content: `Generate ONE engineering mathematics MCQ. Difficulty: ${difficulty}.
Return ONLY this JSON:
{
  "title": "",
  "question": "",
  "options": ["", "", "", ""],
  "correct_index": 0,
  "difficulty": "${difficulty}",
  "points": 50,
  "solution": ""
}`
        }
      ],
      temperature: 0.3,
      max_tokens: 600,
    },
    {
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type":  "application/json",
      },
      timeout: 30000,
    }
  );

  let text = response.data?.choices?.[0]?.message?.content || "";
  text = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start === -1) throw new Error("AI returned no JSON");

  return JSON.parse(text.slice(start, end + 1));
}
