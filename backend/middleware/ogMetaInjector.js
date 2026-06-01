/**
 * ogMetaInjector.js
 *
 * Crawler-safe Open Graph + Twitter Card meta-tag injection for the
 * three public share targets:
 *   GET /u/:handle              (portfolio)
 *   GET /problems/:slug         (alias of /app/problems/:slug)
 *   GET /app/problems/:slug     (canonical, router lives under /app/)
 *   GET /roadmaps/:slug         (alias)
 *   GET /app/roadmaps/:slug     (canonical)
 *
 * WHY MIDDLEWARE, NOT A CRAWLER SNIFF:
 *   LinkedIn, Twitter, Facebook, Discord, Slack, Telegram do NOT
 *   execute JavaScript, so React-Helmet meta tags never reach them.
 *   User-Agent sniffing is unreliable + a maintenance burden, so we
 *   serve the SAME personalised HTML to bots AND real users — the
 *   SPA re-renders identical content client-side, no flicker.
 *
 * WHY READ-ONCE-AT-BOOT:
 *   Today the SPA fallback does `res.sendFile(SPA_INDEX)` per request →
 *   one fs.createReadStream syscall per hit. We read the file ONCE
 *   with fs.readFileSync at module load, cache the buffer, and do a
 *   string-replace in memory per request. Net latency ~0.1 ms.
 *
 * WHY SAFE FIELDS ONLY:
 *   /problems/:slug and /roadmaps/:slug are normally auth-gated (see
 *   backend/routes/problemRoutes.js — `router.use(requireAuth)`).
 *   Crawlers are NOT authed, so the meta block can only contain
 *   fields that are already shown on the public listing cards:
 *     problems  → title, source, difficulty, organisation
 *     roadmaps  → title, summary, topic, difficulty
 *   We NEVER inject description, how_to_start, or step bodies.
 */

import path from "path";
import fs   from "node:fs";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";

import supabase from "../config/supabase.js";
import { logger } from "../config/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const SPA_INDEX    = path.join(PROJECT_ROOT, "public", "app", "index.html");

/* ── Boot-time cache ──
   Read the SPA shell ONCE. If the build pipeline rewrites this file
   (Vite re-emits index.html on every prod build), the server has
   already been restarted by Render so the cache is fresh. */
let cachedHtml = "";
try {
  cachedHtml = fs.readFileSync(SPA_INDEX, "utf8");
  logger.info({ bytes: cachedHtml.length, path: SPA_INDEX }, "og-meta injector cached index.html");
} catch (err) {
  logger.error({ err, path: SPA_INDEX }, "og-meta injector: failed to read index.html — injection disabled");
}

/* ── Regex for the static OG/Twitter block ──
   Swaps the WHOLE block from the first `<meta property="og:type"` line
   through the last `twitter:image` line. Compiled once, matched
   per-request. If the placeholder regex misses (e.g. a future
   index.html edit removed the block) we silently serve the cached
   HTML unchanged — better than 500ing a share-target. */
const META_BLOCK_RE = /<meta\s+property="og:type"[\s\S]*?<meta\s+name="twitter:image"[^>]*>/i;

if (cachedHtml && !META_BLOCK_RE.test(cachedHtml)) {
  logger.warn("og-meta injector: META_BLOCK_RE did not match cached index.html — per-route injection will be a no-op until a build re-emits the block");
}

/* ── Minimal HTML escaper. We only inject inside `content="..."`
   attributes, so escaping &, <, >, " is sufficient. */
function esc(input) {
  return String(input == null ? "" : input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Trim + cap length so a 4KB bio doesn't blow up the meta tag.
   Facebook truncates og:description at ~300; LinkedIn at ~200. */
function clamp(s, n = 200) {
  const str = String(s || "").trim().replace(/\s+/g, " ");
  if (str.length <= n) return str;
  return str.slice(0, n - 1).trimEnd() + "…";
}

/* Resolve the absolute origin for og:image URLs. FRONTEND_URL is
   validated as a URL upstream in production; in dev / tests it may
   be missing — fall back to req.protocol + req.get('host')
   (trust-proxy=1 makes both honest behind Render). */
function originFor(req) {
  const fromEnv = process.env.FRONTEND_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

/* Build the replacement <meta> block. All values pre-escaped. */
function buildMetaBlock({ title, description, image, url, type = "website" }) {
  return [
    `<meta property="og:type"          content="${esc(type)}" />`,
    `<meta property="og:site_name"     content="Math Collective" />`,
    `<meta property="og:title"         content="${esc(title)}" />`,
    `<meta property="og:description"   content="${esc(description)}" />`,
    `<meta property="og:url"           content="${esc(url)}" />`,
    `<meta property="og:image"         content="${esc(image)}" />`,
    `<meta property="og:image:width"   content="1200" />`,
    `<meta property="og:image:height"  content="630" />`,
    `<meta name="twitter:card"         content="summary_large_image" />`,
    `<meta name="twitter:title"        content="${esc(title)}" />`,
    `<meta name="twitter:description"  content="${esc(description)}" />`,
    `<meta name="twitter:image"        content="${esc(image)}" />`,
  ].join("\n    ");
}

/* Swap the OG block in the cached HTML. If the regex misses we
   serve cached HTML unchanged — never 500. */
function renderWithMeta(metaBlock) {
  if (!cachedHtml) return null;
  if (!META_BLOCK_RE.test(cachedHtml)) return cachedHtml;
  return cachedHtml.replace(META_BLOCK_RE, metaBlock);
}

/* Per-route rate limit. /u, /problems, /roadmaps share-target paths
   sit OUTSIDE /api/ so generalLimiter doesn't cover them. 60/min/IP
   is generous for human share traffic but throttles a bot crawling
   handles in series. */
const shareLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             60,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (_req, res) => res.status(429).type("html").send(cachedHtml || ""),
});

/* ──────────────────────────────────────────────────────────────
   ROUTE 1 — /u/:handle
   Public, no auth. Inject only when public_portfolio = true.
   When the handle is opted-out or unknown we serve the cached
   HTML UNCHANGED so we don't leak handle existence to a crawler.
   ────────────────────────────────────────────────────────────── */
async function handlePortfolio(req, res) {
  const handle = String(req.params.handle || "").trim().toLowerCase().slice(0, 80);
  if (!handle || !/^[a-z0-9-]+$/.test(handle) || !cachedHtml) {
    return res.type("html").send(cachedHtml || "");
  }

  try {
    const { data } = await supabase
      .from("students")
      .select("handle, name, title, bio, portfolio_headline, public_portfolio, is_active")
      .eq("handle", handle)
      .maybeSingle();

    if (!data || !data.public_portfolio || data.is_active === false) {
      return res.type("html").send(cachedHtml);
    }

    const origin = originFor(req);
    const title = data.name
      ? `${data.name} — Math Collective`
      : `@${data.handle} — Math Collective`;
    const description = clamp(
      data.portfolio_headline ||
      data.bio ||
      `${data.name || data.handle}'s portfolio on Math Collective.`,
    );
    const html = renderWithMeta(buildMetaBlock({
      title,
      description,
      image: `${origin}/og/portfolio/${encodeURIComponent(data.handle)}.png`,
      url:   `${origin}/u/${encodeURIComponent(data.handle)}`,
      type:  "profile",
    }));
    res.type("html").send(html || cachedHtml);
  } catch (err) {
    logger.warn({ err, handle }, "og-meta /u/:handle lookup failed — serving plain index");
    res.type("html").send(cachedHtml);
  }
}

/* ──────────────────────────────────────────────────────────────
   ROUTE 2 — /problems/:slug + /app/problems/:slug
   Auth-gated API. Only safe-to-share fields go into meta tags.
   ────────────────────────────────────────────────────────────── */
async function handleProblem(req, res) {
  const slug = String(req.params.slug || "").trim().toLowerCase().slice(0, 100);
  if (!slug || !cachedHtml) {
    return res.type("html").send(cachedHtml || "");
  }

  try {
    // SAFE COLUMNS ONLY. NOT description / how_to_start.
    const { data } = await supabase
      .from("problem_statements")
      .select("slug, title, source, difficulty, organisation, source_event")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (!data) return res.type("html").send(cachedHtml);

    const origin = originFor(req);
    const title = `${data.title} — Math Collective`;
    const descParts = [
      data.source,
      data.source_event,
      data.organisation,
      data.difficulty ? `${data.difficulty} difficulty` : null,
    ].filter(Boolean);
    const description = clamp(
      descParts.length
        ? `${descParts.join(" · ")}. Solve it on Math Collective.`
        : "Problem statement on Math Collective.",
    );
    const html = renderWithMeta(buildMetaBlock({
      title,
      description,
      image: `${origin}/og/problem/${encodeURIComponent(data.slug)}.png`,
      url:   `${origin}/app/problems/${encodeURIComponent(data.slug)}`,
      type:  "article",
    }));
    res.type("html").send(html || cachedHtml);
  } catch (err) {
    logger.warn({ err, slug }, "og-meta /problems/:slug lookup failed — serving plain index");
    res.type("html").send(cachedHtml);
  }
}

/* ──────────────────────────────────────────────────────────────
   ROUTE 3 — /roadmaps/:slug + /app/roadmaps/:slug
   Auth-gated API. Approved + active only. Safe fields only.
   ────────────────────────────────────────────────────────────── */
async function handleRoadmap(req, res) {
  const slug = String(req.params.slug || "").trim().toLowerCase().slice(0, 100);
  if (!slug || !cachedHtml) {
    return res.type("html").send(cachedHtml || "");
  }

  try {
    const { data } = await supabase
      .from("roadmaps")
      .select("slug, title, summary, topic, difficulty, submission_status, is_active")
      .eq("slug", slug)
      .eq("is_active", true)
      .eq("submission_status", "approved")
      .maybeSingle();

    if (!data) return res.type("html").send(cachedHtml);

    const origin = originFor(req);
    const title = `${data.title} — Math Collective`;
    const descParts = [
      data.topic,
      data.difficulty ? `${data.difficulty} difficulty` : null,
    ].filter(Boolean);
    const description = clamp(
      data.summary ||
      (descParts.length
        ? `${descParts.join(" · ")}. Learning roadmap on Math Collective.`
        : "Learning roadmap on Math Collective."),
    );
    const html = renderWithMeta(buildMetaBlock({
      title,
      description,
      image: `${origin}/og/roadmap/${encodeURIComponent(data.slug)}.png`,
      url:   `${origin}/app/roadmaps/${encodeURIComponent(data.slug)}`,
      type:  "article",
    }));
    res.type("html").send(html || cachedHtml);
  } catch (err) {
    logger.warn({ err, slug }, "og-meta /roadmaps/:slug lookup failed — serving plain index");
    res.type("html").send(cachedHtml);
  }
}

/* ──────────────────────────────────────────────────────────────
   MOUNT REGISTRAR
   Call this from createApp() AFTER express.static(PUBLIC_DIR) and
   BEFORE the SPA fallback. Order matters — static must win for
   /app/assets/* and we must run before the catch-all sendFile.
   ────────────────────────────────────────────────────────────── */
export function registerOgMetaRoutes(app) {
  if (!cachedHtml) {
    logger.warn("og-meta injector not mounted — cachedHtml is empty");
    return;
  }
  app.get("/u/:handle",            shareLimiter, handlePortfolio);
  app.get("/problems/:slug",       shareLimiter, handleProblem);
  app.get("/app/problems/:slug",   shareLimiter, handleProblem);
  app.get("/roadmaps/:slug",       shareLimiter, handleRoadmap);
  app.get("/app/roadmaps/:slug",   shareLimiter, handleRoadmap);
  logger.info("og-meta injector mounted (/u, /problems, /roadmaps + /app aliases)");
}

/* Test hooks. */
export const __test = { esc, clamp, buildMetaBlock, renderWithMeta, META_BLOCK_RE };
