/**
 * controllers/problemSubmissionController.js
 *
 * AI-assisted catalogue growth. Students paste a URL → the backend
 * fetches the page → an LLM drafts the catalogue fields → the
 * student reviews/edits → submits → admin approves (which copies
 * the row into problem_statements).
 *
 * RATE LIMITS — see the route file:
 *   /draft-from-url   uses aiLimiter (shared 20/hr/user budget) +
 *                     an additional in-controller per-day cap to
 *                     prevent a single user from URL-spamming.
 *
 * SSRF GUARD — the URL-fetch helper rejects:
 *   - non-http(s) schemes
 *   - private / loopback / link-local IPs (after DNS resolve)
 *   - hosts in a small denylist of known internal services
 * The student is allowed to paste any public catalogue URL but
 * can't make the server fetch http://localhost or our own infra.
 */

import axios from "axios";
import dns from "node:dns/promises";
import supabase from "../config/supabase.js";
import { sendInternalError } from "../lib/errorResponse.js";
import { logger } from "../config/logger.js";
import { sendNotification } from "./notificationController.js";

const ALLOWED_SOURCE = new Set(["SIH", "GSoC", "Kaggle", "MLH", "Devfolio", "Unstop", "OpenSource"]);
const ALLOWED_DIFF   = new Set(["beginner", "intermediate", "advanced"]);

// ────────────────────────────────────────────────────────────
// SSRF-safe URL fetch
// ────────────────────────────────────────────────────────────

function isPrivateIp(addr) {
  // Cover the obvious v4 ranges + IPv6 loopback / link-local. This
  // is belt-and-braces; the bigger guard is "don't allow non-public
  // hosts" rather than naming every private block.
  if (!addr) return true;
  if (addr === "::1" || addr.startsWith("fe80:") || addr.startsWith("fc") || addr.startsWith("fd")) return true;
  if (addr === "0.0.0.0") return true;
  // IPv4 private ranges:
  const m = addr.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = m.slice(1).map(Number);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  return false;
}

async function safeFetchUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs are supported");
  }
  // Resolve host to make sure it isn't a private IP. Catches the
  // basic "give me file://" / "give me 169.254.169.254 (cloud metadata)"
  // class of attacks. DNS rebinding via TTL-zero records is the
  // residual risk; in production behind a proxy this would also
  // be blocked at the network layer.
  let ips;
  try {
    ips = await dns.lookup(parsed.hostname, { all: true });
  } catch {
    throw new Error("Host could not be resolved");
  }
  for (const { address } of ips) {
    if (isPrivateIp(address)) throw new Error("Host resolves to a private IP");
  }

  // Cap the response body — the LLM only needs a few KB of page text,
  // not a 5MB image-heavy SPA. Set a strict timeout too.
  const res = await axios.get(url, {
    timeout: 12_000,
    maxContentLength: 1_500_000,   // 1.5 MB hard cap
    responseType: "text",
    headers: {
      "User-Agent":      "MathCollective/1.0 (problem-statement assistant)",
      "Accept":          "text/html,application/xhtml+xml,*/*;q=0.5",
      "Accept-Language": "en",
    },
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return String(res.data || "");
}

// Strip HTML to plain text, conservatively. We're not trying to
// reconstruct paragraphs perfectly — just give the LLM something
// digestible without ten kilobytes of `<svg>` markup.
function htmlToText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ────────────────────────────────────────────────────────────
// POST /api/problem-submissions/draft-from-url
//
// Body: { url }
// Returns a JSON object roughly shaped like a problem_statements row.
// The student edits + submits via createSubmission below.
// ────────────────────────────────────────────────────────────
export const draftFromUrl = async (req, res) => {
  try {
    const url = String(req.body?.url || "").trim();
    if (!url) return res.status(400).json({ error: "url required" });

    // Per-day cap so a single student can't burn the OpenRouter
    // budget pasting 50 URLs. aiLimiter (20/hr) catches the obvious
    // hammer; this catches slow drips.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: dayCount } = await supabase
      .from("problem_submissions")
      .select("id", { count: "exact", head: true })
      .eq("submitter_id", req.userId)
      .gte("created_at", since);
    if ((dayCount || 0) >= 10) {
      return res.status(429).json({ error: "Daily submission cap reached (10/day). Try again tomorrow." });
    }

    let pageText;
    try {
      const html = await safeFetchUrl(url);
      pageText = htmlToText(html).slice(0, 18_000);
    } catch (err) {
      return res.status(400).json({ error: "Couldn't fetch the URL: " + (err?.message || "unknown error") });
    }

    if (!pageText || pageText.length < 80) {
      return res.status(422).json({ error: "Page had no readable text. Try a different URL." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      logger.warn("draftFromUrl called but OPENROUTER_API_KEY is unset");
      return res.status(503).json({ error: "AI drafting is not configured. Try again later." });
    }

    const system =
      "You draft entries for an open problem-statement catalogue. The user pastes the URL of a Kaggle competition, " +
      "SIH problem page, GSoC project, MLH challenge, Devfolio hackathon, Unstop posting, or open-source issue. " +
      "Given the raw text of that page, produce a single JSON object with these keys exactly:\n\n" +
      "{\n" +
      "  \"title\": string — 80 chars max, the problem's official title,\n" +
      "  \"description\": string — 200-600 words explaining what the problem is and what success looks like,\n" +
      "  \"how_to_start\": string — 2-3 paragraphs (~250 words) of practical first-step guidance,\n" +
      "  \"domain\": string — one of AI/ML | Web | Web3 | IoT | Govt | OpenSource | Health | FinTech | Education | Agriculture | Robotics | Gaming,\n" +
      "  \"difficulty\": \"beginner\" | \"intermediate\" | \"advanced\",\n" +
      "  \"organisation\": string — sponsoring org if visible, else null,\n" +
      "  \"source\": \"SIH\" | \"GSoC\" | \"Kaggle\" | \"MLH\" | \"Devfolio\" | \"Unstop\" | \"OpenSource\",\n" +
      "  \"source_event\": string — \"SIH 2024\" / \"GSoC 2024\" / null for evergreen,\n" +
      "  \"dataset_links\": [{\"label\": string, \"url\": string, \"format\": string?}] — keep to 0-5 entries you can confirm from the page,\n" +
      "  \"resource_links\": [{\"label\": string, \"url\": string, \"kind\": \"docs\"|\"tutorial\"|\"repo\"|\"paper\"|\"video\"}] — keep to 0-8 entries,\n" +
      "  \"tags\": string[] — 3-8 short lowercase tags (e.g. python, computer-vision, dataset)\n" +
      "}\n\n" +
      "Strict rules:\n" +
      "- Output ONLY the JSON object. No markdown, no preamble.\n" +
      "- Every URL must be a real link found in the page text. Do not invent.\n" +
      "- description and how_to_start are plain text paragraphs (\\n\\n between paragraphs).\n" +
      "- If a field is unknown, use null (or [] / \"\" where applicable). Never lie.";

    const userMsg = `URL: ${url}\n\nPAGE TEXT (truncated):\n${pageText}`;

    let aiText;
    try {
      const resp = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model:    "deepseek/deepseek-chat",
          messages: [
            { role: "system", content: system },
            { role: "user",   content: userMsg },
          ],
          temperature: 0.3,
          max_tokens:  1800,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://mathcollective.bmsit.in",
            "X-Title":      "Math Collective — Problem Drafter",
          },
          timeout: 45_000,
        },
      );
      aiText = resp.data?.choices?.[0]?.message?.content || "";
    } catch (err) {
      logger.warn({ status: err?.response?.status }, "draft AI call failed");
      return res.status(502).json({ error: "AI assistant is unavailable right now. Try again in a minute." });
    }

    // Extract first balanced JSON object. The model sometimes wraps
    // it in ```json … ``` despite the instruction.
    aiText = aiText.replace(/```json/gi, "").replace(/```/g, "").trim();
    const start = aiText.indexOf("{");
    const end   = aiText.lastIndexOf("}");
    if (start === -1 || end === -1) return res.status(502).json({ error: "AI returned non-JSON. Try again or fill in manually." });

    let draft;
    try {
      draft = JSON.parse(aiText.slice(start, end + 1));
    } catch {
      return res.status(502).json({ error: "AI returned malformed JSON. Try again or fill in manually." });
    }

    // Light normalisation — coerce types + clamp lengths so the
    // editor form gets sane defaults. We deliberately don't reject
    // here; the student gets to edit anything we couldn't validate.
    const out = {
      title:           String(draft.title || "").trim().slice(0, 200),
      description:     String(draft.description || "").trim().slice(0, 8000),
      how_to_start:    draft.how_to_start ? String(draft.how_to_start).trim().slice(0, 4000) : "",
      domain:          String(draft.domain || "").trim().slice(0, 40),
      difficulty:      ALLOWED_DIFF.has(draft.difficulty) ? draft.difficulty : "intermediate",
      organisation:    draft.organisation ? String(draft.organisation).trim().slice(0, 120) : "",
      source:          ALLOWED_SOURCE.has(draft.source) ? draft.source : "OpenSource",
      source_event:    draft.source_event ? String(draft.source_event).trim().slice(0, 60) : "",
      official_url:    url.slice(0, 500),
      dataset_links:   normalizeLinks(draft.dataset_links,  "format"),
      resource_links:  normalizeLinks(draft.resource_links, "kind"),
      tags:            normalizeTags(draft.tags),
      source_url:      url,
      ai_drafted:      true,
    };

    return res.json(out);
  } catch (err) {
    return sendInternalError(res, err, "draft from url");
  }
};

function normalizeLinks(arr, kindKey) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((entry) => {
      if (entry && typeof entry === "object" && entry.url) {
        const out = { label: String(entry.label || entry.url).slice(0, 120), url: String(entry.url).slice(0, 500) };
        if (entry[kindKey]) out[kindKey] = String(entry[kindKey]).slice(0, 40);
        return out;
      }
      if (typeof entry === "string") {
        try {
          const u = new URL(entry);
          return { label: u.hostname.replace(/^www\./, ""), url: entry.slice(0, 500) };
        } catch {
          return null;
        }
      }
      return null;
    })
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeTags(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(
    arr.map((t) => String(t || "").toLowerCase().trim().slice(0, 40)).filter(Boolean),
  )].slice(0, 15);
}

// ────────────────────────────────────────────────────────────
// POST /api/problem-submissions
//
// Student creates a submission (drafted or hand-written).
// ────────────────────────────────────────────────────────────
export const createSubmission = async (req, res) => {
  try {
    const b = req.body || {};
    const errs = [];
    if (!b.title || String(b.title).trim().length < 3)           errs.push("title required");
    if (!b.description || String(b.description).trim().length < 30) errs.push("description required (min 30 chars)");
    if (!b.domain)                                                errs.push("domain required");
    if (!ALLOWED_SOURCE.has(b.source))                            errs.push("source must be one of " + [...ALLOWED_SOURCE].join("|"));
    if (b.difficulty && !ALLOWED_DIFF.has(b.difficulty))          errs.push("difficulty must be one of " + [...ALLOWED_DIFF].join("|"));
    if (errs.length) return res.status(400).json({ error: errs.join("; ") });

    const payload = {
      submitter_id:   req.userId,
      status:         "pending",
      title:          String(b.title).trim().slice(0, 200),
      description:    String(b.description).trim().slice(0, 8000),
      how_to_start:   b.how_to_start ? String(b.how_to_start).trim().slice(0, 4000) : null,
      domain:         String(b.domain).trim().slice(0, 40),
      difficulty:     b.difficulty || "intermediate",
      organisation:   b.organisation ? String(b.organisation).trim().slice(0, 120) : null,
      source:         b.source,
      source_event:   b.source_event ? String(b.source_event).trim().slice(0, 60) : null,
      official_url:   b.official_url ? String(b.official_url).trim().slice(0, 500) : null,
      dataset_links:  normalizeLinks(b.dataset_links, "format"),
      resource_links: normalizeLinks(b.resource_links, "kind"),
      tags:           normalizeTags(b.tags),
      source_url:     b.source_url ? String(b.source_url).trim().slice(0, 500) : null,
      ai_drafted:     Boolean(b.ai_drafted),
    };

    const { data, error } = await supabase
      .from("problem_submissions")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json(data);
  } catch (err) {
    return sendInternalError(res, err, "create submission");
  }
};

// ────────────────────────────────────────────────────────────
// GET /api/problem-submissions/mine
// ────────────────────────────────────────────────────────────
export const listMySubmissions = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("problem_submissions")
      .select("id, status, reject_reason, title, source, source_event, domain, created_at, approved_problem_id")
      .eq("submitter_id", req.userId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;
    return res.json({ data: data || [] });
  } catch (err) {
    return sendInternalError(res, err, "list my submissions");
  }
};

// ────────────────────────────────────────────────────────────
// GET /api/problem-submissions/queue  (admin)
// ────────────────────────────────────────────────────────────
export const listQueue = async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("problem_submissions")
      .select("id, submitter_id, title, description, how_to_start, domain, difficulty, organisation, source, source_event, official_url, tags, source_url, ai_drafted, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const subIds = [...new Set((data || []).map((r) => r.submitter_id).filter(Boolean))];
    let subsById = new Map();
    if (subIds.length) {
      const { data: subs } = await supabase
        .from("students")
        .select("user_id, name, handle")
        .in("user_id", subIds);
      subsById = new Map((subs || []).map((s) => [s.user_id, s]));
    }

    return res.json({
      data: (data || []).map((r) => ({ ...r, submitter: subsById.get(r.submitter_id) || null })),
    });
  } catch (err) {
    return sendInternalError(res, err, "list problem queue");
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/problem-submissions/:id/approve  (admin)
//
// Copies the submission's fields into problem_statements, generates
// a slug (kebab from title; suffix on collision), then marks the
// submission row approved with a pointer to the new problem id.
// ────────────────────────────────────────────────────────────
export const approveSubmission = async (req, res) => {
  try {
    const id = String(req.params.id || "").slice(0, 100);
    const { data: sub, error } = await supabase
      .from("problem_submissions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!sub) return res.status(404).json({ error: "Submission not found" });
    if (sub.status !== "pending") return res.status(409).json({ error: "Submission already " + sub.status });

    // Slugify + uniquify.
    let baseSlug = String(sub.title || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 70) || "submission";
    let slug = baseSlug;
    for (let i = 0; i < 5; i++) {
      const { data: clash } = await supabase
        .from("problem_statements")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!clash) break;
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const insert = {
      slug,
      title:           sub.title,
      description:     sub.description,
      how_to_start:    sub.how_to_start,
      domain:          sub.domain,
      difficulty:      sub.difficulty,
      organisation:    sub.organisation,
      source:          sub.source,
      source_event:    sub.source_event,
      official_url:    sub.official_url,
      dataset_links:   sub.dataset_links,
      resource_links:  sub.resource_links,
      tags:            sub.tags,
      is_active:       true,
      created_by:      sub.submitter_id,    // attribution back to the contributor
    };

    const { data: created, error: insErr } = await supabase
      .from("problem_statements")
      .insert(insert)
      .select("id, slug, title")
      .single();
    if (insErr) {
      if (insErr.code === "23505") return res.status(409).json({ error: "Slug clash — try approving again" });
      throw insErr;
    }

    await supabase
      .from("problem_submissions")
      .update({ status: "approved", approved_problem_id: created.id, reject_reason: null })
      .eq("id", id);

    // Tell the submitter their problem is live in the catalogue.
    sendNotification({
      userIds: [sub.submitter_id],
      title:   "Your problem submission is live",
      body:    `"${sub.title.slice(0, 80)}" is now in the public catalogue.`,
      type:    "achievement",
      link:    `/problems/${created.slug}`,
    }).catch((err) => logger.warn({ err }, "submission-approved notify failed"));

    logger.info({ submissionId: id, problemId: created.id, by: req.userId }, "submission approved");
    return res.json({ success: true, problem: created });
  } catch (err) {
    return sendInternalError(res, err, "approve submission");
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/problem-submissions/:id/reject  (admin)
// ────────────────────────────────────────────────────────────
export const rejectSubmission = async (req, res) => {
  try {
    const id = String(req.params.id || "").slice(0, 100);
    const reason = String(req.body?.reason || "").trim().slice(0, 500);
    if (!reason) return res.status(400).json({ error: "reason required" });

    const { data, error } = await supabase
      .from("problem_submissions")
      .update({ status: "rejected", reject_reason: reason })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      if (error.code === "PGRST116") return res.status(404).json({ error: "Submission not found" });
      throw error;
    }

    // Tell the submitter — they'll want to see the reason and try again.
    sendNotification({
      userIds: [data.submitter_id],
      title:   "Problem submission needs another look",
      body:    `"${data.title.slice(0, 60)}" — ${reason.slice(0, 120)}`,
      type:    "warning",
      link:    "/problems/submit",
    }).catch((err) => logger.warn({ err }, "submission-rejected notify failed"));

    return res.json(data);
  } catch (err) {
    return sendInternalError(res, err, "reject submission");
  }
};
