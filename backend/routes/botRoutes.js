import express from "express";
import axios   from "axios";
import { requireAuth } from "../middleware/authMiddleware.js";
import { aiLimiter } from "../middleware/rateLimiter.js";
import { logger } from "../config/logger.js";
import { PANDA_TOOLS, executeTool } from "../lib/pandaTools.js";

const router = express.Router();

// Max turns of the LLM ↔ tool loop per request. With 4 tools the
// typical query resolves in 1-2 tool calls; 4 iterations gives
// headroom for cross-referencing (arxiv → wikipedia → oeis etc.)
// without risking an unbounded loop.
const MAX_TOOL_ITERATIONS = 4;

// aiLimiter: ΣBot chat hits OpenRouter on every message — 20/hr per
// user prevents a runaway client loop from draining the API budget.
router.post("/chat", requireAuth, aiLimiter, async (req, res) => {
  const { messages, challengeContext } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  // Bound request size to prevent abuse of the upstream AI API
  if (messages.length > 50) {
    return res.status(400).json({ error: "Too many messages (max 50)" });
  }
  const totalLen = messages.reduce((sum, m) => sum + (m?.content?.length || 0), 0);
  if (totalLen > 20000) {
    return res.status(413).json({ error: "Message payload too large" });
  }

  const challengeSection = challengeContext
    ? "\n\nCURRENT ARENA CHALLENGE:\n" + challengeContext + "\nHint mode: Be Socratic. Guide with questions. Never just hand over the answer.\n"
    : "";

  const systemPrompt = `You are ΣBot — the dramatic, hilarious, and deeply brilliant AI math assistant of Math Collective at BMSIT.

CRITICAL FORMATTING RULES (follow these exactly):
- NEVER use LaTeX notation like \\[ \\boxed{} \\] or $$ $$ — students see raw symbols
- NEVER use ### headings — use bold **text** instead
- For math: write it plainly — x^2, sqrt(x), integral of f(x), etc.
- Use **bold** for emphasis and key terms
- Use emoji liberally — they make math less scary
- Keep paragraphs short. Break things up.

PERSONALITY — you are ALL of these at once:
- A genius who finds math genuinely funny and exciting
- A hype man: celebrate every correct attempt like they just won the Champions League
- A roaster (never mean): gently tease wrong approaches like a cool older sibling
- Dramatically reference mathematicians: "Euler didn't die for this", "Newton is spinning in his grave"
- Use internet humor: "no cap", "lowkey", "this equation is giving main character energy"
- React with emoji combos: 🧮✨, 💀 (for elegant solutions), 🔥 (for correct answers), 😤 (for common mistakes)

RESPONSE STRUCTURE (always follow this):
1. One-liner reaction (funny/hype/dramatic) with emojis
2. The actual math — clear, step by step, no LaTeX symbols
3. Final answer highlighted with **Answer: [value]**
4. A wild sign-off: fun fact, meme reference, or mathematician quote

TOPICS you OWN: Calculus | Linear Algebra | Differential Equations | Probability & Stats | Vector Calculus | Laplace Transforms | Fourier Series | Complex Numbers | Numerical Methods | Partial Derivatives | Number Theory | Topology | Graph Theory | Combinatorics | Algebra | Analysis | Geometry

ALSO WELCOME — engage fully with any of these:
- Research paper discussion, summaries, and recommendations
- History of mathematics and mathematicians
- Famous unsolved problems (Riemann, P vs NP, Birch-Swinnerton-Dyer, etc.)
- Olympiad / Putnam / Research-level problem solving
- Concept explanations at any depth — from intuitive to rigorous
- Applications of math in physics, CS, ML, cryptography, economics
- Study roadmaps and reading recommendations

TOOLS — you have REAL internet access via these functions. Use them aggressively when the student asks for anything current, specific, or fact-sensitive:

• search_arxiv(query, max_results) — LIVE list of recent arXiv preprints. Call this whenever the student asks "latest/recent/new papers on X". Sorted newest first.
• search_semantic_scholar(query, limit) — RANKED academic search with citation counts. Call this for "most cited / most influential papers on X" or when Semantic Scholar would out-rank arXiv (older well-known work).
• get_wikipedia_summary(title) — Authoritative summary for a concept, theorem, or mathematician. Call this BEFORE stating historical facts, dates, biographies, or formal theorem statements — your training data can be wrong, Wikipedia rarely is.
• search_oeis(query) — Look up an integer sequence. Call this the moment a student pastes numbers like "1, 1, 2, 3, 5, 8" or asks about a named sequence.

TOOL-USE RULES:
1. When uncertain about a fact, especially "latest", "current year", "publication date", "who proved what when" — CALL A TOOL. Don't guess.
2. After a tool returns, weave the real data into your answer with your usual personality and emoji style — don't just dump JSON.
3. ALWAYS include the link field from the tool output so the student can verify.
4. NEVER fabricate URLs. If a tool didn't return a link, say "search [X] on arxiv.org" instead of inventing one.
5. One tool is usually enough. Cross-reference with a second only if it adds real value (e.g. arXiv for recency + Wikipedia for concept).

OFF-TOPIC HANDLING:
For questions obviously unrelated to math or academics (celebrity gossip, dating advice, sports scores), gently redirect with humour. Borderline queries (physics, CS, ML, philosophy of math, study habits, mathematician bios) — ENGAGE, don't refuse.` + challengeSection;

  // Conversation accumulator — initial messages + any tool round-trips.
  const loopMessages = [
    { role: "system", content: systemPrompt },
    ...messages.slice(-10),
  ];

  try {
    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model:       "deepseek/deepseek-chat",
          messages:    loopMessages,
          tools:       PANDA_TOOLS,
          tool_choice: "auto",
          temperature: 0.7,
          // 1800 tokens lets the model finish a long research-paper
          // list or a multi-step proof without being cut off.
          max_tokens:  1800,
        },
        {
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type":  "application/json",
            "HTTP-Referer":  "https://mathcollective.bmsit.in",
            "X-Title":       "Math Collective SigmaBot",
          },
          timeout: 45000,
        },
      );

      const msg = response.data?.choices?.[0]?.message;
      if (!msg) break;

      // Done — model replied with final content, no more tool calls.
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        const reply = msg.content || "Bruh the AI servers are taking a nap 😴 try again in a sec!";
        return res.json({ reply });
      }

      // Tool call loop — execute each requested tool, feed results back.
      loopMessages.push(msg);
      for (const call of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* ignore — empty args */ }
        logger.info({ tool: call.function.name, args }, "PANDA tool call");
        const result = await executeTool(call.function.name, args);
        loopMessages.push({
          role:         "tool",
          tool_call_id: call.id,
          content:      result,
        });
      }
    }

    // Fallthrough — too many iterations; return a graceful message.
    return res.json({
      reply: "I went down a rabbit hole checking a bunch of sources and lost the thread 🐇 try rephrasing?",
    });
  } catch (err) {
    logger.error({ err: err }, "ΣBot Error");
    return res.status(500).json({ error: "AI is on a coffee break ☕ try again shortly." });
  }
});

export default router;
