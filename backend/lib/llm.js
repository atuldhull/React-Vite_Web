/**
 * LLM provider abstraction.
 *
 * Routes chat-completion requests to Gemini (primary) with OpenRouter
 * as the fallback. Both providers speak the OpenAI chat/completions
 * format, so callers pass one request body and get the OpenAI-shaped
 * response back regardless of which provider actually served it.
 *
 * Why this exists
 * ───────────────
 * Prod was getting frequent "PANDA is napping" incidents sourced from
 * OpenRouter flakiness (credit exhaustion, free-tier rate limits,
 * 502s from their edge). Gemini's free tier (via AI Studio) has much
 * higher daily limits and a more stable endpoint, so it's now primary.
 * OpenRouter stays in the chain so an outage on the Gemini side
 * doesn't take the bot down — any transient 5xx / timeout from Gemini
 * gets one retry on Gemini, then falls over to OpenRouter.
 *
 * Gemini "thinking" caveat
 * ────────────────────────
 * gemini-2.5-flash burns internal reasoning tokens out of the same
 * max_tokens budget before emitting a visible reply. For use cases
 * where we don't want that (single-shot JSON generation, short
 * answers) we pass `reasoning_effort: "none"` on the outbound body;
 * the OpenAI-compat endpoint maps that to thinkingBudget=0 server-
 * side. PANDA leaves reasoning on because tool-chaining benefits
 * from it.
 */

import axios from "axios";
import { logger } from "../config/logger.js";

// Providers tried in order. First one with an API key present wins;
// on retriable failure we fall through to the next.
const PROVIDERS = [
  {
    name:  "gemini",
    url:   "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    envKey: "GEMINI_API_KEY",
    defaultModels: {
      // Thinking model — best quality, slight latency cost. PANDA.
      chat:     "gemini-2.5-flash",
      // Non-thinking lite variant — faster, cheaper, ideal for the
      // one-shot JSON question generator where reasoning tokens would
      // burn the max_tokens budget before the JSON lands.
      oneshot:  "gemini-2.5-flash-lite",
    },
  },
  {
    name:  "openrouter",
    url:   "https://openrouter.ai/api/v1/chat/completions",
    envKey: "OPENROUTER_API_KEY",
    defaultModels: {
      chat:    "deepseek/deepseek-chat",
      oneshot: "deepseek/deepseek-chat",
    },
  },
];

// A response is "retriable" when the upstream side looks transiently
// sick: generic 5xx, timeouts, DNS hiccups. 4xx (auth, bad request,
// rate limit on specific key) is NOT retriable on the same provider
// — we fall through to the next.
const RETRY_STATUSES = new Set([500, 502, 503, 504]);
const RETRY_CODES    = new Set(["ECONNABORTED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN"]);

function isRetriable(err) {
  const status = err?.response?.status;
  const code   = err?.code;
  return (status && RETRY_STATUSES.has(status)) || RETRY_CODES.has(code);
}

/**
 * Pick the first provider with a usable API key.
 * Returns [] if none set — caller should surface a clear error.
 */
function availableProviders() {
  return PROVIDERS.filter((p) => (process.env[p.envKey] || "").length > 0);
}

/**
 * Call a chat-completion endpoint with automatic retry + provider
 * failover.
 *
 * @param {object} opts
 * @param {Array}  opts.messages         — OpenAI-format messages
 * @param {Array}  [opts.tools]          — OpenAI function-calling tools
 * @param {string} [opts.toolChoice]     — "auto" / "none" / ...
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {"chat"|"oneshot"} [opts.mode] — "chat" picks the thinking model,
 *                                         "oneshot" picks the non-thinking
 *                                         variant. Default "chat".
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{response: any, provider: string, model: string}>}
 *
 * Throws the last error if every provider fails.
 */
export async function callLLM(opts) {
  const {
    messages,
    tools,
    toolChoice,
    temperature = 0.7,
    maxTokens   = 1800,
    mode        = "chat",
    timeoutMs   = 45000,
  } = opts;

  const providers = availableProviders();
  if (providers.length === 0) {
    const err = new Error("No LLM provider configured: set GEMINI_API_KEY or OPENROUTER_API_KEY");
    err.code = "NO_LLM_PROVIDER";
    throw err;
  }

  let lastErr = null;
  for (const p of providers) {
    const model = p.defaultModels[mode] || p.defaultModels.chat;
    const body = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };
    if (tools)      body.tools       = tools;
    if (toolChoice) body.tool_choice = toolChoice;
    // Non-thinking one-shot path — tell Gemini not to burn output
    // tokens on internal reasoning. OpenRouter ignores the field.
    if (mode === "oneshot") body.reasoning_effort = "none";

    const headers = {
      "Authorization": `Bearer ${process.env[p.envKey]}`,
      "Content-Type":  "application/json",
    };
    // OpenRouter requires these for referrer-based rate tiering.
    if (p.name === "openrouter") {
      headers["HTTP-Referer"] = "https://mathcollective.bmsit.in";
      headers["X-Title"]      = "Math Collective";
    }

    // One retry on transient errors on the SAME provider, then fall
    // through. Two total requests per provider, max.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await axios.post(p.url, body, { headers, timeout: timeoutMs });
        return { response, provider: p.name, model };
      } catch (err) {
        lastErr = err;
        const retriable = isRetriable(err);
        if (!retriable || attempt === 2) {
          logger.warn({
            provider: p.name,
            attempt,
            status: err?.response?.status,
            code:   err?.code,
            fallingOver: providers.indexOf(p) < providers.length - 1,
          }, "callLLM provider attempt failed");
          break; // break inner loop — fall through to next provider
        }
        // Transient; pause briefly and retry same provider.
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  // All providers exhausted.
  throw lastErr || new Error("All LLM providers failed");
}

/** Expose providers list for logging/debug. */
export function listProviders() {
  return PROVIDERS.map((p) => ({ name: p.name, hasKey: !!process.env[p.envKey] }));
}
