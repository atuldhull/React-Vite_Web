/**
 * useCommandPaletteHotkey — wires the global Ctrl/Cmd+K shortcut to
 * a setter. Also accepts "/" as a shortcut when the user isn't
 * typing in an input — mirrors GitHub / Linear behaviour.
 *
 * Skip rules: never trigger when the user is mid-keystroke in an
 * input, textarea, or contenteditable element. Otherwise typing "k"
 * in a comment box would slam the palette open.
 */
import { useEffect } from "react";

export function useCommandPaletteHotkey(open, setOpen) {
  useEffect(() => {
    function isTypingTarget(t) {
      if (!t) return false;
      const tag = (t.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (t.isContentEditable) return true;
      return false;
    }

    function onKey(e) {
      // Ctrl+K / Cmd+K — toggles regardless of focus context.
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen(!open);
        return;
      }
      // "/" — only when NOT typing somewhere.
      if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);
}
