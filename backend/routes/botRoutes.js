import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { aiLimiter } from "../middleware/rateLimiter.js";
import { logger } from "../config/logger.js";
import { PANDA_TOOLS, executeTool } from "../lib/pandaTools.js";
import { callLLM } from "../lib/llm.js";

const router = express.Router();

// Max turns of the LLM ↔ tool loop per request. 7 gives the model
// enough slack to chain arxiv → semantic_scholar → wikipedia on a
// single "latest papers on X" query without the rabbit-hole fallback
// firing mid-answer. aiLimiter (20/hr/user) still caps overall cost.
const MAX_TOOL_ITERATIONS = 7;

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

• search_arxiv(query, max_results) — LIVE list of recent arXiv preprints. Call this whenever the student asks "latest/recent/new papers on X". Sorted newest first. Each result includes a link (abstract page) AND a pdf field (direct PDF download) — surface BOTH in your reply so students can click straight to the paper.
• search_semantic_scholar(query, limit) — RANKED academic search with citation counts. Call this for "most cited / most influential papers on X" or when Semantic Scholar would out-rank arXiv (older well-known work). Results include a pdf field when an open-access PDF exists — surface it as a separate link.
• get_wikipedia_summary(title) — Authoritative summary for a concept, theorem, or mathematician. Call this BEFORE stating historical facts, dates, biographies, or formal theorem statements — your training data can be wrong, Wikipedia rarely is.
• search_oeis(query) — Look up an integer sequence. Call this the moment a student pastes numbers like "1, 1, 2, 3, 5, 8" or asks about a named sequence.
• get_video_tutorials(query, level) — Returns a YouTube search URL tuned to their exact query + 3-4 channel recommendations. Call this when the student asks for "videos / tutorials / visual explanations / show me a lecture on X". Use level="beginner" if they say "I'm new to this", "advanced" for grad-level topics, else "intermediate".

TOOL-USE RULES:
1. When uncertain about a fact, especially "latest", "current year", "publication date", "who proved what when" — CALL A TOOL. Don't guess.
2. When the student asks for "papers", "research", "tutorials", "videos", "resources", or "links" on ANY topic — CALL A TOOL. Don't answer from memory.
3. After a tool returns, weave the real data into your answer with your usual personality — don't just dump JSON.
4. When a tool returns multiple items, format them as a bulleted list, one per item, like:
   - **[Paper/Page title]** — one-sentence takeaway. 👉 https://the-actual-url
   The URL MUST be on its own, unwrapped, on the same line or the next — never hide it behind a word like "here".
5. NEVER fabricate URLs. If a tool didn't return a link, say "search [X] on arxiv.org" instead of inventing one. But if the tool DID return links, surfacing every one is the whole point — do it.
6. One tool is usually enough. Cross-reference with a second only if it adds real value (e.g. arXiv for recency + Wikipedia for concept).

OFF-TOPIC HANDLING:
For questions obviously unrelated to math or academics (celebrity gossip, dating advice, sports scores), gently redirect with humour. Borderline queries (physics, CS, ML, philosophy of math, study habits, mathematician bios) — ENGAGE, don't refuse.` + challengeSection;

  // Conversation accumulator — initial messages + any tool round-trips.
  const loopMessages = [
    { role: "system", content: systemPrompt },
    ...messages.slice(-10),
  ];

  const toolsCalled = []; // audit trail for diagnostics on failure
  let lastProvider = null; // populated by callLLM; logged on failure

  try {
    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      // callLLM: Gemini primary → OpenRouter fallback. One same-
      // provider retry on transient 5xx/timeouts, then failover.
      // PANDA is the "chat" mode — keeps thinking on because the
      // model reasons over tool results before replying.
      const { response, provider } = await callLLM({
        messages:    loopMessages,
        tools:       PANDA_TOOLS,
        toolChoice:  "auto",
        temperature: 0.7,
        maxTokens:   1800,
        mode:        "chat",
        timeoutMs:   45000,
      });
      lastProvider = provider;

      const msg = response.data?.choices?.[0]?.message;
      // `msg` absent means OpenRouter returned a 200 with no choices —
      // genuinely upstream-broken. Treat as a transient error so the
      // frontend shows the consistent "napping" toast rather than a
      // weird inline reply that looks like PANDA "successfully" said
      // something snarky.
      if (!msg) {
        logger.error({
          iter,
          toolsCalled,
          responsePreview: JSON.stringify(response.data || {}).slice(0, 400),
        }, "PANDA: empty OpenRouter response (no message)");
        return res.status(502).json({ error: "Upstream returned an empty response" });
      }

      // Done — model replied with final content, no more tool calls.
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        if (!msg.content || !msg.content.trim()) {
          // Model finished the loop but gave us nothing. Log the full
          // state so we can see whether tool results were malformed,
          // context was too long, or the model just refused.
          logger.error({
            iter,
            toolsCalled,
            finishReason: response.data?.choices?.[0]?.finish_reason || null,
            msgPreview:   JSON.stringify(msg).slice(0, 400),
            usage:        response.data?.usage || null,
          }, "PANDA: empty content on final iteration");
          return res.status(502).json({ error: "Upstream produced no answer" });
        }
        return res.json({ reply: msg.content });
      }

      // Tool call loop — execute each requested tool, feed results back.
      loopMessages.push(msg);
      for (const call of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* ignore — empty args */ }
        logger.info({ tool: call.function.name, args }, "PANDA tool call");
        let result;
        try {
          result = await executeTool(call.function.name, args);
          toolsCalled.push({ tool: call.function.name, ok: true });
        } catch (toolErr) {
          // A tool throw would otherwise propagate to the outer catch
          // and look like an OpenRouter failure. Capture it here,
          // feed a clear error back to the model so it can recover,
          // and keep the loop going.
          logger.warn({ err: toolErr, tool: call.function.name, args }, "PANDA tool failed");
          toolsCalled.push({ tool: call.function.name, ok: false, err: toolErr.message });
          result = JSON.stringify({ error: `Tool ${call.function.name} failed: ${toolErr.message}` });
        }
        loopMessages.push({
          role:         "tool",
          tool_call_id: call.id,
          content:      result,
        });
      }
    }

    // Fallthrough — too many iterations. Log what happened so we can
    // tell whether the model looped on the same tool or actually
    // chained meaningfully. 502 so the frontend's single "napping"
    // path handles it consistently.
    logger.error({
      toolsCalled,
      iterations: MAX_TOOL_ITERATIONS,
    }, "PANDA: exhausted tool iterations without final reply");
    return res.status(502).json({ error: "Chained too many tools without answering" });
  } catch (err) {
    // Map upstream failures to accurate status codes so logs + the
    // frontend can tell "we timed out" from "OpenRouter 5xx'd us" from
    // "our own bug". The frontend still shows a generic "napping"
    // toast for all three, but differentiated codes make triage and
    // Sentry grouping much easier.
    const upstreamStatus = err.response?.status;
    const isTimeout      = err.code === "ECONNABORTED";
    // OpenRouter returns 401 when the API key is missing/wrong and
    // 402 when the account has no credit. These will persist until
    // the admin fixes the env — logging the upstream body makes that
    // obvious in the Render logs instead of looking like random
    // flakiness. The user-facing 502 stays consistent so we don't
    // leak key-state over the wire.
    const isAuthOrBilling = upstreamStatus === 401 || upstreamStatus === 402 || upstreamStatus === 403;
    const status = isTimeout
      ? 504
      : (upstreamStatus && upstreamStatus >= 500 ? 502
        : isAuthOrBilling ? 502
        : 500);
    logger.error({
      err,
      lastProvider,
      upstreamStatus,
      upstreamBody: err.response?.data ? JSON.stringify(err.response.data).slice(0, 400) : null,
      code: err.code,
      mappedStatus: status,
      isAuthOrBilling,
      noProvider: err.code === "NO_LLM_PROVIDER",
    }, "ΣBot Error");
    return res.status(status).json({ error: "AI is on a coffee break ☕ try again shortly." });
  }
});

export default router;
