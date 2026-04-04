import { useEffect } from "react";
import AppRouter from "@/app/router";
import ErrorBoundary from "@/components/ErrorBoundary";
import OrgThemeProvider from "@/components/OrgThemeProvider";
import { AudioProvider } from "@/systems/AudioManager";
import { useUiStore } from "@/store/ui-store";

export default function App() {
  const theme = useUiStore((state) => state.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "cosmic") {
      root.removeAttribute("data-theme");
    } else {
      root.dataset.theme = theme;
    }
    root.style.colorScheme = theme === "light" ? "light" : "dark";
  }, [theme]);

  return (
    <ErrorBoundary>
      <AudioProvider>
        <OrgThemeProvider>
          <AppRouter />
        </OrgThemeProvider>
      </AudioProvider>
    </ErrorBoundary>
  );
}
