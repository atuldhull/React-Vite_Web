/**
 * Live quiz session store — "in-flight quiz rooms and their state".
 *
 * Keyed by 6-char room code. Each entry holds the teacher socketId, the
 * player map, current question index, and the reveal timer handle.
 *
 * For Redis: store the session as a HASH, store players as a nested HASH
 * with SCAN iteration. Timers must still live in the node process (they
 * aren't serialisable), so either stick with a single-instance deployment
 * or move reveal timing to a BullMQ delayed job.
 */

function createInMemoryQuizStore() {
  // code -> session object
  const sessions = new Map();

  return {
    create(code, session) {
      sessions.set(code, session);
    },

    get(code) {
      return sessions.get(code);
    },

    delete(code) {
      sessions.delete(code);
    },

    /** Iterate all sessions — used by disconnect cleanup. */
    entries() {
      return sessions.entries();
    },
  };
}

export const quizStore = createInMemoryQuizStore();
export { createInMemoryQuizStore };
