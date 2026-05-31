-- ════════════════════════════════════════════════════════════════
-- migration 37 — Learning Roadmaps (sequenced bundles)
-- ════════════════════════════════════════════════════════════════
--
-- A roadmap is a curated, ordered sequence of steps. Each step is
-- either:
--   • a problem-statement reference (problem_id) — "now go solve this"
--   • an external resource link (resource_url + resource_label)
--     — "now read this paper / watch this video"
--   • a free-form checkpoint                    — "implement X before
--     moving on"
--
-- Students can mark steps complete (`roadmap_progress` row per step
-- per user). The list page renders progress %, the detail page
-- renders the timeline.
--
-- Cross-tenant — same data-plane policy as problem_statements.
--
-- IDEMPOTENT.
-- ════════════════════════════════════════════════════════════════

-- ─── roadmaps ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.roadmaps (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT        UNIQUE NOT NULL,
  title         TEXT        NOT NULL,
  summary       TEXT        NOT NULL,                  -- ~200 chars, the elevator pitch
  description   TEXT,                                  -- longer intro, optional
  difficulty    TEXT        NOT NULL DEFAULT 'intermediate'
                CHECK (difficulty IN ('beginner','intermediate','advanced')),
  topic         TEXT        NOT NULL,                  -- ML, CP, Web3, GSoC, ICPC, …
  est_hours     INTEGER,                               -- rough sense of scale
  cover_emoji   TEXT,                                  -- single emoji for the list card
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_by    UUID,                                  -- admin/teacher; null for seeded
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.roadmaps DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_roadmaps_active   ON public.roadmaps (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_roadmaps_topic    ON public.roadmaps (topic);
CREATE INDEX IF NOT EXISTS idx_roadmaps_difficulty ON public.roadmaps (difficulty);

-- ─── roadmap_steps ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.roadmap_steps (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id     UUID        NOT NULL REFERENCES public.roadmaps(id) ON DELETE CASCADE,
  position       INTEGER     NOT NULL,                 -- 0-indexed order within roadmap
  title          TEXT        NOT NULL,
  description    TEXT,                                 -- optional detail
  problem_id     UUID        REFERENCES public.problem_statements(id) ON DELETE SET NULL,
  resource_url   TEXT,                                 -- when the step is "read/watch X"
  resource_label TEXT,                                 -- the host or short title
  est_minutes    INTEGER,                              -- optional "this should take ~30 min"
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (roadmap_id, position)
);

ALTER TABLE public.roadmap_steps DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_roadmap_steps_roadmap ON public.roadmap_steps (roadmap_id, position);
CREATE INDEX IF NOT EXISTS idx_roadmap_steps_problem ON public.roadmap_steps (problem_id) WHERE problem_id IS NOT NULL;

-- ─── roadmap_progress ──────────────────────────────────────────
-- One row per (user, step) when the user marks the step complete.
-- Absent row = not started. We compute progress percentages from
-- COUNT(*) WHERE roadmap_id=$1 AND user_id=$2.
CREATE TABLE IF NOT EXISTS public.roadmap_progress (
  user_id      UUID        NOT NULL,
  step_id      UUID        NOT NULL REFERENCES public.roadmap_steps(id) ON DELETE CASCADE,
  roadmap_id   UUID        NOT NULL REFERENCES public.roadmaps(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, step_id)
);

ALTER TABLE public.roadmap_progress DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_roadmap_progress_user_map
  ON public.roadmap_progress (user_id, roadmap_id);

-- ─── updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.roadmaps_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_roadmaps_updated_at ON public.roadmaps;
CREATE TRIGGER trg_roadmaps_updated_at
  BEFORE UPDATE ON public.roadmaps
  FOR EACH ROW EXECUTE FUNCTION public.roadmaps_set_updated_at();

-- ═══════════════════════════════════════════════════════════════
-- SEED — six starter roadmaps that align with what students at
-- BMSIT typically chase: GSoC prep, ICPC prep, ML researcher track,
-- web full-stack, GenAI tooling, and a Math-Collective-branded
-- "Olympiad to Research" path.
-- ═══════════════════════════════════════════════════════════════

INSERT INTO public.roadmaps (slug, title, summary, description, difficulty, topic, est_hours, cover_emoji)
VALUES
  ('gsoc-prep',
   'Roadmap to GSoC',
   'From "what is GSoC?" to a merged PR in an active open-source org — the proven path.',
   'A six-step ramp that takes a 3rd-year CS student from zero familiarity with open source to a defendable GSoC proposal. Skips the busywork (don''t spend a week setting up a blog) and focuses on what actually decides selection: real merged PRs on a real codebase.',
   'intermediate', 'Open Source', 80, '🌐'),
  ('icpc-fundamentals',
   'ICPC Fundamentals',
   'The 8-week onramp from "I know loops" to your first regional contest.',
   'Competitive-programming basics for someone who has touched code but never solved a CP problem. Covers complexity intuition, arrays/strings/hashing, two pointers, binary search, basic DP — enough to clear the qualifying round of most regional ICPC sites.',
   'beginner', 'Competitive Programming', 120, '⚡'),
  ('ml-researcher-track',
   'ML Researcher Track',
   'Reproduce the papers that shaped modern ML. End with a notebook you can show to a PhD admit panel.',
   'A reading + reproduction roadmap built around foundational ML papers (Attention, ResNet, GAN, Diffusion, RLHF). Each step pairs a paper with a small dataset and asks you to reproduce a key result on a single GPU — the artifact that proves you actually understand it.',
   'advanced', 'Machine Learning', 200, '🧪'),
  ('fullstack-web-2026',
   'Full-stack Web — 2026 stack',
   'React + Express + Postgres + deploy. Six steps from a blank repo to a live URL.',
   'The pragmatic full-stack path: React/Vite on the front, Express + Postgres on the back, Render or Fly for the deploy. No bootcamp filler — every step builds the artifact the next step needs.',
   'beginner', 'Web Development', 60, '🛠️'),
  ('genai-tooling',
   'GenAI Tooling — build with LLMs',
   'Move beyond ChatGPT screenshots. Build agents, RAG pipelines, and your own tool wrappers.',
   'An applied roadmap for the LLM era — system-prompting, retrieval-augmented generation, function calling, evals, and shipping a small but useful agent. Designed to make your résumé look like a 2026 engineer rather than a 2022 one.',
   'intermediate', 'AI / ML', 50, '🤖'),
  ('olympiad-to-research',
   'Olympiad to Research',
   'From Olympiad-style problem solving into a first research-style write-up. Math-Collective signature path.',
   'A bridge for students who grew up doing IMO / Putnam-style problems and want to learn what an actual research paper looks like. Reading Polya, replicating a small combinatorial result, writing a 4-page LaTeX note that a senior would actually read.',
   'advanced', 'Math', 100, '📐')
ON CONFLICT (slug) DO NOTHING;

-- ── Roadmap steps ──
-- Inserted via a CTE pattern so we can reference the parent roadmap
-- by slug and not have to hard-code UUIDs. ON CONFLICT (roadmap_id,
-- position) DO NOTHING keeps the seed idempotent.

WITH r AS (SELECT id FROM public.roadmaps WHERE slug = 'gsoc-prep')
INSERT INTO public.roadmap_steps (roadmap_id, position, title, description, resource_url, resource_label, est_minutes)
SELECT r.id, v.position, v.title, v.description, v.resource_url, v.resource_label, v.est_minutes
FROM r, (VALUES
  (0, 'Pick a real-world OSS project you already use', 'Don''t pick the trendiest org — pick a library you already use. You''ll spend 12 weeks reading its code; familiarity matters more than glamour.',
       NULL::text, NULL::text, 45::int),
  (1, 'Read the contributor guide front-to-back', 'Every accepted GSoC org has a CONTRIBUTING.md (or equivalent). The proposal review reads it; you should too.',
       'https://opensource.guide/how-to-contribute/'::text, 'opensource.guide'::text, 60::int),
  (2, 'Fix three "good first issue" tickets — merged, not opened',
       'The bar isn''t "I have PRs open" — it''s "I have PRs MERGED". Maintainers look for closes, not commits.',
       NULL::text, NULL::text, 600::int),
  (3, 'Engage on the org''s public chat for two weeks',
       'GSoC mentors notice patience and politeness. Lurk, answer beginner questions, find your way around the dev workflow without asking the obvious.',
       NULL::text, NULL::text, 300::int),
  (4, 'Draft the proposal — feedback BEFORE the deadline',
       'Most failed proposals fail because the only person who read them was the applicant. Get at least one mentor and one peer to review.',
       'https://google.github.io/gsocguides/student/writing-a-proposal'::text, 'GSoC Student Guide'::text, 240::int),
  (5, 'Solve the practice SIH/Kaggle problem your org most resembles',
       'Pull the closest match from /problems and write a small writeup linking your draft proposal''s approach to a real example.',
       NULL::text, NULL::text, 180::int)
) AS v(position, title, description, resource_url, resource_label, est_minutes)
WHERE EXISTS (SELECT 1 FROM r)
ON CONFLICT (roadmap_id, position) DO NOTHING;

WITH r AS (SELECT id FROM public.roadmaps WHERE slug = 'icpc-fundamentals')
INSERT INTO public.roadmap_steps (roadmap_id, position, title, description, resource_url, resource_label, est_minutes)
SELECT r.id, v.position, v.title, v.description, v.resource_url, v.resource_label, v.est_minutes
FROM r, (VALUES
  (0, 'Understand Big-O without the textbook ceremony', 'Forget formal proofs for now. Build the intuition: a 10^8 inner loop dies at 1s, sorting is "free", hash lookup is "free".',
       'https://cses.fi/book/book.pdf'::text, 'CSES Book — Ch.2'::text, 60::int),
  (1, 'Hash maps, sets, and frequency arrays',
       'Half of "easy" CP problems are just frequency-counting in disguise. Master the unordered_map / dict idioms cold.',
       NULL::text, NULL::text, 120::int),
  (2, 'Two pointers + sliding window',
       'The technique that unlocks 30% of medium problems. Practice on Codeforces 1600-rated problems till the pattern is automatic.',
       'https://codeforces.com/problemset?tags=two+pointers'::text, 'Codeforces — two pointers'::text, 240::int),
  (3, 'Binary search on the answer',
       'Not "search a sorted array" — "binary-search the parametric answer space". This is the single highest-leverage CP idea.',
       NULL::text, NULL::text, 180::int),
  (4, 'Basic DP — knapsack, LIS, LCS, edit distance',
       'Cover the four canonical patterns. Skip "advanced DP" for now; the four covered here unlock most of the contest tier you''re aiming at.',
       'https://atcoder.jp/contests/dp'::text, 'AtCoder DP Contest'::text, 360::int),
  (5, 'Graphs — BFS, DFS, Dijkstra, Union-Find',
       'Implement each from scratch. Don''t use library implementations for the first 20 problems — fingertip-familiarity is the point.',
       NULL::text, NULL::text, 300::int),
  (6, 'Take a real virtual contest, then upsolve everything you missed',
       'Pick a past Codeforces round of your rating tier. Time-box it. Then spend the next two days writing up solutions for every unsolved problem.',
       'https://codeforces.com/contests?type=virtual'::text, 'Codeforces virtual contests'::text, 600::int)
) AS v(position, title, description, resource_url, resource_label, est_minutes)
WHERE EXISTS (SELECT 1 FROM r)
ON CONFLICT (roadmap_id, position) DO NOTHING;

WITH r AS (SELECT id FROM public.roadmaps WHERE slug = 'ml-researcher-track')
INSERT INTO public.roadmap_steps (roadmap_id, position, title, description, resource_url, resource_label, est_minutes)
SELECT r.id, v.position, v.title, v.description, v.resource_url, v.resource_label, v.est_minutes
FROM r, (VALUES
  (0, 'Read "A Recipe for Training Neural Networks" — Karpathy', 'The single most useful debugging-mindset essay in modern ML. Read it twice.',
       'https://karpathy.github.io/2019/04/25/recipe/'::text, 'karpathy.github.io'::text, 90::int),
  (1, 'Reproduce a small ResNet on CIFAR-10',
       'Single GPU. No tricks. Match within 2% of the published number — the artifact is "I can train a model end-to-end, not just call .fit()".',
       'https://arxiv.org/abs/1512.03385'::text, 'arXiv:1512.03385 (ResNet)'::text, 600::int),
  (2, 'Read "Attention Is All You Need" + implement scaled dot-product attention by hand',
       'Don''t paste from a library. Type the matmul yourself; it''s six lines. The architecture stops being magic the moment you type those six lines.',
       'https://arxiv.org/abs/1706.03762'::text, 'arXiv:1706.03762 (Transformer)'::text, 240::int),
  (3, 'Train a tiny GPT (~1M params) on Tiny Shakespeare',
       'Karpathy''s nanoGPT walkthrough. End-to-end in an afternoon. You''ll never read another LLM paper the same way.',
       'https://github.com/karpathy/nanoGPT'::text, 'github.com/karpathy/nanoGPT'::text, 360::int),
  (4, 'Read the InstructGPT / RLHF paper',
       'The pivot that made ChatGPT work. Understanding RLHF separates the people who can talk about LLMs at a conference from the people who can''t.',
       'https://arxiv.org/abs/2203.02155'::text, 'arXiv:2203.02155 (InstructGPT)'::text, 180::int),
  (5, 'Pick a recent NeurIPS paper, reproduce ONE figure',
       'The whole game. Pick something from the latest NeurIPS, ablate honestly, write a 2-page LaTeX note about what went wrong. That note IS your application material.',
       NULL::text, NULL::text, 1200::int)
) AS v(position, title, description, resource_url, resource_label, est_minutes)
WHERE EXISTS (SELECT 1 FROM r)
ON CONFLICT (roadmap_id, position) DO NOTHING;

WITH r AS (SELECT id FROM public.roadmaps WHERE slug = 'fullstack-web-2026')
INSERT INTO public.roadmap_steps (roadmap_id, position, title, description, resource_url, resource_label, est_minutes)
SELECT r.id, v.position, v.title, v.description, v.resource_url, v.resource_label, v.est_minutes
FROM r, (VALUES
  (0, 'Vite + React in 20 minutes', 'A counter app. A form. A list. That''s it. Don''t learn Redux yet; we don''t need it.',
       'https://vite.dev/guide/'::text, 'vite.dev'::text, 30::int),
  (1, 'Tailwind without the marketing copy',
       'Tailwind is 30 utility classes you''ll use constantly + 200 you''ll never need. Learn the 30. Move on.',
       'https://tailwindcss.com/docs/utility-first'::text, 'tailwindcss.com'::text, 60::int),
  (2, 'Express + Postgres CRUD in one file',
       'Wire a single resource end-to-end before splitting the project into folders. Premature structure is a junior-engineer trap.',
       NULL::text, NULL::text, 180::int),
  (3, 'Add auth — sessions, NOT JWT',
       'Session cookies are simpler, safer for browser apps, and supported by every framework on day one. JWT is a footgun for first-project auth.',
       NULL::text, NULL::text, 240::int),
  (4, 'Deploy to Render or Fly.io',
       'Pushing to main should deploy. Anything else is wasted ceremony for a side project.',
       'https://render.com/docs'::text, 'render.com docs'::text, 90::int),
  (5, 'Add ONE polish layer — loading states, error toasts, empty states',
       'The difference between "student project" and "looks deployed" is exactly these three things.',
       NULL::text, NULL::text, 180::int)
) AS v(position, title, description, resource_url, resource_label, est_minutes)
WHERE EXISTS (SELECT 1 FROM r)
ON CONFLICT (roadmap_id, position) DO NOTHING;

WITH r AS (SELECT id FROM public.roadmaps WHERE slug = 'genai-tooling')
INSERT INTO public.roadmap_steps (roadmap_id, position, title, description, resource_url, resource_label, est_minutes)
SELECT r.id, v.position, v.title, v.description, v.resource_url, v.resource_label, v.est_minutes
FROM r, (VALUES
  (0, 'Prompt engineering — beyond "be nice to the model"',
       'Few-shot, chain-of-thought, structured output, JSON mode. The skill is in the structure, not the politeness.',
       'https://www.promptingguide.ai/'::text, 'promptingguide.ai'::text, 120::int),
  (1, 'Build a RAG pipeline from scratch (no LangChain)',
       'Embed → store → retrieve → prompt. The whole loop is 80 lines of Python. LangChain teaches you LangChain; building it once teaches you RAG.',
       NULL::text, NULL::text, 240::int),
  (2, 'Function calling / tool use',
       'Where LLMs stop being chatbots and start being agents. Implement a 3-tool agent: a calculator, a weather lookup, and a search.',
       'https://platform.openai.com/docs/guides/function-calling'::text, 'OpenAI function calling docs'::text, 180::int),
  (3, 'Evals — how do you KNOW your prompt got better?',
       'Build a 30-row eval set with expected outputs. Measure pass rate before/after every prompt tweak. This is how serious GenAI engineering looks.',
       'https://github.com/openai/evals'::text, 'openai/evals'::text, 240::int),
  (4, 'Ship a tiny but useful agent on a domain you know',
       'Don''t build "an AI assistant" — build "an assistant that grades my Python homework against the textbook''s answer key". Narrow + useful beats broad + impressive.',
       NULL::text, NULL::text, 480::int)
) AS v(position, title, description, resource_url, resource_label, est_minutes)
WHERE EXISTS (SELECT 1 FROM r)
ON CONFLICT (roadmap_id, position) DO NOTHING;

WITH r AS (SELECT id FROM public.roadmaps WHERE slug = 'olympiad-to-research')
INSERT INTO public.roadmap_steps (roadmap_id, position, title, description, resource_url, resource_label, est_minutes)
SELECT r.id, v.position, v.title, v.description, v.resource_url, v.resource_label, v.est_minutes
FROM r, (VALUES
  (0, 'Re-read Polya — How to Solve It', 'The book that maps olympiad heuristics onto research-style problem framing. Read it slowly.',
       NULL::text, NULL::text, 360::int),
  (1, 'Pick ONE recent combinatorics result on arxiv',
       'Recent matters: the proof should be 3-15 pages, not 200. Read it three times. The first read is for vibes, not understanding.',
       'https://arxiv.org/list/math.CO/recent'::text, 'arXiv math.CO recent'::text, 240::int),
  (2, 'Replicate the small case computationally',
       'Even if the paper proves a general theorem, the n=4 case is something you can verify with a 50-line Python script. Doing this makes the proof feel real.',
       NULL::text, NULL::text, 360::int),
  (3, 'Write a 4-page LaTeX note',
       'The artifact. "Here is the result, here is my replication, here is a question I''d ask next." Show it to a senior; iterate.',
       'https://www.overleaf.com/learn'::text, 'Overleaf — LaTeX guide'::text, 480::int),
  (4, 'Take it to one professor in person',
       'The conversation matters more than the note. Five minutes of real critique is worth fifty hours of self-study.',
       NULL::text, NULL::text, 30::int)
) AS v(position, title, description, resource_url, resource_label, est_minutes)
WHERE EXISTS (SELECT 1 FROM r)
ON CONFLICT (roadmap_id, position) DO NOTHING;

-- ─── Verify ────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.roadmaps)        AS roadmaps,
  (SELECT COUNT(*) FROM public.roadmap_steps)   AS steps,
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN ('roadmaps','roadmap_steps','roadmap_progress')) AS tables_present;
