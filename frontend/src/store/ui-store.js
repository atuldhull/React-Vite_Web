import { create } from "zustand";

const THEMES = ["cosmic", "light", "eclipse"];

function getInitialTheme() {
  if (typeof window === "undefined") return "cosmic";
  return window.localStorage.getItem("mc-ui-theme") || "cosmic";
}

export const useUiStore = create((set, get) => ({
  theme: getInitialTheme(),
  navOpen: false,
  cursorMode: "ambient",

  // Chat panel control (Phase 15).
  // Previously ChatButton held this state locally; lifting it here
  // lets MessageButton (on profiles / hovercards / leaderboards) open
  // the panel pre-targeted to a specific user without prop-drilling.
  // targetUserId === null means "open to the conversations list";
  // a uuid means "open + navigate to that user's 1-to-1 conversation,
  // creating it if necessary".
  chatPanel: { open: false, targetUserId: null },

  setTheme: (theme) => {
    if (typeof window !== "undefined") window.localStorage.setItem("mc-ui-theme", theme);
    set({ theme });
  },

  toggleTheme: () => {
    const current = get().theme;
    const idx = THEMES.indexOf(current);
    const next = THEMES[(idx + 1) % THEMES.length];
    get().setTheme(next);
  },

  setNavOpen: (navOpen) => set({ navOpen }),
  setCursorMode: (cursorMode) => set({ cursorMode }),

  /**
   * Open the chat panel, optionally pre-navigated to a user's conversation.
   * @param {string | null} [targetUserId]
   */
  openChatWith: (targetUserId = null) =>
    set({ chatPanel: { open: true, targetUserId } }),

  /** Toggle the chat panel (no target — matches the floating button's behaviour). */
  toggleChat: () => {
    const { open } = get().chatPanel;
    set({ chatPanel: { open: !open, targetUserId: null } });
  },

  /** Close the panel + clear any pending navigation target. */
  closeChat: () => set({ chatPanel: { open: false, targetUserId: null } }),

  /** Consumed by ChatPanel once it has acted on the target (so we don't re-open on re-render). */
  clearChatTarget: () =>
    set((s) => ({ chatPanel: { ...s.chatPanel, targetUserId: null } })),
}));
