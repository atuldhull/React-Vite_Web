/**
 * Unit tests for backend/lib/pandaTools.js.
 *
 * Pre-coverage: 4.68 % statements. Reason: every path is an axios call
 * to a public API and we never hit them in integration tests (PANDA bot
 * itself is mocked at the /api/bot/chat boundary).
 *
 * Each tool has three shapes we need to pin:
 *   - happy path: the tool parses upstream's shape into the stringified
 *     JSON payload the bot is designed to consume.
 *   - empty upstream: the tool returns a human-readable "no results"
 *     string so the model doesn't fabricate citations.
 *   - thrown axios error: executeTool() wraps it into a deterministic
 *     "Tool X failed: ..." string so the model can move on.
 *
 * Plus: executeTool dispatcher branches (each tool name + unknown),
 * MAX_TOOL_RESULT_CHARS truncation, and the no-network get_video_tutorials
 * channel-recommendation level selection.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

vi.mock("axios");

import { executeTool, PANDA_TOOLS } from "../../backend/lib/pandaTools.js";

beforeEach(() => { vi.clearAllMocks(); });

// ════════════════════════════════════════════════════════════
// Tool-definition sanity — protects the OpenAI function-calling shape
// ════════════════════════════════════════════════════════════

describe("PANDA_TOOLS schema shape", () => {
  it("exposes all 5 tool definitions with required fields", () => {
    const names = PANDA_TOOLS.map(t => t.function.name).sort();
    expect(names).toEqual([
      "get_video_tutorials",
      "get_wikipedia_summary",
      "search_arxiv",
      "search_oeis",
      "search_semantic_scholar",
    ]);
    for (const t of PANDA_TOOLS) {
      expect(t.type).toBe("function");
      expect(typeof t.function.description).toBe("string");
      expect(t.function.parameters.type).toBe("object");
      expect(Array.isArray(t.function.parameters.required)).toBe(true);
    }
  });
});

// ════════════════════════════════════════════════════════════
// search_arxiv
// ════════════════════════════════════════════════════════════

describe("executeTool('search_arxiv')", () => {
  it("parses an arXiv Atom feed into {title,authors,published,abstract,link,pdf}", async () => {
    axios.get.mockResolvedValueOnce({
      data: `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>On the Distribution of Prime Gaps</title>
    <summary>We study the small-scale distribution of prime gaps.</summary>
    <published>2026-01-15T00:00:00Z</published>
    <id>http://arxiv.org/abs/2601.12345v1</id>
    <author><name>A. Mathematician</name></author>
    <author><name>B. Collaborator</name></author>
  </entry>
</feed>`,
    });
    const out = await executeTool("search_arxiv", { query: "prime gaps", max_results: 5 });
    const parsed = JSON.parse(out);
    expect(parsed.source).toBe("arxiv.org");
    expect(parsed.count).toBe(1);
    expect(parsed.papers[0].title).toBe("On the Distribution of Prime Gaps");
    expect(parsed.papers[0].authors).toBe("A. Mathematician, B. Collaborator");
    expect(parsed.papers[0].published).toBe("2026-01-15");
    // The abs → pdf transformation is a load-bearing convenience for the
    // bot — it lets the model emit direct download links without a second
    // round-trip. Pin the exact replacement rule.
    expect(parsed.papers[0].pdf).toBe("http://arxiv.org/pdf/2601.12345v1.pdf");
  });

  it("clamps max_results into [1, 10]", async () => {
    axios.get.mockResolvedValueOnce({ data: "<feed></feed>" });
    await executeTool("search_arxiv", { query: "x", max_results: 999 });
    // The clamping is reflected in the URL.
    const url = axios.get.mock.calls[0][0];
    expect(url).toContain("max_results=10");
  });

  it("phrase-quotes multi-word queries so arXiv doesn't OR-split them", async () => {
    axios.get.mockResolvedValueOnce({ data: "<feed></feed>" });
    await executeTool("search_arxiv", { query: "prime gaps" });
    const url = axios.get.mock.calls[0][0];
    // URL-encoded %22prime+gaps%22 or %22prime%20gaps%22 — the quotes
    // are the load-bearing bit.
    expect(url).toMatch(/%22/);
  });

  it("returns a friendly no-results string when arXiv gives back an empty feed", async () => {
    axios.get.mockResolvedValueOnce({ data: "<feed></feed>" });
    const out = await executeTool("search_arxiv", { query: "zqyzyxzxz" });
    expect(out).toMatch(/No arXiv papers matched/);
  });

  it("is wrapped by executeTool's try/catch — axios throw becomes a 'Tool … failed' string", async () => {
    axios.get.mockRejectedValueOnce(new Error("ECONNRESET"));
    const out = await executeTool("search_arxiv", { query: "x" });
    expect(out).toMatch(/Tool search_arxiv failed/);
    expect(out).toMatch(/ECONNRESET/);
  });
});

// ════════════════════════════════════════════════════════════
// search_semantic_scholar
// ════════════════════════════════════════════════════════════

describe("executeTool('search_semantic_scholar')", () => {
  it("maps Semantic Scholar's shape into {title,authors,year,citations,abstract,link,pdf}", async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            title: "Fermat's Last Theorem",
            authors: [{ name: "A. Wiles" }, { name: "R. Taylor" }, { name: "X" }, { name: "Y" }],
            year: 1995,
            citationCount: 2500,
            abstract: "A proof via modular forms and Galois representations...",
            url: "https://example.org/flt",
            openAccessPdf: { url: "https://example.org/flt.pdf" },
          },
        ],
      },
    });
    const parsed = JSON.parse(await executeTool("search_semantic_scholar", { query: "FLT", limit: 5 }));
    expect(parsed.source).toBe("semanticscholar.org");
    expect(parsed.papers[0].year).toBe(1995);
    expect(parsed.papers[0].citations).toBe(2500);
    // Author cap at 3 — a paper with 4+ authors shouldn't bloat the context.
    expect(parsed.papers[0].authors).toBe("A. Wiles, R. Taylor, X");
    expect(parsed.papers[0].pdf).toBe("https://example.org/flt.pdf");
  });

  it("no-results path returns the human-readable notice", async () => {
    axios.get.mockResolvedValueOnce({ data: { data: [] } });
    const out = await executeTool("search_semantic_scholar", { query: "nothinghere" });
    expect(out).toMatch(/No Semantic Scholar results/);
  });

  it("handles the 'no openAccessPdf' branch without crashing", async () => {
    axios.get.mockResolvedValueOnce({
      data: { data: [{ title: "X", authors: [], year: 2020, citationCount: 1, abstract: "", url: "u", openAccessPdf: null }] },
    });
    const parsed = JSON.parse(await executeTool("search_semantic_scholar", { query: "x" }));
    expect(parsed.papers[0].pdf).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════
// get_wikipedia_summary
// ════════════════════════════════════════════════════════════

describe("executeTool('get_wikipedia_summary')", () => {
  it("returns a compact {title, description, extract, link, thumbnail} blob", async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        title: "Riemann hypothesis",
        description: "Conjecture about zeros of the Riemann zeta function",
        extract: "The Riemann hypothesis...",
        content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Riemann_hypothesis" } },
        thumbnail: { source: "https://img/rh.png" },
      },
    });
    const parsed = JSON.parse(await executeTool("get_wikipedia_summary", { title: "Riemann hypothesis" }));
    expect(parsed.source).toBe("wikipedia.org");
    expect(parsed.title).toBe("Riemann hypothesis");
    expect(parsed.link).toMatch(/wikipedia\.org/);
  });

  it("network error → wrapped 'Tool ... failed' string", async () => {
    axios.get.mockRejectedValueOnce(Object.assign(new Error("404"), { response: { status: 404 } }));
    const out = await executeTool("get_wikipedia_summary", { title: "NotARealTopic123" });
    expect(out).toMatch(/Tool get_wikipedia_summary failed/);
  });
});

// ════════════════════════════════════════════════════════════
// search_oeis
// ════════════════════════════════════════════════════════════

describe("executeTool('search_oeis')", () => {
  it("formats OEIS results with zero-padded ID and first 15 terms", async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        results: [
          {
            number: 45,
            name: "Fibonacci numbers",
            data: "0,1,1,2,3,5,8,13,21,34,55,89,144,233,377,610",
            formula: ["a(n) = a(n-1) + a(n-2)"],
          },
        ],
      },
    });
    const parsed = JSON.parse(await executeTool("search_oeis", { query: "1,1,2,3,5,8" }));
    expect(parsed.sequences[0].id).toBe("A000045");
    // Truncation to first 15 terms is the tool's contract.
    const termCount = parsed.sequences[0].first_terms.split(",").length;
    expect(termCount).toBeLessThanOrEqual(15);
    expect(parsed.sequences[0].link).toBe("https://oeis.org/A000045");
  });

  it("falls back cleanly when formula is not an array", async () => {
    axios.get.mockResolvedValueOnce({
      data: { results: [{ number: 1, name: "Ones", data: "1,1,1", formula: "nothing" }] },
    });
    const parsed = JSON.parse(await executeTool("search_oeis", { query: "1,1,1" }));
    expect(parsed.sequences[0].formula).toBe(""); // non-array → empty string
  });

  it("no-results path returns the friendly string", async () => {
    axios.get.mockResolvedValueOnce({ data: { results: [] } });
    const out = await executeTool("search_oeis", { query: "9,9,9,9,9" });
    expect(out).toMatch(/No OEIS sequence found/);
  });
});

// ════════════════════════════════════════════════════════════
// get_video_tutorials — no network; deterministic channel recs
// ════════════════════════════════════════════════════════════

describe("executeTool('get_video_tutorials')", () => {
  it("emits a YouTube search URL + the beginner channel list when level='beginner'", async () => {
    const parsed = JSON.parse(await executeTool("get_video_tutorials", { query: "derivatives", level: "beginner" }));
    expect(parsed.search_url).toContain("https://www.youtube.com/results?search_query=derivatives");
    expect(parsed.channels.some(c => c.name === "Khan Academy")).toBe(true);
    expect(parsed.level).toBe("beginner");
  });

  it("picks the intermediate channel list for unknown levels", async () => {
    const parsed = JSON.parse(await executeTool("get_video_tutorials", { query: "x" }));
    expect(parsed.level).toBe("intermediate");
    expect(parsed.channels.some(c => c.name === "3Blue1Brown")).toBe(true);
  });

  it("picks the advanced list when level='advanced'", async () => {
    const parsed = JSON.parse(await executeTool("get_video_tutorials", { query: "topology", level: "advanced" }));
    expect(parsed.level).toBe("advanced");
    expect(parsed.channels.some(c => /MIT|Borcherds|Bright Side|Michael Penn/i.test(c.name))).toBe(true);
  });

  it("URL-encodes multi-word queries in the search URL", async () => {
    const parsed = JSON.parse(await executeTool("get_video_tutorials", { query: "algebraic topology intro" }));
    // The space becomes %20 (encodeURIComponent) — not +. Pin exact encoding.
    expect(parsed.search_url).toContain("algebraic%20topology%20intro");
  });
});

// ════════════════════════════════════════════════════════════
// Dispatcher edge cases
// ════════════════════════════════════════════════════════════

describe("executeTool — dispatcher", () => {
  it("returns a stable string for an unknown tool name", async () => {
    const out = await executeTool("not_a_real_tool", { foo: "bar" });
    expect(out).toMatch(/Unknown tool "not_a_real_tool"/);
  });

  it("truncates long tool output at MAX_TOOL_RESULT_CHARS (4000)", async () => {
    // Seed a huge Wikipedia extract so the JSON-stringify result exceeds 4000 chars.
    axios.get.mockResolvedValueOnce({
      data: {
        title: "X",
        description: "d",
        extract: "lorem ipsum ".repeat(500), // ~6000 chars of extract alone
        content_urls: { desktop: { page: "https://x" } },
        thumbnail: null,
      },
    });
    const out = await executeTool("get_wikipedia_summary", { title: "X" });
    expect(out.length).toBeLessThanOrEqual(4000);
  });
});
