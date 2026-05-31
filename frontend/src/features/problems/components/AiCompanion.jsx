/**
 * AiCompanion — collapsible Socratic Q&A panel for a problem.
 *
 * Mounted under the "How to start" section on /problems/:slugOrId.
 * Starts collapsed so the page weight is low for visitors who don't
 * want hints. When opened, shows a single textarea + history of the
 * current session's exchanges.
 *
 * The backend (problemController.askProblemAi) injects the problem
 * context into the system prompt and tells the model to be Socratic,
 * so we ship just the question. No conversation history is sent to
 * the backend — each question stands alone (saves tokens and avoids
 * the model echoing prior solutions).
 *
 * Rate limit: aiLimiter on the route (20/hr/user, shared with
 * /bot/chat and /comments/ask-ai). The client gets a clear 429
 * message if hit; we show it inline.
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { problems } from "@/lib/api";

export default function AiCompanion({ slugOrId }) {
  const [open,     setOpen]     = useState(false);
  const [question, setQuestion] = useState("");
  const [history,  setHistory]  = useState([]); // [{ q, a }]
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState(null);
  const scrollRef = useRef(null);

  // Auto-scroll the answer feed to the bottom when a new answer lands.
  useEffect(() => {
    if (scrollRef.current && history.length) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history.length, busy]);

  async function onAsk(e) {
    e?.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    // Add the question to history immediately so the user sees their
    // own input rendered while the answer is fetching. Placeholder
    // answer becomes the real reply on resolve.
    setHistory((h) => [...h, { q, a: null }]);
    setQuestion("");

    try {
      const { data } = await problems.aiAsk(slugOrId, q);
      setHistory((h) => {
        const next = [...h];
        next[next.length - 1] = { q, a: data.reply || "(no reply)" };
        return next;
      });
    } catch (err) {
      const status = err?.response?.status;
      const msg = status === 429
        ? "You've hit the hourly AI limit (20/hr across all AI features). Take a breather and try again later."
        : err?.response?.data?.error || "Couldn't reach the companion. Try again.";
      setError(msg);
      // Drop the optimistic placeholder so it doesn't sit as an
      // empty bubble.
      setHistory((h) => h.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="mt-8"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center justify-between rounded-2xl border border-line/15 bg-gradient-to-r from-white/[0.025] to-primary/[0.04] px-5 py-4 text-left transition hover:border-primary/40 hover:from-white/[0.04] hover:to-primary/[0.06]"
      >
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-primary">Stuck? Ask the companion</p>
          <p className="mt-1 text-sm text-text-soft">
            Hints — not full solutions. The assistant knows this exact problem and steers you toward the answer.
          </p>
        </div>
        <span className={"ml-3 shrink-0 font-mono text-xs transition " + (open ? "rotate-90 text-primary" : "text-text-dim group-hover:text-primary")}>
          ▶
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-2xl border border-primary/20 bg-primary/[0.04] p-4 sm:p-5">
              {history.length > 0 && (
                <div
                  ref={scrollRef}
                  className="mb-3 max-h-[420px] space-y-3 overflow-y-auto pr-1"
                >
                  {history.map((entry, i) => (
                    <Bubble key={i} entry={entry} thinking={busy && i === history.length - 1 && entry.a == null} />
                  ))}
                </div>
              )}

              <form onSubmit={onAsk} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={
                    history.length === 0
                      ? "e.g. I'm not sure how to parse the dataset — what should I look at first?"
                      : "Follow-up question…"
                  }
                  rows={2}
                  maxLength={2000}
                  className="flex-1 resize-y rounded-lg border border-line/20 bg-bg/40 px-3 py-2 text-sm text-text-soft placeholder:text-text-dim focus:border-primary/50 focus:outline-none"
                  onKeyDown={(e) => {
                    // Enter to submit (Shift+Enter = newline) — common
                    // pattern, matches the chat surface elsewhere.
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onAsk(e);
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={busy || !question.trim()}
                  className="shrink-0 self-end rounded-lg border border-primary/40 bg-primary/15 px-4 py-2 font-mono text-xs uppercase tracking-wider text-white transition hover:bg-primary/25 disabled:opacity-50"
                >
                  {busy ? "Thinking…" : "Ask"}
                </button>
              </form>

              {error && <p className="mt-2 text-xs text-danger">{error}</p>}

              <p className="mt-3 font-mono text-[10px] text-text-dim">
                Companion is Socratic by design — it gives hints and pointers, not full solutions.
                Hourly limit: 20 questions per student across all AI features.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

/* ─────────────────────────────────────────────────────────── */

function Bubble({ entry, thinking }) {
  return (
    <div className="space-y-1.5">
      <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-primary/12 px-3.5 py-2 text-sm text-white">
        {entry.q}
      </div>
      <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-line/15 bg-white/[0.03] px-3.5 py-2 text-sm text-text-soft">
        {thinking ? (
          <span className="inline-flex items-center gap-1 font-mono text-xs text-text-dim">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Thinking…
          </span>
        ) : (
          <span className="whitespace-pre-wrap">{entry.a}</span>
        )}
      </div>
    </div>
  );
}
