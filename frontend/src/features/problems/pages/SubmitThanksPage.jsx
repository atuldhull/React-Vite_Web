/**
 * SubmitThanksPage — confirmation after a problem submission.
 *
 * Intentionally minimal — just the "you've contributed" beat and a
 * pair of next-step links. The list of the user's own submissions
 * (and their statuses) lives on /profile via the existing list
 * endpoint; we link there from here so they can track approval
 * without having to know the URL.
 */

import { Link } from "react-router-dom";
import { motion } from "framer-motion";

export default function SubmitThanksPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-success">Submitted</p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl"
            style={{ textWrap: "balance" }}>
          Thanks — it's in the review queue.
        </h1>
        <p className="mt-3 text-sm text-text-soft">
          An admin will check it over (usually within a day or two). If approved, it lands in the catalogue with you credited as the contributor.
          You'll see it under "Your submissions" on your profile until then.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <Link
            to="/problems/submit"
            className="rounded-lg border border-primary/40 bg-primary/15 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-white hover:bg-primary/20"
          >
            Submit another
          </Link>
          <Link
            to="/problems"
            className="rounded-lg border border-line/25 bg-white/[0.04] px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-text-soft hover:border-primary/40 hover:text-white"
          >
            Back to catalogue
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
