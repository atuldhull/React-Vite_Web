/**
 * OG image generation — Math Collective
 *
 * Three PNG endpoints (1200x630) for social-card unfurls:
 *   GET /og/portfolio/:handle.png
 *   GET /og/problem/:slug.png       (slug OR uuid)
 *   GET /og/roadmap/:slug.png
 *
 * Architecture choice — hand-written SVG + @resvg/resvg-js, NOT satori:
 *   - Three layouts are linear, single-column. Satori's flexbox engine
 *     is overkill and adds ~2 MB + a JSX runtime requirement.
 *   - Hand-SVG lets us slice strings deterministically for text
 *     truncation instead of fighting satori's wrap heuristics.
 *   - resvg-js on its own is ~7 MB platform binary, zero peer deps.
 *
 * Font: one file (latin-700-normal.woff2 from @fontsource/jetbrains-mono,
 * already a project dep) read once at boot. resvg-js ≥ 2.4 accepts
 * WOFF2 directly via fontFiles / fontBuffers.
 *
 * Caching: per-image in-process LRU (200 entries, 6h TTL) layered
 * under Cache-Control: public, max-age=86400. Render's edge + the
 * crawler get a CDN-cached PNG; the LRU saves us on warm-pod hits.
 *
 * Privacy: problem + roadmap have NO public read endpoint. The slim
 * SELECT here exposes ONLY title / source / difficulty / topic /
 * cover_emoji — never description, how_to_start, step bodies, or
 * unapproved roadmaps. Drafts + pending + rejected fall through to
 * the generic fallback PNG.
 *
 * 404 strategy: NEVER 404. Crawlers retry 404s and we lose the
 * unfurl. Every error path renders fallbackPng() — a generic
 * 'Math Collective' card — with status 200.
 */

import path from "path";
import fs from "node:fs";
import { fileURLToPath } from "url";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { Resvg } from "@resvg/resvg-js";
import supabase from "../config/supabase.js";
import { logger } from "../config/logger.js";

// ──────────────────────────────────────────────
// Boot — font + canvas constants
// ──────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const FONT_PATH  = path.resolve(
  __dirname,
  "..", "..",
  "node_modules", "@fontsource", "jetbrains-mono", "files",
  "jetbrains-mono-latin-700-normal.woff2",
);

// Read the font once at module load. If it's missing (someone ran
// `npm install --production` and pruned the dep), fall back to
// system-font lookup so the route still works in dev.
let FONT_BUFFER = null;
try {
  FONT_BUFFER = fs.readFileSync(FONT_PATH);
  logger.info({ bytes: FONT_BUFFER.length }, "og: font loaded");
} catch (err) {
  logger.warn({ err: err.message, FONT_PATH }, "og: font file missing — using system fonts");
}

const CANVAS_W = 1200;
const CANVAS_H = 630;

// Site palette — kept in sync with frontend/src/styles/theme.css
const COL_BG       = "#03070F";
const COL_PANEL    = "#0E162A";
const COL_TEXT     = "#EFF4FF";
const COL_MUTED    = "#9AA9C9";
const COL_DIM      = "#5D6C8D";
const COL_ACCENT   = "#8352FF";
const COL_GLOW     = "#6EE7FF";
const COL_PILL_BG  = "rgba(131, 82, 255, 0.16)";

// ──────────────────────────────────────────────
// Tiny LRU cache (no extra dep)
// ──────────────────────────────────────────────
const CACHE_MAX = 200;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const pngCache = new Map();

function cacheGet(key) {
  const hit = pngCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > CACHE_TTL_MS) { pngCache.delete(key); return null; }
  pngCache.delete(key); pngCache.set(key, hit); // bump recency
  return hit.buf;
}
function cacheSet(key, buf) {
  if (pngCache.size >= CACHE_MAX) {
    const oldest = pngCache.keys().next().value;
    pngCache.delete(oldest);
  }
  pngCache.set(key, { buf, t: Date.now() });
}

// ──────────────────────────────────────────────
// SVG helpers
// ──────────────────────────────────────────────

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(s, n) {
  const str = String(s ?? "").trim();
  return str.length > n ? str.slice(0, n - 1).trimEnd() + "…" : str;
}

/** Wrap a long string across up to maxLines lines of charsPerLine,
 *  truncating the final line with an ellipsis if it still overflows.
 *  Word-aware; falls back to mid-word break for a single oversized word. */
function wrapLines(s, charsPerLine, maxLines) {
  const words = String(s ?? "").trim().split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const probe = cur ? `${cur} ${w}` : w;
    if (probe.length <= charsPerLine) { cur = probe; continue; }
    if (cur) lines.push(cur);
    if (lines.length >= maxLines) break;
    if (w.length > charsPerLine) {
      let rest = w;
      while (rest.length > charsPerLine && lines.length < maxLines) {
        lines.push(rest.slice(0, charsPerLine));
        rest = rest.slice(charsPerLine);
      }
      cur = rest;
    } else {
      cur = w;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && cur && cur.length > charsPerLine) {
    lines[maxLines - 1] = truncate(lines[maxLines - 1], charsPerLine);
  }
  return lines.slice(0, maxLines);
}

function logoMark(x, y) {
  return `
    <g transform="translate(${x},${y})">
      <rect width="60" height="60" rx="14" fill="${COL_ACCENT}"/>
      <text x="30" y="42" font-family="JetBrains Mono" font-size="30" font-weight="700"
            fill="${COL_BG}" text-anchor="middle">MC</text>
    </g>`;
}

function headerBand() {
  return `
    ${logoMark(72, 60)}
    <text x="152" y="100" font-family="JetBrains Mono" font-size="28" font-weight="700"
          fill="${COL_TEXT}">Math Collective</text>
    <text x="152" y="128" font-family="JetBrains Mono" font-size="16" font-weight="700"
          fill="${COL_DIM}">mathcollective.dev</text>`;
}

function backgroundBand() {
  return `
    <defs>
      <radialGradient id="bg" cx="15%" cy="15%" r="90%">
        <stop offset="0%"  stop-color="#1A1240" stop-opacity="0.55"/>
        <stop offset="55%" stop-color="${COL_BG}" stop-opacity="1"/>
      </radialGradient>
      <linearGradient id="accentLine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${COL_ACCENT}"/>
        <stop offset="100%" stop-color="${COL_GLOW}"/>
      </linearGradient>
    </defs>
    <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="${COL_BG}"/>
    <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#bg)"/>
    <rect x="0" y="${CANVAS_H - 8}" width="${CANVAS_W}" height="8" fill="url(#accentLine)"/>`;
}

function renderSvg(body) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">${body}</svg>`;
  const resvg = new Resvg(svg, {
    fitTo:    { mode: "width", value: CANVAS_W },
    background: COL_BG,
    font: FONT_BUFFER
      ? { fontBuffers: [FONT_BUFFER], defaultFontFamily: "JetBrains Mono", loadSystemFonts: false }
      : { loadSystemFonts: true, defaultFontFamily: "sans-serif" },
  });
  return resvg.render().asPng();
}

// ──────────────────────────────────────────────
// Renderers — one per route type
// ──────────────────────────────────────────────

function renderPortfolioPng({ name, handle, headline, emoji, accentColor }) {
  const accent = (typeof accentColor === "string" && /^#[0-9a-f]{3,8}$/i.test(accentColor)) ? accentColor : COL_ACCENT;
  const nameLine    = truncate(name || "Anonymous mathlete", 32);
  const handleLine  = `@${truncate(handle || "unknown", 30)}`;
  const headlineLs  = wrapLines(headline || "Building things at Math Collective.", 50, 2);
  const safeEmoji   = (typeof emoji === "string" && emoji.trim()) ? emoji.trim().slice(0, 4) : "🧑‍🚀";

  const body = `
    ${backgroundBand()}
    ${headerBand()}
    <!-- Avatar disc -->
    <circle cx="180" cy="360" r="96" fill="${accent}" opacity="0.18"/>
    <circle cx="180" cy="360" r="86" fill="${COL_PANEL}" stroke="${accent}" stroke-width="3"/>
    <text x="180" y="388" font-size="82" text-anchor="middle">${esc(safeEmoji)}</text>
    <!-- Name + handle -->
    <text x="310" y="316" font-family="JetBrains Mono" font-size="60" font-weight="700" fill="${COL_TEXT}">${esc(nameLine)}</text>
    <text x="310" y="360" font-family="JetBrains Mono" font-size="28" font-weight="700" fill="${COL_GLOW}">${esc(handleLine)}</text>
    <!-- Headline (2 lines max) -->
    ${headlineLs.map((ln, i) => `<text x="310" y="${418 + i * 38}" font-family="JetBrains Mono" font-size="26" font-weight="700" fill="${COL_MUTED}">${esc(ln)}</text>`).join("")}`;

  return renderSvg(body);
}

function pill(x, y, label, fillBg, fillText) {
  const text = truncate(label, 26);
  const w    = Math.max(120, text.length * 16 + 36);
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="44" rx="22" fill="${fillBg}"/>
      <text x="${x + w / 2}" y="${y + 30}" font-family="JetBrains Mono" font-size="20" font-weight="700"
            fill="${fillText}" text-anchor="middle">${esc(text)}</text>
    </g>`;
}

function renderProblemPng({ title, source, difficulty }) {
  const titleLines = wrapLines(title || "Untitled problem", 38, 3);
  const srcPill    = source     ? pill(72, 350, source.toUpperCase(), COL_ACCENT, COL_BG) : "";
  const diffPill   = difficulty ? pill(72 + (source ? 230 : 0), 350, difficulty, COL_PILL_BG, COL_GLOW) : "";

  const body = `
    ${backgroundBand()}
    ${headerBand()}
    <text x="72" y="230" font-family="JetBrains Mono" font-size="20" font-weight="700" fill="${COL_DIM}">PROBLEM STATEMENT</text>
    ${srcPill}
    ${diffPill}
    ${titleLines.map((ln, i) => `<text x="72" y="${452 + i * 56}" font-family="JetBrains Mono" font-size="48" font-weight="700" fill="${COL_TEXT}">${esc(ln)}</text>`).join("")}`;

  return renderSvg(body);
}

function renderRoadmapPng({ title, topic, stepCount, coverEmoji }) {
  const titleLines = wrapLines(title || "Untitled roadmap", 30, 3);
  const safeEmoji  = (typeof coverEmoji === "string" && coverEmoji.trim()) ? coverEmoji.trim().slice(0, 4) : "🗺️";
  const stepLabel  = `${Math.max(0, Number(stepCount) || 0)} step${stepCount === 1 ? "" : "s"}`;
  const topicPill  = topic     ? pill(72, 510, topic, COL_PILL_BG, COL_GLOW)        : "";
  const stepsPill  = pill(72 + (topic ? 280 : 0), 510, stepLabel, COL_ACCENT, COL_BG);

  const body = `
    ${backgroundBand()}
    ${headerBand()}
    <text x="72" y="230" font-family="JetBrains Mono" font-size="20" font-weight="700" fill="${COL_DIM}">LEARNING ROADMAP</text>
    <!-- Big cover emoji on the right -->
    <text x="1060" y="360" font-size="180" text-anchor="middle">${esc(safeEmoji)}</text>
    ${titleLines.map((ln, i) => `<text x="72" y="${300 + i * 56}" font-family="JetBrains Mono" font-size="48" font-weight="700" fill="${COL_TEXT}">${esc(ln)}</text>`).join("")}
    ${topicPill}
    ${stepsPill}`;

  return renderSvg(body);
}

function fallbackPng() {
  const body = `
    ${backgroundBand()}
    ${headerBand()}
    <text x="600" y="360" font-family="JetBrains Mono" font-size="64" font-weight="700" fill="${COL_TEXT}" text-anchor="middle">Math Collective</text>
    <text x="600" y="420" font-family="JetBrains Mono" font-size="26" font-weight="700" fill="${COL_MUTED}" text-anchor="middle">Competitive math for university students</text>`;
  return renderSvg(body);
}

// ──────────────────────────────────────────────
// Cached fallback — generated ONCE at boot so the
// hot-path 404 doesn't pay resvg cost on every miss.
// ──────────────────────────────────────────────
let FALLBACK_BUF = null;
try {
  FALLBACK_BUF = fallbackPng();
  logger.info({ bytes: FALLBACK_BUF.length }, "og: fallback png pre-rendered");
} catch (err) {
  logger.error({ err: err.message }, "og: fallback png pre-render FAILED — will render lazily");
}
function getFallback() {
  if (FALLBACK_BUF) return FALLBACK_BUF;
  try { FALLBACK_BUF = fallbackPng(); return FALLBACK_BUF; }
  catch { return Buffer.alloc(0); }
}

// ──────────────────────────────────────────────
// Common response helper
// ──────────────────────────────────────────────
function sendPng(res, buf, { status = 200 } = {}) {
  res.status(status);
  res.set("Content-Type", "image/png");
  res.set("Cache-Control", "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Length", String(buf.length));
  return res.send(buf);
}

// ──────────────────────────────────────────────
// Router
// ──────────────────────────────────────────────
const router = Router();

// Stricter rate limit than the api-wide one — /og is un-authed, un-CSRFed,
// and a single LinkedIn unfurl spider can hit ten variants in a second.
// 60 req/min/IP is plenty for legit crawlers but kills a scrape loop.
const ogLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             60,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (_req, res) => sendPng(res, getFallback(), { status: 200 }),
});
router.use(ogLimiter);

// ── /og/portfolio/:handle.png ──────────────────────────────
router.get("/portfolio/:handle.png", async (req, res) => {
  try {
    const handle = String(req.params.handle || "").trim().toLowerCase().slice(0, 80);
    if (!handle || !/^[a-z0-9-]+$/.test(handle)) return sendPng(res, getFallback());

    const key = `portfolio:${handle}`;
    const cached = cacheGet(key);
    if (cached) return sendPng(res, cached);

    const { data: student } = await supabase
      .from("students")
      .select("name, handle, avatar_emoji, avatar_color, portfolio_headline, public_portfolio, is_active")
      .eq("handle", handle)
      .maybeSingle();

    if (!student || !student.public_portfolio || student.is_active === false) {
      return sendPng(res, getFallback());
    }

    const buf = renderPortfolioPng({
      name:        student.name,
      handle:      student.handle,
      headline:    student.portfolio_headline,
      emoji:       student.avatar_emoji,
      accentColor: student.avatar_color,
    });
    cacheSet(key, buf);
    return sendPng(res, buf);
  } catch (err) {
    logger.error({ err: err.message, handle: req.params.handle }, "og portfolio render failed");
    return sendPng(res, getFallback());
  }
});

// ── /og/problem/:slug.png ──────────────────────────────────
router.get("/problem/:slug.png", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim().slice(0, 100);
    if (!slug) return sendPng(res, getFallback());

    const key = `problem:${slug.toLowerCase()}`;
    const cached = cacheGet(key);
    if (cached) return sendPng(res, cached);

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    const col    = isUuid ? "id" : "slug";

    // Slim SELECT — title + source + difficulty ONLY.
    const { data } = await supabase
      .from("problem_statements")
      .select("title, source, difficulty")
      .eq(col, slug)
      .eq("is_active", true)
      .maybeSingle();

    if (!data) return sendPng(res, getFallback());

    const buf = renderProblemPng(data);
    cacheSet(key, buf);
    return sendPng(res, buf);
  } catch (err) {
    logger.error({ err: err.message, slug: req.params.slug }, "og problem render failed");
    return sendPng(res, getFallback());
  }
});

// ── /og/roadmap/:slug.png ──────────────────────────────────
router.get("/roadmap/:slug.png", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim().slice(0, 100);
    if (!slug) return sendPng(res, getFallback());

    const key = `roadmap:${slug.toLowerCase()}`;
    const cached = cacheGet(key);
    if (cached) return sendPng(res, cached);

    // Slim SELECT — title + topic + cover_emoji + submission_status.
    const { data: roadmap } = await supabase
      .from("roadmaps")
      .select("id, title, topic, cover_emoji, submission_status, is_active")
      .eq("slug", slug)
      .maybeSingle();

    if (!roadmap || !roadmap.is_active || roadmap.submission_status !== "approved") {
      return sendPng(res, getFallback());
    }

    const { count } = await supabase
      .from("roadmap_steps")
      .select("id", { count: "exact", head: true })
      .eq("roadmap_id", roadmap.id);

    const buf = renderRoadmapPng({
      title:      roadmap.title,
      topic:      roadmap.topic,
      stepCount:  count || 0,
      coverEmoji: roadmap.cover_emoji,
    });
    cacheSet(key, buf);
    return sendPng(res, buf);
  } catch (err) {
    logger.error({ err: err.message, slug: req.params.slug }, "og roadmap render failed");
    return sendPng(res, getFallback());
  }
});

export default router;
