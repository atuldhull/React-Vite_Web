/**
 * PANDA / ΣBot tool definitions + executors.
 *
 * The bot uses OpenAI-compatible function calling (supported by
 * DeepSeek on OpenRouter): the model decides when to call a tool,
 * we execute it server-side, feed the result back, and the model
 * weaves the answer into its reply.
 *
 * All tools target FREE, no-key public APIs:
 *   arXiv           — math/CS/physics preprints
 *   Semantic Scholar — ranked academic search
 *   Wikipedia       — concept lookups + mathematician bios
 *   OEIS            — integer sequences
 *
 * Each tool is bounded (timeout + result cap) so a flaky upstream
 * can't stall the whole request.
 */

import axios from "axios";
import { logger } from "../config/logger.js";

// Cap individual tool output fed back into the LLM — keeps the
// context window under control when the model calls several tools
// in one turn.
const MAX_TOOL_RESULT_CHARS = 4000;

// ═══════════════════════════════════════════════════════════
// Tool schemas (OpenAI function-calling format)
// ═══════════════════════════════════════════════════════════

export const PANDA_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_arxiv",
      description:
        "Search arXiv for recent math / CS / physics papers on a topic. Returns up to 10 real papers with title, authors, publication date, abstract snippet, and direct PDF link. Use this whenever the student asks about recent papers, latest research, or preprints on a specific topic.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search terms, e.g. 'algebraic topology', 'prime gaps', 'neural ODEs'",
          },
          max_results: {
            type: "integer",
            description: "How many papers to return (1-10, default 5)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_semantic_scholar",
      description:
        "Search Semantic Scholar — better for RANKED/CITED academic work than raw arXiv. Returns title, authors, year, citation count, abstract, and direct link. Use for 'most influential / most cited papers on X' queries.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "integer", description: "1-10, default 5" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_wikipedia_summary",
      description:
        "Fetch the Wikipedia summary for a math concept, theorem, or mathematician. Use for concept clarification, historical context, or biographies. Much more reliable than LLM recall for dates, names, and formal statements.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Article title, e.g. 'Riemann hypothesis', 'Srinivasa Ramanujan', 'Gödel incompleteness theorems'",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_oeis",
      description:
        "Search the On-Line Encyclopedia of Integer Sequences. Pass either comma-separated sequence terms ('1,1,2,3,5,8,13') or a descriptive name ('Catalan numbers'). Returns OEIS ID, formula, and first terms.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
    },
  },
];

// ═══════════════════════════════════════════════════════════
// Dispatcher
// ═══════════════════════════════════════════════════════════

export async function executeTool(name, args) {
  let result;
  try {
    switch (name) {
      case "search_arxiv":
        result = await searchArxiv(args.query, Number(args.max_results) || 5);
        break;
      case "search_semantic_scholar":
        result = await searchSemanticScholar(args.query, Number(args.limit) || 5);
        break;
      case "get_wikipedia_summary":
        result = await getWikipediaSummary(args.title);
        break;
      case "search_oeis":
        result = await searchOeis(args.query);
        break;
      default:
        result = `Unknown tool "${name}". No lookup performed.`;
    }
  } catch (err) {
    logger.warn({ err: err.message, tool: name, args }, "panda tool threw");
    result = `Tool ${name} failed: ${err.message}. Ask the student to search manually.`;
  }
  return typeof result === "string" ? result.slice(0, MAX_TOOL_RESULT_CHARS) : JSON.stringify(result).slice(0, MAX_TOOL_RESULT_CHARS);
}

// ═══════════════════════════════════════════════════════════
// Tool: arXiv
// ═══════════════════════════════════════════════════════════

async function searchArxiv(query, maxResults) {
  const n = Math.max(1, Math.min(10, maxResults));
  // Quote multi-word queries so "prime gaps" searches as a phrase
  // rather than "prime OR gaps" (arXiv's default interpretation).
  const phrased = query.includes(" ") ? `"${query}"` : query;
  const url =
    `https://export.arxiv.org/api/query` +
    `?search_query=${encodeURIComponent(`all:${phrased}`)}` +
    `&max_results=${n}` +
    `&sortBy=submittedDate&sortOrder=descending`;

  const { data } = await axios.get(url, {
    timeout: 15000,
    headers: { "User-Agent": "MathCollective/1.0" },
  });

  const papers = [];
  const entryRx = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRx.exec(data))) {
    const block = m[1];
    const pick = (tag) => (block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)) || [])[1]?.trim();
    const title = pick("title")?.replace(/\s+/g, " ");
    const summary = pick("summary")?.replace(/\s+/g, " ").slice(0, 350);
    const published = pick("published")?.slice(0, 10);
    const link = pick("id");
    const authors = [...block.matchAll(/<name>([\s\S]*?)<\/name>/g)]
      .slice(0, 3)
      .map((x) => x[1].trim());
    if (title) {
      papers.push({
        title,
        authors: authors.join(", ") || "Unknown",
        published,
        abstract: summary,
        link,
      });
    }
  }

  if (papers.length === 0) return `No arXiv papers matched "${query}".`;
  return JSON.stringify({ source: "arxiv.org", count: papers.length, papers }, null, 2);
}

// ═══════════════════════════════════════════════════════════
// Tool: Semantic Scholar
// ═══════════════════════════════════════════════════════════

async function searchSemanticScholar(query, limit) {
  const n = Math.max(1, Math.min(10, limit));
  const url =
    `https://api.semanticscholar.org/graph/v1/paper/search` +
    `?query=${encodeURIComponent(query)}` +
    `&limit=${n}` +
    `&fields=title,authors,year,abstract,citationCount,openAccessPdf,url`;

  const { data } = await axios.get(url, {
    timeout: 15000,
    headers: { "User-Agent": "MathCollective/1.0" },
  });

  const papers = (data.data || []).map((p) => ({
    title: p.title,
    authors: (p.authors || []).slice(0, 3).map((a) => a.name).join(", ") || "Unknown",
    year: p.year,
    citations: p.citationCount,
    abstract: (p.abstract || "").slice(0, 300),
    link: p.url,
    pdf: p.openAccessPdf?.url || null,
  }));

  if (papers.length === 0) return `No Semantic Scholar results for "${query}".`;
  return JSON.stringify({ source: "semanticscholar.org", count: papers.length, papers }, null, 2);
}

// ═══════════════════════════════════════════════════════════
// Tool: Wikipedia
// ═══════════════════════════════════════════════════════════

async function getWikipediaSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

  const { data } = await axios.get(url, {
    timeout: 10000,
    headers: { "User-Agent": "MathCollective/1.0 (contact: atuldhull777@gmail.com)" },
  });

  return JSON.stringify(
    {
      source: "wikipedia.org",
      title: data.title,
      description: data.description,
      extract: data.extract,
      link: data.content_urls?.desktop?.page,
      thumbnail: data.thumbnail?.source,
    },
    null,
    2,
  );
}

// ═══════════════════════════════════════════════════════════
// Tool: OEIS
// ═══════════════════════════════════════════════════════════

async function searchOeis(query) {
  const url = `https://oeis.org/search?q=${encodeURIComponent(query)}&fmt=json`;

  const { data } = await axios.get(url, {
    timeout: 10000,
    headers: { "User-Agent": "MathCollective/1.0" },
  });

  const results = (data.results || []).slice(0, 3).map((r) => {
    const id = `A${String(r.number).padStart(6, "0")}`;
    return {
      id,
      name: r.name,
      first_terms: (r.data || "").split(",").slice(0, 15).join(","),
      formula: Array.isArray(r.formula) ? r.formula.slice(0, 2).join(" ; ") : "",
      link: `https://oeis.org/${id}`,
    };
  });

  if (results.length === 0) return `No OEIS sequence found for "${query}".`;
  return JSON.stringify({ source: "oeis.org", count: results.length, sequences: results }, null, 2);
}
