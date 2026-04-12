import { motion } from "framer-motion";
import SpaceBackground from "@/components/backgrounds/SpaceBackground";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  }),
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

const PHASE_ERROR = "error";

export default function JoinScreen({ code, setCode, playerName, setPlayerName, joining, phase, errorMsg, onJoin }) {
  return (
    <>
      <SpaceBackground />
      <div className="relative z-10 flex min-h-[70vh] items-center justify-center pb-16">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={scaleIn}
          className="w-full max-w-md"
        >
          <Card variant="glow">
            <div className="text-center">
              <motion.p
                custom={0}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="font-mono text-xs uppercase tracking-[0.3em] text-danger"
              >
                Battle Mode
              </motion.p>
              <motion.h1
                custom={1}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="mt-3 font-display text-4xl font-extrabold tracking-[-0.05em] text-white"
              >
                Live Quiz
              </motion.h1>
              <motion.p
                custom={2}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="mt-2 text-sm text-text-muted"
              >
                Enter the code from your teacher to join the session.
              </motion.p>
            </div>

            <div className="mt-8 space-y-5">
              <InputField
                label="Quiz Code"
                placeholder="e.g. AB3X9K"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                inputClassName="text-center font-mono text-lg tracking-[0.3em] uppercase"
              />

              <InputField
                label="Your Name"
                placeholder="Enter your display name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
              />

              {phase === PHASE_ERROR && errorMsg && (
                <motion.p
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-center text-sm text-danger"
                >
                  {errorMsg}
                </motion.p>
              )}

              <Button
                className="w-full justify-center"
                loading={joining}
                onClick={onJoin}
              >
                Join Session
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    </>
  );
}
