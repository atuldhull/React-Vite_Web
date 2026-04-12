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

export default function TestsList({ tests, testsLoading, deletingId, handleDeleteTest }) {
  return (
    <motion.div custom={2} variants={fadeUp}>
      <Card variant="solid">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warning">
          Scheduled
        </p>
        <h3 className="mt-2 font-display text-xl font-bold text-white">
          Existing Tests
        </h3>

        {testsLoading ? (
          <div className="mt-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl border border-line/10 bg-surface/30"
              />
            ))}
          </div>
        ) : tests.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 py-8 text-center">
            <svg
              className="h-8 w-8 text-text-dim"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-text-dim">No scheduled tests yet</p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {tests.map((test) => {
              const isActive =
                new Date(test.startDate) <= new Date() &&
                new Date(test.endDate) >= new Date();
              const isPast = new Date(test.endDate) < new Date();

              return (
                <div
                  key={test._id}
                  className="flex items-center justify-between rounded-xl border border-line/10 bg-black/10 px-4 py-3"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">
                        {test.title || "Untitled Test"}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase ${
                          isActive
                            ? "bg-success/10 text-success"
                            : isPast
                              ? "bg-text-dim/10 text-text-dim"
                              : "bg-warning/10 text-warning"
                        }`}
                      >
                        {isActive ? "Live" : isPast ? "Ended" : "Upcoming"}
                      </span>
                    </div>
                    <p className="mt-0.5 font-mono text-[10px] text-text-dim">
                      {test.challenges?.length || 0} challenges &middot;{" "}
                      {test.startDate
                        ? new Date(test.startDate).toLocaleString()
                        : "—"}{" "}
                      &rarr;{" "}
                      {test.endDate
                        ? new Date(test.endDate).toLocaleString()
                        : "—"}
                    </p>
                    {test.description && (
                      <p className="mt-1 text-xs text-text-muted line-clamp-1">
                        {test.description}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleDeleteTest(test._id)}
                    loading={deletingId === test._id}
                  >
                    Delete
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
