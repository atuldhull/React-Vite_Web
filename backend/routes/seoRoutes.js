/**
 * SEO surface — /robots.txt + /sitemap.xml.
 *
 * Both routes are mounted at the ROOT (not under /api) and registered
 * BEFORE express.static so they shadow the stale public/sitemap.xml
 * and public/robots.txt files that shipped with the marketing pages.
 *
 * /sitemap.xml is dynamic — it enumerates every public_portfolio
 * student, every active problem statement, and every approved
 * roadmap. The output is cached in-process for one hour because
 * crawlers fan out (one Googlebot crawl can pull the sitemap dozens
 * of times in a few minutes) and the Supabase trips are pure waste
 * on each repeat hit. Render's free tier dynos restart often, so
 * the cache warms back up cheaply.
 *
 * No SDK needed — sitemap.xml is plain XML and the row counts in
 * play (~1K students max, 365 problems, ~10 roadmaps) are nowhere
 * near the 50K-url / 50MB sitemap-spec ceiling.
 */

import express from "express";
import supabase from "../config/supabase.js";
import { logger } from "../config/logger.js";

const router = express.Router();

// 1 hour. Matches the Cache-Control max-age we tell the crawler about,
// so an origin hit and a cached hit look the same to the bot.
const CACHE_TTL_MS = 60 * 60 * 1000;

// Static marketing pages on the SPA.
const STATIC_PAGES = [
  { path: "/",            priority: "1.0", changefreq: "weekly" },
  { path: "/leaderboard", priority: "0.7", changefreq: "weekly" },
  { path: "/events",      priority: "0.7", changefreq: "weekly" },
  { path: "/gallery",     priority: "0.7", changefreq: "weekly" },
  { path: "/contact",     priority: "0.7", changefreq: "weekly" },
  { path: "/verify",      priority: "0.7", changefreq: "weekly" },
];

// In-process cache. One process per Render dyno, so this is correct
// without coordination. The body+expiresAt pair survives across
// concurrent requests because Node is single-threaded per loop tick.
let sitemapCache = { body: null, expiresAt: 0 };

/** Resolve the public origin without a trailing slash. */
function resolveBase() {
  const raw = process.env.FRONTEND_URL
           || process.env.PUBLIC_URL
           || "https://math-collective.onrender.com";
  return raw.replace(/\/$/, "");
}

/** XML-escape a string for safe inclusion in <loc>. Slugs / handles are
 *  already kebab-validated upstream so this is belt-and-braces. */
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** ISO-8601 date (YYYY-MM-DD) for <lastmod>. */
function toLastmod(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Pull the three dynamic url-sets in parallel. Each query selects ONLY
 *  the public columns; we never expose description / how_to_start /
 *  step bodies even by accident. */
async function loadDynamicRows() {
  const [studentsRes, problemsRes, roadmapsRes] = await Promise.all([
    supabase
      .from("students")
      .select("handle, last_seen_at")
      .eq("public_portfolio", true)
      .eq("is_active", true)
      .not("handle", "is", null),
    supabase
      .from("problem_statements")
      .select("slug, updated_at")
      .eq("is_active", true)
      .not("slug", "is", null),
    supabase
      .from("roadmaps")
      .select("slug, updated_at, is_featured, submission_status")
      .eq("is_active", true)
      .eq("submission_status", "approved")
      .not("slug", "is", null),
  ]);

  if (studentsRes.error)  throw studentsRes.error;
  if (problemsRes.error)  throw problemsRes.error;
  if (roadmapsRes.error)  throw roadmapsRes.error;

  return {
    students: studentsRes.data || [],
    problems: problemsRes.data || [],
    roadmaps: roadmapsRes.data || [],
  };
}

/** Build the full sitemap XML string. Pure function over inputs so
 *  it's trivially unit-testable. */
function renderSitemap(base, rows) {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

  // Most recent DB timestamp across all dynamic sets — a reasonable
  // "the site changed" stamp for the static marketing pages.
  const allStamps = [
    ...rows.students.map((r) => r.last_seen_at),
    ...rows.problems.map((r) => r.updated_at),
    ...rows.roadmaps.map((r) => r.updated_at),
  ].filter(Boolean);
  const siteLastmod = allStamps.length
    ? toLastmod(allStamps.sort().reverse()[0])
    : new Date().toISOString().slice(0, 10);

  // ── Static marketing pages — SPA lives at /app/
  for (const p of STATIC_PAGES) {
    const loc = p.path === "/" ? `${base}/app/` : `${base}/app${p.path}`;
    lines.push("  <url>");
    lines.push(`    <loc>${xmlEscape(loc)}</loc>`);
    lines.push(`    <lastmod>${siteLastmod}</lastmod>`);
    lines.push(`    <changefreq>${p.changefreq}</changefreq>`);
    lines.push(`    <priority>${p.priority}</priority>`);
    lines.push("  </url>");
  }

  // ── Public portfolios — /u/:handle (server-rendered share target)
  for (const s of rows.students) {
    if (!s.handle) continue;
    lines.push("  <url>");
    lines.push(`    <loc>${xmlEscape(`${base}/u/${s.handle}`)}</loc>`);
    const lm = toLastmod(s.last_seen_at);
    if (lm) lines.push(`    <lastmod>${lm}</lastmod>`);
    lines.push("    <changefreq>monthly</changefreq>");
    lines.push("    <priority>0.6</priority>");
    lines.push("  </url>");
  }

  // ── Problem statements — /app/problems/:slug
  for (const p of rows.problems) {
    if (!p.slug) continue;
    lines.push("  <url>");
    lines.push(`    <loc>${xmlEscape(`${base}/app/problems/${p.slug}`)}</loc>`);
    const lm = toLastmod(p.updated_at);
    if (lm) lines.push(`    <lastmod>${lm}</lastmod>`);
    lines.push("    <changefreq>monthly</changefreq>");
    lines.push("    <priority>0.7</priority>");
    lines.push("  </url>");
  }

  // ── Roadmaps — approved tier only
  for (const r of rows.roadmaps) {
    if (!r.slug) continue;
    lines.push("  <url>");
    lines.push(`    <loc>${xmlEscape(`${base}/app/roadmaps/${r.slug}`)}</loc>`);
    const lm = toLastmod(r.updated_at);
    if (lm) lines.push(`    <lastmod>${lm}</lastmod>`);
    lines.push("    <changefreq>monthly</changefreq>");
    lines.push("    <priority>0.6</priority>");
    lines.push("  </url>");
  }

  lines.push("</urlset>");
  return lines.join("\n");
}

/** Build robots.txt. */
function renderRobots(base) {
  return [
    "# Math Collective — competitive mathematics platform for BMSIT.",
    "# Public marketing + share targets are crawl-friendly so search",
    "# engines can index them. Authenticated app routes are intentionally",
    "# blocked — crawlers only see the loading shell or get redirected to",
    "# /login, which dilutes search-result quality.",
    "User-agent: *",
    "Allow: /",
    "",
    "# Locked-down API + authenticated SPA surfaces",
    "Disallow: /api/",
    "Disallow: /app/dashboard",
    "Disallow: /app/profile",
    "Disallow: /app/arena",
    "Disallow: /app/admin",
    "Disallow: /app/teacher",
    "Disallow: /app/quiz",
    "Disallow: /app/notifications",
    "Disallow: /app/core",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
}

// ── Routes ────────────────────────────────────────────────────

router.get("/robots.txt", (_req, res) => {
  const body = renderRobots(resolveBase());
  res.set("Cache-Control", "public, max-age=3600");
  res.type("text/plain").send(body);
});

router.get("/sitemap.xml", async (_req, res) => {
  try {
    const now = Date.now();
    if (sitemapCache.body && sitemapCache.expiresAt > now) {
      res.set("Cache-Control", "public, max-age=3600");
      res.type("application/xml").send(sitemapCache.body);
      return;
    }

    const base = resolveBase();
    const rows = await loadDynamicRows();
    const body = renderSitemap(base, rows);

    sitemapCache = { body, expiresAt: now + CACHE_TTL_MS };

    res.set("Cache-Control", "public, max-age=3600");
    res.type("application/xml").send(body);
  } catch (err) {
    logger.error({ err }, "failed to render sitemap.xml");
    // Stale-while-error: if we have ANY previously cached body, ship it
    // rather than 500ing — a crawler getting a 5xx repeatedly will drop
    // urls from the index. Fresh boot with no cache + DB outage still 500s.
    if (sitemapCache.body) {
      res.set("Cache-Control", "public, max-age=300");
      res.type("application/xml").send(sitemapCache.body);
      return;
    }
    res.status(500).type("text/plain").send("sitemap unavailable");
  }
});

export default router;

// Exported for unit tests.
export { renderSitemap, renderRobots, resolveBase, toLastmod };
