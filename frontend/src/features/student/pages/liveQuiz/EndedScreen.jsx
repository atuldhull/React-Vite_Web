import { motion } from "framer-motion";
import SpaceBackground from "@/components/backgrounds/SpaceBackground";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

export default function EndedScreen({ errorMsg, onLeave }) {
  return (
    <>
      <SpaceBackground />
      <div className="relative z-10 flex min-h-[70vh] items-center justify-center pb-16">
        <motion.div initial="hidden" animate="visible" variants={scaleIn} className="max-w-md">
          <Card variant="solid" className="text-center">
            <div className="py-8">
              <p className="font-display text-5xl font-extrabold text-text-dim">--</p>
              <h2 className="mt-4 font-display text-2xl font-bold text-white">
                Session Ended
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                {errorMsg || "The host has ended this quiz session."}
              </p>
              <div className="mt-8">
                <Button onClick={onLeave}>Back to Join</Button>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </>
  );
}
