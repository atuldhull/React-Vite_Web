/**
 * LaTeXEditor — split-pane: textarea on top, live KaTeX preview below.
 *
 * Designed as a drop-in upgrade for the existing `<textarea>` in
 * question-creation flows (AdminChallengesPage, TeacherChallengesPage,
 * AIGenerator). Same value/onChange contract, plus a preview pane the
 * teacher can use to verify the rendering before saving.
 *
 * Includes a small toolbar of common LaTeX inserts so a teacher who
 * doesn't know LaTeX by heart can still wrap a fraction in \frac{}{}
 * with one click.
 */

import { useRef } from "react";
import MathRender from "./MathRender";

const SNIPPETS = [
  { label: "x²",        insert: "x^{2}" },
  { label: "√",         insert: "\\sqrt{x}" },
  { label: "a/b",       insert: "\\frac{a}{b}" },
  { label: "∫",         insert: "\\int_{a}^{b} f(x)\\,dx" },
  { label: "Σ",         insert: "\\sum_{i=1}^{n} a_i" },
  { label: "∂/∂x",      insert: "\\frac{\\partial f}{\\partial x}" },
  { label: "lim",       insert: "\\lim_{x \\to 0} f(x)" },
  { label: "matrix",    insert: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}" },
  { label: "≤",         insert: "\\leq" },
  { label: "≥",         insert: "\\geq" },
  { label: "≠",         insert: "\\neq" },
  { label: "∞",         insert: "\\infty" },
  { label: "α",         insert: "\\alpha" },
  { label: "β",         insert: "\\beta" },
  { label: "θ",         insert: "\\theta" },
  { label: "π",         insert: "\\pi" },
];

export default function LaTeXEditor({
  value,
  onChange,
  placeholder = "Type the question. Wrap math in $...$ for inline or $$...$$ for display.",
  rows = 4,
  showPreview = true,
  showToolbar = true,
  required,
}) {
  const ref = useRef(null);

  const insert = (snippet) => {
    const ta = ref.current;
    if (!ta) return;
    // Wrap snippet in inline-math delimiters and drop it at the cursor.
    // Smart-wrap: if cursor is already inside a $...$ block, insert raw.
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const before = value.slice(0, start);
    const after  = value.slice(end);
    // Heuristic: count $ signs before cursor. Odd = inside math.
    const insideMath = (before.match(/\$/g) || []).length % 2 === 1;
    const wrapped = insideMath ? snippet : `$${snippet}$`;
    const next = before + wrapped + after;
    onChange?.({ target: { value: next } });
    // Restore caret position right after the insert.
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + wrapped.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="space-y-2">
      {showToolbar && (
        <div className="flex flex-wrap gap-1.5">
          {SNIPPETS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => insert(s.insert)}
              className="rounded-md border border-line/15 bg-black/15 px-2.5 py-1 font-mono text-[11px] text-text-muted transition hover:border-primary/30 hover:text-white"
              title={`Insert ${s.insert}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <textarea
        ref={ref}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        required={required}
        className="w-full resize-y rounded-xl border border-line/15 bg-black/15 px-4 py-3 font-mono text-sm text-white placeholder-text-dim outline-none focus:border-primary/30"
      />

      {showPreview && (
        <div className="rounded-xl border border-line/10 bg-surface/30 p-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-dim">
            Preview
          </p>
          {value?.trim() ? (
            <MathRender
              source={value}
              className="text-sm leading-relaxed text-white [&_.katex]:text-white"
            />
          ) : (
            <p className="text-xs italic text-text-dim">
              Start typing to see the rendered preview…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
