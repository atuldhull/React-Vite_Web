/**
 * scripts/seedProblems.js — bulk-import problem statements from CSV.
 *
 * USAGE
 *   node backend/scripts/seedProblems.js <path-to-csv>
 *
 *   # examples
 *   node backend/scripts/seedProblems.js data/sih-2024.csv
 *   node backend/scripts/seedProblems.js data/gsoc-2024.csv
 *
 * CSV FORMAT (header row required)
 *   title          required
 *   description    required — full problem text
 *   how_to_start   optional — the 2-3 paragraph getting-started guide
 *   domain         required — AI/ML | Web | Web3 | IoT | Govt | OpenSource | ...
 *   difficulty     required — beginner | intermediate | advanced
 *   organisation   optional — the sponsor / posting org
 *   source         required — SIH | GSoC | Kaggle | MLH | Devfolio | Unstop | OpenSource
 *   source_event   optional — "SIH 2024" / "GSoC 2024" / blank for evergreen
 *   official_url   optional — canonical page
 *   dataset_links  optional — pipe-separated "label||url||format" tuples
 *                  e.g.  "FFHQ dataset||https://...||images | London Smart||https://...||csv"
 *   resource_links optional — same shape but with "kind" instead of "format"
 *                  e.g.  "MediaPipe Hands||https://...||docs | PyTorch tutorial||https://...||tutorial"
 *   tags           optional — comma-separated  e.g. "python,pytorch,cv"
 *   slug           optional — auto-generated from title when blank
 *
 * IDEMPOTENT — every INSERT goes through ON CONFLICT (slug) DO NOTHING.
 * Re-running with the same CSV is a no-op. Re-running with a CSV that
 * has new rows + repeats existing slugs picks up just the new ones.
 *
 * SOURCES to seed the 1000+ from
 *   SIH    : https://www.sih.gov.in/sih2024PS  (per-year PS list)
 *   GSoC   : https://summerofcode.withgoogle.com/programs/2024  (orgs page)
 *   Kaggle : https://www.kaggle.com/competitions  (each comp + dataset)
 *   MLH    : https://mlh.io/prizes              (recurring sponsor challenges)
 *   Devfolio: https://devfolio.co/projects      (search by hackathon)
 *   Unstop  : https://unstop.com/hackathons     (filter by company)
 *
 * The fastest path to 1000+: dump each event's problem-statement
 * page as HTML, run a small Python/Node scraper that yields a row
 * per problem, save as CSV, run this script.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Resolve .env.local from repo root so the script can be invoked
// from anywhere via the absolute path printed in USAGE above.
const repoRoot = path.resolve(__dirname, "..", "..");
try {
  // dotenv is a regular dep — if missing, env vars must come from
  // the shell (CI invocation pattern). Soft-import.
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(repoRoot, ".env.local") });
} catch {
  // ignore — env is expected from the shell
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("USAGE: node backend/scripts/seedProblems.js <path-to-csv>");
  process.exit(1);
}
if (!fs.existsSync(csvPath)) {
  console.error(`File not found: ${csvPath}`);
  process.exit(1);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required in env");
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Parse the CSV ────────────────────────────────────────────────
const raw = fs.readFileSync(csvPath, "utf8");
const rows = parse(raw, {
  columns: true,           // first row = header
  skip_empty_lines: true,
  trim: true,
  relax_quotes: true,
});

if (rows.length === 0) {
  console.error("CSV has no data rows");
  process.exit(1);
}

console.log(`Parsed ${rows.length} rows from ${csvPath}`);

// ── Transform CSV rows → DB shape ────────────────────────────────
const ALLOWED_SOURCE = new Set(["SIH", "GSoC", "Kaggle", "MLH", "Devfolio", "Unstop", "OpenSource"]);
const ALLOWED_DIFF   = new Set(["beginner", "intermediate", "advanced"]);

function slugify(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

// Parse "label||url||format" tuples separated by " | " into the
// jsonb array shape the table expects. Tolerant — drops any tuple
// missing label or url.
function parseLinks(field, kindKey) {
  if (!field) return [];
  return String(field)
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [label, url, kind] = entry.split("||").map((p) => (p || "").trim());
      if (!label || !url) return null;
      const out = { label, url };
      if (kind) out[kindKey] = kind;
      return out;
    })
    .filter(Boolean);
}

const records = [];
const errors  = [];
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const lineNo = i + 2;     // +1 for header, +1 for 1-indexing
  const errs = [];
  if (!r.title)       errs.push("title missing");
  if (!r.description) errs.push("description missing");
  if (!r.domain)      errs.push("domain missing");
  if (!r.source || !ALLOWED_SOURCE.has(r.source)) errs.push(`source must be one of ${[...ALLOWED_SOURCE].join("|")}`);
  if (r.difficulty && !ALLOWED_DIFF.has(r.difficulty)) errs.push(`difficulty must be one of ${[...ALLOWED_DIFF].join("|")}`);

  if (errs.length) {
    errors.push({ line: lineNo, title: r.title || "(no title)", errs });
    continue;
  }

  records.push({
    slug:           r.slug?.trim() || slugify(r.title),
    title:          r.title.trim(),
    description:    r.description.trim(),
    how_to_start:   r.how_to_start?.trim() || null,
    domain:         r.domain.trim(),
    difficulty:     r.difficulty?.trim() || "intermediate",
    organisation:   r.organisation?.trim() || null,
    source:         r.source.trim(),
    source_event:   r.source_event?.trim() || null,
    official_url:   r.official_url?.trim() || null,
    dataset_links:  parseLinks(r.dataset_links,  "format"),
    resource_links: parseLinks(r.resource_links, "kind"),
    tags:           (r.tags || "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 15),
    is_active:      true,
  });
}

if (errors.length) {
  console.log(`\n${errors.length} row(s) had errors and were skipped:`);
  for (const e of errors) {
    console.log(`  line ${e.line}: ${e.title}`);
    for (const msg of e.errs) console.log(`    - ${msg}`);
  }
}

if (records.length === 0) {
  console.log("No valid rows to insert. Exiting.");
  process.exit(errors.length ? 1 : 0);
}

// ── Insert in chunks of 100 so a single bad row doesn't take out
// ── the whole batch.
const BATCH = 100;
let inserted = 0;
let skipped  = 0;

for (let i = 0; i < records.length; i += BATCH) {
  const chunk = records.slice(i, i + BATCH);
  const { data, error } = await supabase
    .from("problem_statements")
    .upsert(chunk, { onConflict: "slug", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error(`Batch ${i / BATCH + 1} failed:`, error.message);
    continue;
  }
  inserted += (data || []).length;
  skipped  += chunk.length - (data || []).length;
  console.log(`  batch ${i / BATCH + 1}/${Math.ceil(records.length / BATCH)}: +${(data || []).length} new`);
}

console.log(`\nDone. ${inserted} inserted, ${skipped} skipped (already existed), ${errors.length} errored.`);
process.exit(0);
