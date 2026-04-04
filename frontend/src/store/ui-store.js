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
}));
