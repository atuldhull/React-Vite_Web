import { motion } from "framer-motion";

export default function PageTransition({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.24, ease: "easeInOut" } }}
      transition={{ duration: 0.42, ease: "easeOut" }}
      className="relative min-h-screen flex-1"
    >
      <motion.div
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        exit={{ scaleX: 0 }}
        transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none fixed inset-0 z-[55] origin-left bg-[linear-gradient(90deg,rgba(131,82,255,0.28),rgba(35,193,255,0.24),rgba(110,231,255,0.18))]"
      />
      <motion.div
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -14, opacity: 0, transition: { duration: 0.22, ease: "easeInOut" } }}
        transition={{ duration: 0.58, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-[1]"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
