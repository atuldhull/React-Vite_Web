import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { bot } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

function renderMd(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/`(.*?)`/g, '<code class="rounded bg-[rgba(0,255,200,0.1)] px-1 py-0.5 font-mono text-[11px] text-[#00FFC8]">$1</code>')
    .replace(/\n/g, "<br/>");
}

export default function PandaChatPanel({ open }) {
  // The /api/bot/chat endpoint requires auth (added during the Phase 8
  // security pass — bot was a public abuse vector against our OpenRouter
  // credits). So we need to know who's logged in to give a useful UX.
  const status  = useAuthStore((s) => s.status);
  const isGuest = status === "guest" || status === "error";

  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hey! I'm **PANDA** 🐼 your math AI.\n\nAsk me about Calculus, Algebra, Probability — anything!" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (open && !isGuest) setTimeout(() => inputRef.current?.focus(), 400);
  }, [open, isGuest]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const updated = [...messages, { role: "user", content: text }];
    setMessages(updated);
    setInput("");
    setLoading(true);
    try {
      const { data } = await bot.chat(updated.map((m) => ({ role: m.role, content: m.content })));
      setMessages([...updated, { role: "assistant", content: data.reply }]);
    } catch (err) {
      // Distinguish 401 (session expired / not logged in) from a real outage.
      const code = err?.response?.status;
      let reply;
      if (code === 401) {
        reply = "You need to **sign in** to chat with me — head to the login page and come back. \uD83D\uDC3C";
      } else if (code === 413 || code === 400) {
        reply = "That message is too long for me to chew on \uD83D\uDC3C\u2014 try a shorter question?";
      } else if (code === 429) {
        reply = "I'm getting too many questions right now \uD83D\uDC3C\u2014 give me a minute and try again.";
      } else {
        reply = "PANDA is napping \uD83D\uDE34 Try again in a moment!";
      }
      setMessages([...updated, { role: "assistant", content: reply }]);
    }
    setLoading(false);
  };

  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="fixed bottom-[100px] right-6 z-50 flex flex-col overflow-hidden"
          style={{
            width: "min(420px, calc(100vw - 2rem))",
            height: "min(600px, calc(100vh - 9rem))",
            clipPath: "var(--clip-notch)",
            background: "rgba(0, 10, 20, 0.92)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(0,255,200,0.2)",
            borderTop: "2px solid var(--monument-abyss)",
            boxShadow: "0 25px 80px rgba(0,0,0,0.6), 0 0 30px rgba(0,255,200,0.1)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-5 py-4"
            style={{
              background: "rgba(0,255,200,0.05)",
              borderBottom: "1px solid rgba(0,255,200,0.15)",
            }}
          >
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-xl"
              style={{ background: "rgba(0,255,200,0.1)", border: "1px solid rgba(0,255,200,0.2)" }}
            >
              🐼
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="math-text text-sm" style={{ color: "var(--monument-abyss)" }}>∞</span>
                <span className="text-sm font-semibold text-white">PANDA — Math Intelligence Unit</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full shadow-[0_0_4px_rgba(0,255,200,0.5)]" style={{ background: "var(--monument-abyss)" }} />
                <span className="font-mono text-[10px] text-white/40">Online</span>
              </div>
            </div>
            <button onClick={() => setMessages([{ role: "assistant", content: "Clean slate! 🐼 What shall we solve?" }])}
              className="rounded-lg px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider text-white/30 transition hover:bg-[rgba(0,255,200,0.08)] hover:text-white/60">
              Clear
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 [scrollbar-width:thin] [scrollbar-color:rgba(0,255,200,0.15)_transparent]">
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start gap-2"}`}
              >
                {msg.role === "assistant" && (
                  <div
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs"
                    style={{ background: "rgba(0,255,200,0.1)" }}
                  >
                    🐼
                  </div>
                )}
                <div
                  className="max-w-[85%] px-3.5 py-2.5 text-[13px] leading-relaxed"
                  style={
                    msg.role === "user"
                      ? {
                          clipPath: "var(--clip-para)",
                          background: "rgba(0,255,200,0.2)",
                          borderLeft: "2px solid var(--monument-abyss)",
                          color: "rgba(255,255,255,0.9)",
                        }
                      : {
                          clipPath: "var(--clip-notch)",
                          background: "rgba(0,20,40,0.8)",
                          border: "1px solid rgba(0,255,200,0.15)",
                          color: "rgba(255,255,255,0.6)",
                        }
                  }
                  dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }}
                />
              </motion.div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-2">
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs"
                  style={{ background: "rgba(0,255,200,0.1)" }}
                >
                  🐼
                </div>
                <div
                  className="flex items-center gap-2 px-4 py-3"
                  style={{
                    clipPath: "var(--clip-notch)",
                    background: "rgba(0,20,40,0.8)",
                    border: "1px solid rgba(0,255,200,0.15)",
                  }}
                >
                  {[0, 0.15, 0.3].map((d, idx) => (
                    <motion.span key={idx} animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: d }}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: "var(--monument-abyss)" }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          {/* Quick suggestion chips — only useful when the user can actually
              send a message. Hide for guests since the input below is replaced
              with a sign-in CTA. */}
          {!isGuest && messages.length <= 1 && (
            <div
              className="flex flex-wrap gap-1.5 px-4 py-2.5"
              style={{ borderTop: "1px solid rgba(0,255,200,0.1)" }}
            >
              {["Explain derivatives", "What is a matrix?", "Probability basics"].map((q) => (
                <button key={q} onClick={() => setInput(q)}
                  className="font-mono text-[10px] transition"
                  style={{
                    clipPath: "var(--clip-para)",
                    background: "rgba(0,255,200,0.08)",
                    border: "1px solid rgba(0,255,200,0.3)",
                    color: "var(--monument-abyss)",
                    padding: "0.35rem 0.75rem",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,255,200,0.18)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,255,200,0.08)"; }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input — replaced with a sign-in CTA when the user is a guest. */}
          <div style={{ borderTop: "1px solid rgba(0,255,200,0.15)" }} className="px-4 py-3">
            {isGuest ? (
              <div className="flex flex-col items-center gap-2 py-2 text-center">
                <p className="text-[12px] text-white/60">
                  Sign in to chat with PANDA <span aria-hidden>{"\u{1F43C}"}</span>
                </p>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition hover:brightness-110"
                  style={{
                    background: "var(--monument-abyss)",
                    color: "#000",
                    clipPath: "var(--clip-para)",
                  }}
                >
                  Sign in
                </Link>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="Ask PANDA anything..."
                  rows={1}
                  className="max-h-24 min-h-[42px] flex-1 resize-none px-3.5 py-2.5 text-[13px] text-white outline-none placeholder:text-white/20"
                  style={{
                    background: "rgba(0,20,40,0.6)",
                    border: "1px solid rgba(0,255,200,0.15)",
                    borderBottom: "1.5px solid rgba(0,255,200,0.3)",
                    borderLeft: "3px solid var(--monument-abyss)",
                  }}
                />
                {/* Send button — hex shaped */}
                <motion.button
                  onClick={send}
                  disabled={!input.trim() || loading}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.92 }}
                  className="flex shrink-0 items-center justify-center transition disabled:opacity-20"
                  style={{
                    width: 40,
                    height: 40,
                    clipPath: "var(--clip-hex)",
                    background: input.trim() && !loading ? "var(--monument-abyss)" : "rgba(0,255,200,0.1)",
                    color: input.trim() && !loading ? "#000" : "rgba(255,255,255,0.3)",
                  }}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                </motion.button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
