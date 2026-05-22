import { motion } from "framer-motion";

/** Shared form primitives for the Core Team portal modals & forms. */

export const INPUT_CLS =
  "w-full rounded-lg border border-line/20 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-primary/50";

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-text-dim">{label}</span>
      {children}
    </label>
  );
}

/** Centered, dimmed-backdrop modal. Click-outside and ✕ both close. */
export function ModalShell({ title, onClose, children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 16 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line/15 bg-surface/95 p-6 shadow-panel backdrop-blur-2xl"
        style={{ borderTop: "2px solid #7c3aed" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-text-dim transition hover:text-white" aria-label="Close">✕</button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
