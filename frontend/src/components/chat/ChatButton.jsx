/**
 * ChatButton — Floating button to open the chat panel.
 * Only visible when user is logged in.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { useAuthStore } from "@/store/auth-store";
import ChatPanel from "@/components/chat/ChatPanel";

export default function ChatButton() {
  const [open, setOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);

  // Only show for authenticated users
  if (status !== "authenticated" || !user) return null;

  return (
    <>
      {/* Floating button — positioned above PANDA bot */}
      <motion.button
        onClick={() => setOpen(!open)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-20 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-surface/80 shadow-lg backdrop-blur-xl transition hover:border-primary/50"
        style={{ boxShadow: "0 4px 20px rgba(131,82,255,0.2)" }}
        aria-label="Open messages"
      >
        <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </motion.button>

      {/* Chat panel */}
      <ChatPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
