/**
 * Diagnostic: hits OpenRouter directly with the same payload the
 * /api/bot/chat route sends, and prints the actual error so we can tell
 * what's failing (bad key / dead model / rate limit / network).
 *
 *   node backend/scripts/testBot.js
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../..", ".env.local") });

const key = process.env.OPENROUTER_API_KEY;
console.log("\n\u{1F9EA} Bot diagnostic\n");
console.log("OPENROUTER_API_KEY:", key ? `set (${key.length} chars, prefix=${key.slice(0, 8)}...)` : "MISSING");

if (!key) {
  console.error("\nNo key — cannot test. Set OPENROUTER_API_KEY in .env.local.\n");
  process.exit(1);
}

try {
  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "deepseek/deepseek-chat",
      messages: [
        { role: "system", content: "You are a helpful math assistant." },
        { role: "user",   content: "what is 2+2?" },
      ],
      temperature: 0.7,
      max_tokens:  100,
    },
    {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://mathcollective.bmsit.in",
        "X-Title":      "Math Collective SigmaBot",
      },
      timeout: 30000,
    },
  );

  const reply = response.data?.choices?.[0]?.message?.content;
  console.log("\n\u2705 OpenRouter responded.");
  console.log("Status:", response.status);
  console.log("Model :", response.data?.model || "(unknown)");
  console.log("Reply :", reply ? `"${reply.slice(0, 200)}..."` : "(empty)");
  console.log("\nBot pipeline is working. If the UI still says 'PANDA is napping',");
  console.log("the issue is between the browser and the backend (cookie? auth?).\n");
  process.exit(0);
} catch (err) {
  console.error("\n\u274C OpenRouter call failed.");
  console.error("Status :", err.response?.status);
  console.error("Body   :", JSON.stringify(err.response?.data, null, 2));
  console.error("Message:", err.message);

  if (err.response?.status === 401) {
    console.error("\n\u2192 Your API key is invalid or revoked. Get a new one at openrouter.ai/keys");
  } else if (err.response?.status === 402) {
    console.error("\n\u2192 Out of OpenRouter credits. Top up at openrouter.ai/credits");
  } else if (err.response?.status === 404) {
    console.error("\n\u2192 The model 'deepseek/deepseek-chat' may have been renamed or removed.");
    console.error("\u2192 Check available models at openrouter.ai/models");
  } else if (err.response?.status === 429) {
    console.error("\n\u2192 Rate-limited. Wait a minute and try again.");
  } else if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
    console.error("\n\u2192 Network problem reaching openrouter.ai");
  }
  process.exit(1);
}
