import { motion, AnimatePresence } from "framer-motion";
import SpaceBackground from "@/components/backgrounds/SpaceBackground";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Loader from "@/components/ui/Loader";

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

export default function LobbyScreen({ sessionCode, lobbyPlayers, lobbyCount, onLeave }) {
  return (
    <>
      <SpaceBackground />
      <div className="relative z-10 flex min-h-[70vh] items-center justify-center pb-16">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={scaleIn}
          className="w-full max-w-lg"
        >
          <Card variant="glass">
            <div className="text-center">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-success">
                Connected
              </p>
              <h2 className="mt-3 font-display text-3xl font-extrabold tracking-[-0.05em] text-white">
                Waiting for Host
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Session <span className="font-mono font-bold text-primary">{sessionCode}</span>
              </p>
            </div>

            {/* Animated waiting indicator */}
            <div className="mt-8 flex justify-center">
              <Loader variant="orbit" size="lg" label="The quiz will begin shortly..." />
            </div>

            {/* Player list */}
            <div className="mt-8">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-secondary">
                  Players in Lobby
                </p>
                <span className="rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1 font-mono text-[11px] font-bold text-secondary">
                  {lobbyCount}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {lobbyPlayers.map((name, i) => (
                    <motion.div
                      key={name + i}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.3, delay: i * 0.05 }}
                      className="flex items-center gap-2 rounded-2xl border border-line/15 bg-white/[0.03] px-3 py-2"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary via-secondary to-glow text-xs font-bold text-white">
                        {name.charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate text-sm font-medium text-white">
                        {name}
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <div className="mt-8 text-center">
              <Button variant="ghost" size="sm" onClick={onLeave}>
                Leave Session
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    </>
  );
}
