import { motion } from "framer-motion";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5 },
  }),
};

export default function TestCreator({
  // Form state
  title,
  setTitle,
  description,
  setDescription,
  selectedChallenges,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  creatingTest,
  challengeSearch,
  setChallengeSearch,
  filteredPool,
  poolLoading,
  // Actions
  toggleChallenge,
  handleCreateTest,
}) {
  return (
    <motion.div custom={0} variants={fadeUp}>
      <Card variant="glass">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">
          Schedule
        </p>
        <h3 className="mt-2 font-display text-xl font-bold text-white">
          Create Scheduled Test
        </h3>

        <div className="mt-5 space-y-4">
          {/* Title */}
          <div>
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-dim">
              Test Title
            </label>
            <input
              type="text"
              placeholder="e.g. Weekly Challenge Set #5"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-line/15 bg-surface/50 px-4 py-3 text-sm text-white placeholder-text-dim backdrop-blur outline-none transition focus:border-primary/30"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-dim">
              Description
            </label>
            <textarea
              placeholder="Brief description of the test..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-xl border border-line/15 bg-surface/50 px-4 py-3 text-sm text-white placeholder-text-dim backdrop-blur outline-none transition focus:border-primary/30"
            />
          </div>

          {/* Date range */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-dim">
                Start Date &amp; Time
              </label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-line/15 bg-surface/50 px-4 py-3 text-sm text-white backdrop-blur outline-none transition focus:border-primary/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-dim">
                End Date &amp; Time
              </label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-line/15 bg-surface/50 px-4 py-3 text-sm text-white backdrop-blur outline-none transition focus:border-primary/30"
              />
            </div>
          </div>

          {/* Challenge selection */}
          <div>
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-dim">
              Select Challenges ({selectedChallenges.length} selected)
            </label>
            <input
              type="text"
              placeholder="Search challenges..."
              value={challengeSearch}
              onChange={(e) => setChallengeSearch(e.target.value)}
              className="mb-3 w-full rounded-xl border border-line/15 bg-surface/50 px-4 py-2.5 text-sm text-white placeholder-text-dim backdrop-blur outline-none transition focus:border-primary/30"
            />

            {poolLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="h-12 animate-pulse rounded-xl border border-line/10 bg-surface/30"
                  />
                ))}
              </div>
            ) : (
              <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                {filteredPool.length === 0 ? (
                  <p className="py-4 text-center text-sm text-text-dim">
                    {challengeSearch ? "No challenges match" : "No challenges available"}
                  </p>
                ) : (
                  filteredPool.map((c) => {
                    const isSelected = selectedChallenges.includes(c._id);
                    return (
                      <button
                        key={c._id}
                        onClick={() => toggleChallenge(c._id)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition ${
                          isSelected
                            ? "border-primary/30 bg-primary/12 text-white"
                            : "border-line/10 bg-black/10 text-text-muted hover:border-line/20 hover:text-white"
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs ${
                            isSelected
                              ? "border-primary bg-primary text-white"
                              : "border-line/20 bg-transparent"
                          }`}
                        >
                          {isSelected && (
                            <svg
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm">{c.title}</p>
                          <p className="font-mono text-[10px] text-text-dim">
                            {c.difficulty || "—"} &middot; {c.points ?? 0} pts
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <Button
            onClick={handleCreateTest}
            loading={creatingTest}
            disabled={!title.trim() || selectedChallenges.length === 0}
            size="sm"
          >
            Create Test
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
