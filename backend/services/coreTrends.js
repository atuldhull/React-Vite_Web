/**
 * CORE TRENDS FETCHER
 *
 * Pulls fresh items from a curated set of public RSS feeds (maths,
 * marketing, social media, design, tech) every 4 hours, distils each
 * into a short summary + image, and stores them in `core_trends` for
 * the Core Team portal's "Trends" wall.
 *
 * Best-effort throughout: a dead feed, a parse miss or a missing LLM
 * key never crashes the server — it just yields fewer cards.
 *
 * No RSS library: the feeds are all RSS 2.0 and the tolerant regex
 * parser below is enough. If a feed migrates to Atom, its items just
 * stop appearing until the parser is extended.
 */
import fetch from "node-fetch";
import supabase from "../config/supabase.js";
import { logger } from "../config/logger.js";
import { callLLM } from "../lib/llm.js";

const FOUR_HOURS = 4 * 60 * 60 * 1000;
const KEEP_LATEST = 80;          // prune the wall to the freshest N cards
const PER_FEED    = 6;           // newest N items taken from each feed

/* Curated sources — category drives the portal's filter chips. */
const FEEDS = [
  { category: "Maths",        name: "Quanta Magazine",   url: "https://www.quantamagazine.org/feed/" },
  { category: "Marketing",    name: "Content Marketing", url: "https://contentmarketinginstitute.com/feed/" },
  { category: "Social Media", name: "Social Media Today",url: "https://www.socialmediatoday.com/feeds/news/" },
  { category: "Design",       name: "Smashing Magazine", url: "https://www.smashingmagazine.com/feed/" },
  { category: "Technology",   name: "Ars Technica",      url: "https://feeds.arstechnica.com/arstechnica/index" },
];

/* ── tiny parsing helpers ─────────────────────────────────── */
function stripCdata(s = "") {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}
function decodeEntities(s = "") {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
function stripHtml(s = "") {
  return decodeEntities(stripCdata(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? stripCdata(m[1]).trim() : "";
}
function findImage(block) {
  const patterns = [
    /<media:content[^>]*url="([^"]+)"/i,
    /<media:thumbnail[^>]*url="([^"]+)"/i,
    /<enclosure[^>]*url="([^"]+)"[^>]*type="image/i,
    /<enclosure[^>]*type="image[^>]*url="([^"]+)"/i,
    /<img[^>]*src="([^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = block.match(re);
    if (m && /^https?:\/\//i.test(m[1])) return m[1];
  }
  return null;
}

/**
 * Last-resort image: fetch the article page and pull its og:image
 * (twitter:image / image_src as fallbacks). Used when the RSS item
 * itself didn't carry a media tag. Best-effort, capped at 8 s.
 */
async function fetchOgImage(articleUrl) {
  if (!articleUrl) return null;
  const ctrl = new globalThis.AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(articleUrl, {
      headers: {
        "User-Agent": "AsymptotesCoreBot/1.0 (+club trends)",
        "Accept":     "text/html,application/xhtml+xml",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 60_000); // <head> is always near the top
    const patterns = [
      /<meta[^>]*property=["']og:image(?::secure_url|:url)?["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url|:url)?["']/i,
      /<meta[^>]*name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
      /<link[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m && /^https?:\/\//i.test(m[1])) return m[1];
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch + parse one feed into normalised trend rows. */
async function fetchFeed(feed) {
  // node-fetch v3 dropped the `timeout` option — guard hangs with an
  // AbortController instead so one dead feed can't stall the refresh.
  const ctrl = new globalThis.AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "AsymptotesCoreBot/1.0 (+club trends)" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

    const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
    const items = blocks.slice(0, PER_FEED).map((b) => {
      const link = tag(b, "link") || (b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "");
      const desc = tag(b, "description") || tag(b, "content:encoded");
      const summary = stripHtml(desc).slice(0, 360);
      const pub = tag(b, "pubDate") || tag(b, "published");
      return {
        category:     feed.category,
        title:        stripHtml(tag(b, "title")).slice(0, 240),
        summary:      summary || null,
        image_url:    findImage(b),
        source_url:   link.trim(),
        source_name:  feed.name,
        published_at: pub ? new Date(pub).toISOString() : null,
      };
    }).filter((t) => t.title && t.source_url);

    // For items where the RSS gave us no image, fetch the article and
    // pull its og:image. Done in parallel within the feed; cheap.
    await Promise.all(items.map(async (it) => {
      if (!it.image_url) it.image_url = await fetchOgImage(it.source_url);
    }));

    return items;
  } catch (err) {
    logger.warn({ feed: feed.name, err: err.message }, "coreTrends: feed fetch failed");
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Best-effort: ask the LLM for a one-line "how the club can use this". */
async function enrichClubAngles(rows) {
  if (!rows.length) return;
  try {
    const list = rows.map((r, i) => `${i + 1}. [${r.category}] ${r.title}`).join("\n");
    const { response } = await callLLM({
      mode: "oneshot",
      jsonOnly: true,
      maxTokens: 900,
      messages: [
        {
          role: "system",
          content:
            "You help a college mathematics club (Club Asymptotes) spot ideas. " +
            "For each numbered headline, write ONE short, concrete sentence on how the club " +
            "could use it — an event, a reel, a poster, a workshop or a post. " +
            'Reply as JSON: {"angles":[{"n":1,"angle":"..."}]}',
        },
        { role: "user", content: list },
      ],
    });
    const content = response?.data?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    for (const a of parsed.angles || []) {
      const row = rows[(a.n || 0) - 1];
      if (row && a.angle) row.club_angle = String(a.angle).slice(0, 400);
    }
  } catch (err) {
    logger.warn({ err: err.message }, "coreTrends: club-angle enrichment skipped");
  }
}

/** Fetch every feed, store new items, prune the wall. Returns count added. */
export async function runTrendsFetch() {
  logger.info("coreTrends: refresh starting");
  const all = (await Promise.all(FEEDS.map(fetchFeed))).flat();
  if (!all.length) { logger.warn("coreTrends: nothing fetched"); return 0; }

  // Drop anything we already have (source_url is unique).
  const urls = all.map((t) => t.source_url);
  const { data: known } = await supabase
    .from("core_trends").select("source_url").in("source_url", urls);
  const knownSet = new Set((known || []).map((k) => k.source_url));

  // De-dupe within this batch too, then keep only genuinely new rows.
  const seen = new Set();
  const fresh = all.filter((t) => {
    if (knownSet.has(t.source_url) || seen.has(t.source_url)) return false;
    seen.add(t.source_url);
    return true;
  });

  if (fresh.length) {
    await enrichClubAngles(fresh);
    const { error } = await supabase.from("core_trends").insert(fresh);
    if (error) { logger.error({ err: error }, "coreTrends: insert failed"); return 0; }
  } else {
    logger.info("coreTrends: no new items");
  }

  // Backfill — for rows that landed before image extraction / LLM
  // enrichment was working, fill in the gaps now. Capped per run so
  // a refresh never balloons.
  await backfillMissing();

  // Prune — keep only the freshest KEEP_LATEST cards.
  const { data: rows } = await supabase
    .from("core_trends").select("id").order("fetched_at", { ascending: false });
  if (rows && rows.length > KEEP_LATEST) {
    const stale = rows.slice(KEEP_LATEST).map((r) => r.id);
    await supabase.from("core_trends").delete().in("id", stale);
  }

  logger.info({ added: fresh.length }, "coreTrends: refresh done");
  return fresh.length;
}

/**
 * Walk the existing trend cards and patch in any missing image_url
 * (via og:image) and missing club_angle (via LLM). Bounded to BACKFILL
 * rows per run so even with hundreds of stale cards a refresh stays
 * snappy — repeated runs catch up.
 */
const BACKFILL_PER_RUN = 14;
async function backfillMissing() {
  const { data: gaps } = await supabase
    .from("core_trends")
    .select("id, source_url, title, category, image_url, club_angle")
    .or("image_url.is.null,club_angle.is.null")
    .limit(BACKFILL_PER_RUN);
  if (!gaps?.length) return;

  // 1. og:image for rows missing an image.
  await Promise.all(gaps.map(async (r) => {
    if (r.image_url) return;
    const img = await fetchOgImage(r.source_url);
    if (img) {
      r.image_url = img;
      await supabase.from("core_trends").update({ image_url: img }).eq("id", r.id);
    }
  }));

  // 2. LLM club-angle for rows still missing it.
  const needAngle = gaps.filter((r) => !r.club_angle);
  if (needAngle.length) {
    await enrichClubAngles(needAngle);
    for (const r of needAngle) {
      if (r.club_angle) {
        await supabase.from("core_trends").update({ club_angle: r.club_angle }).eq("id", r.id);
      }
    }
  }
  logger.info({ patched: gaps.length }, "coreTrends: backfill pass complete");
}

/** Start the 4-hourly scheduler. Called once from server.js. */
export function startTrendsScheduler() {
  const tick = async () => {
    try {
      // Only fetch on boot if the wall is empty or older than ~3h, so
      // a dev restart loop doesn't hammer the feeds.
      const { data: newest } = await supabase
        .from("core_trends").select("fetched_at").order("fetched_at", { ascending: false }).limit(1).maybeSingle();
      const ageMs = newest ? Date.now() - new Date(newest.fetched_at).getTime() : Infinity;
      if (ageMs > 3 * 60 * 60 * 1000) await runTrendsFetch();
    } catch (err) {
      logger.error({ err }, "coreTrends: scheduled tick failed");
    }
  };
  logger.info("coreTrends: scheduler started — refresh every 4h");
  tick();
  setInterval(() => { runTrendsFetch().catch(() => {}); }, FOUR_HOURS);
}
