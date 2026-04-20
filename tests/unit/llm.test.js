/**
 * Unit tests for the LLM provider helper (backend/lib/llm.js).
 *
 * The helper is the primary reliability layer for every AI feature:
 *   - PANDA bot (/api/bot/chat)
 *   - Teacher question generator (/api/teacher/generate)
 *   - Quiz bulk generator (/api/quiz/ai-generate-bulk)
 *
 * A regression here degrades all three simultaneously, so the
 * invariants below are worth pinning down: provider failover,
 * per-provider retry, 4xx-fails-fast, NO_LLM_PROVIDER error code
 * when neither key is configured, jsonOnly / oneshot-mode wiring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";

vi.mock("axios");

// Re-import between tests so the env-driven `availableProviders`
// lookup picks up whatever the test just set. ESM modules cache
// hard, so we vi.resetModules() per-test.
async function loadCallLLM(env = {}) {
  const prior = {};
  for (const [k, v] of Object.entries(env)) {
    prior[k] = process.env[k];
    if (v === null) delete process.env[k];
    else process.env[k] = v;
  }
  vi.resetModules();
  const mod = await import("../../backend/lib/llm.js");
  // Return a restore fn so each test leaves env untouched for the next.
  return {
    callLLM: mod.callLLM,
    listProviders: mod.listProviders,
    restore: () => {
      for (const [k, v] of Object.entries(prior)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    },
  };
}

beforeEach(() => { vi.clearAllMocks(); });

// ════════════════════════════════════════════════════════════
// Provider configuration
// ════════════════════════════════════════════════════════════

describe("callLLM — provider configuration", () => {
  it("throws NO_LLM_PROVIDER when neither key is set", async () => {
    const { callLLM, restore } = await loadCallLLM({
      GEMINI_API_KEY: null,
      OPENROUTER_API_KEY: null,
    });
    try {
      await expect(callLLM({ messages: [] })).rejects.toMatchObject({
        code: "NO_LLM_PROVIDER",
      });
      // axios never called when no provider is configured.
      expect(axios.post).not.toHaveBeenCalled();
    } finally { restore(); }
  });

  it("listProviders reports which keys are set", async () => {
    const { listProviders, restore } = await loadCallLLM({
      GEMINI_API_KEY: "g",
      OPENROUTER_API_KEY: null,
    });
    try {
      const ps = listProviders();
      expect(ps.find(p => p.name === "gemini")?.hasKey).toBe(true);
      expect(ps.find(p => p.name === "openrouter")?.hasKey).toBe(false);
    } finally { restore(); }
  });
});

// ════════════════════════════════════════════════════════════
// Happy path — hits Gemini when both keys are set
// ════════════════════════════════════════════════════════════

describe("callLLM — happy path", () => {
  it("calls Gemini first when both providers configured", async () => {
    axios.post.mockResolvedValueOnce({ data: { choices: [{ message: { content: "ok" } }] } });
    const { callLLM, restore } = await loadCallLLM({
      GEMINI_API_KEY: "g-key",
      OPENROUTER_API_KEY: "o-key",
    });
    try {
      const { provider, model } = await callLLM({ messages: [{ role: "user", content: "hi" }] });
      expect(provider).toBe("gemini");
      expect(model).toBe("gemini-2.5-flash");
      expect(axios.post).toHaveBeenCalledTimes(1);
      const [url, body, cfg] = axios.post.mock.calls[0];
      expect(url).toContain("generativelanguage.googleapis.com");
      expect(cfg.headers.Authorization).toBe("Bearer g-key");
      expect(body.model).toBe("gemini-2.5-flash");
    } finally { restore(); }
  });

  it("oneshot mode picks the Flash Lite (non-thinking) variant", async () => {
    axios.post.mockResolvedValueOnce({ data: { choices: [{ message: { content: "{}" } }] } });
    const { callLLM, restore } = await loadCallLLM({ GEMINI_API_KEY: "g" });
    try {
      await callLLM({ messages: [], mode: "oneshot" });
      const body = axios.post.mock.calls[0][1];
      expect(body.model).toBe("gemini-2.5-flash-lite");
      // reasoning_effort:"none" is the oneshot marker — disables the
      // thinking-token burn so max_tokens fully funds the response.
      expect(body.reasoning_effort).toBe("none");
    } finally { restore(); }
  });

  it("jsonOnly sets response_format:json_object", async () => {
    axios.post.mockResolvedValueOnce({ data: { choices: [{ message: { content: "{}" } }] } });
    const { callLLM, restore } = await loadCallLLM({ GEMINI_API_KEY: "g" });
    try {
      await callLLM({ messages: [], jsonOnly: true });
      const body = axios.post.mock.calls[0][1];
      expect(body.response_format).toEqual({ type: "json_object" });
    } finally { restore(); }
  });

  it("tools + tool_choice passed through verbatim", async () => {
    axios.post.mockResolvedValueOnce({ data: { choices: [{ message: { content: "" } }] } });
    const { callLLM, restore } = await loadCallLLM({ GEMINI_API_KEY: "g" });
    try {
      const tools = [{ type: "function", function: { name: "x" } }];
      await callLLM({ messages: [], tools, toolChoice: "auto" });
      const body = axios.post.mock.calls[0][1];
      expect(body.tools).toEqual(tools);
      expect(body.tool_choice).toBe("auto");
    } finally { restore(); }
  });
});

// ════════════════════════════════════════════════════════════
// Retry + failover
// ════════════════════════════════════════════════════════════

describe("callLLM — retry + failover", () => {
  it("retries once on 502 from the same provider before failing over", async () => {
    // First call: 502, second call (same provider, retry): OK.
    axios.post
      .mockRejectedValueOnce({ response: { status: 502 } })
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: "recovered" } }] } });

    const { callLLM, restore } = await loadCallLLM({
      GEMINI_API_KEY: "g",
      OPENROUTER_API_KEY: "o",
    });
    try {
      const { provider } = await callLLM({ messages: [] });
      expect(provider).toBe("gemini");
      expect(axios.post).toHaveBeenCalledTimes(2);
    } finally { restore(); }
  });

  it("falls over to OpenRouter when Gemini exhausts its 2 attempts on 5xx", async () => {
    // Gemini: fail, fail. OpenRouter: success.
    axios.post
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: "from openrouter" } }] } });

    const { callLLM, restore } = await loadCallLLM({
      GEMINI_API_KEY: "g",
      OPENROUTER_API_KEY: "o",
    });
    try {
      const { provider, model } = await callLLM({ messages: [] });
      expect(provider).toBe("openrouter");
      expect(model).toBe("deepseek/deepseek-chat");
      expect(axios.post).toHaveBeenCalledTimes(3);
    } finally { restore(); }
  });

  it("fails over immediately on 4xx (non-retriable)", async () => {
    // Gemini returns 401 (bad key) — should NOT retry the same
    // provider, should immediately fall over to OpenRouter.
    axios.post
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: "ok" } }] } });

    const { callLLM, restore } = await loadCallLLM({
      GEMINI_API_KEY: "g",
      OPENROUTER_API_KEY: "o",
    });
    try {
      const { provider } = await callLLM({ messages: [] });
      expect(provider).toBe("openrouter");
      // 2 calls total: 1 Gemini (no retry) + 1 OpenRouter.
      expect(axios.post).toHaveBeenCalledTimes(2);
    } finally { restore(); }
  });

  it("retries on ECONNABORTED (timeout) before failover", async () => {
    axios.post
      .mockRejectedValueOnce({ code: "ECONNABORTED" })
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: "ok" } }] } });

    const { callLLM, restore } = await loadCallLLM({ GEMINI_API_KEY: "g" });
    try {
      const { provider } = await callLLM({ messages: [] });
      expect(provider).toBe("gemini");
      expect(axios.post).toHaveBeenCalledTimes(2);
    } finally { restore(); }
  });

  it("throws the last error when all providers fail", async () => {
    axios.post.mockRejectedValue({ response: { status: 500 }, message: "server exploded" });

    const { callLLM, restore } = await loadCallLLM({
      GEMINI_API_KEY: "g",
      OPENROUTER_API_KEY: "o",
    });
    try {
      await expect(callLLM({ messages: [] })).rejects.toMatchObject({
        response: { status: 500 },
      });
      // 2 providers × 2 attempts = 4.
      expect(axios.post).toHaveBeenCalledTimes(4);
    } finally { restore(); }
  });
});

// ════════════════════════════════════════════════════════════
// OpenRouter-specific headers
// ════════════════════════════════════════════════════════════

describe("callLLM — OpenRouter referrer headers", () => {
  it("adds HTTP-Referer + X-Title when calling OpenRouter", async () => {
    // Skip Gemini entirely by not setting its key.
    axios.post.mockResolvedValueOnce({ data: { choices: [{ message: { content: "" } }] } });

    const { callLLM, restore } = await loadCallLLM({
      GEMINI_API_KEY: null,
      OPENROUTER_API_KEY: "o",
    });
    try {
      await callLLM({ messages: [] });
      const cfg = axios.post.mock.calls[0][2];
      expect(cfg.headers["HTTP-Referer"]).toBeTruthy();
      expect(cfg.headers["X-Title"]).toBeTruthy();
    } finally { restore(); }
  });

  it("does NOT add those headers on Gemini calls", async () => {
    axios.post.mockResolvedValueOnce({ data: { choices: [{ message: { content: "" } }] } });

    const { callLLM, restore } = await loadCallLLM({ GEMINI_API_KEY: "g" });
    try {
      await callLLM({ messages: [] });
      const cfg = axios.post.mock.calls[0][2];
      expect(cfg.headers["HTTP-Referer"]).toBeUndefined();
      expect(cfg.headers["X-Title"]).toBeUndefined();
    } finally { restore(); }
  });
});

// Cleanup spy state once the file finishes.
afterEach(() => { vi.clearAllMocks(); });
