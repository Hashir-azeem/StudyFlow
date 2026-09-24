import { useLayoutEffect, type ReactNode } from "react";
import type { ThemeTokens } from "../core/types";
import { CourseColorPropagator } from "./CourseColorPropagator";
import { useResolvedTheme } from "./useResolvedTheme";

const TOKEN_VARS: Record<keyof ThemeTokens, string> = {
  bg: "--c-bg",
  surface: "--c-surface",
  surface2: "--c-surface-2",
  border: "--c-border",
  text: "--c-text",
  muted: "--c-muted",
  accent: "--c-accent",
  accentFg: "--c-accent-fg",
  danger: "--c-danger",
  warning: "--c-warning",
  success: "--c-success",
};

/**
 * Writes the active theme's tokens onto <html>. useLayoutEffect runs before
 * paint, so switching themes never flashes the previous palette.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useResolvedTheme();

  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const [key, cssVar] of Object.entries(TOKEN_VARS) as Array<[keyof ThemeTokens, string]>) {
      root.style.setProperty(cssVar, theme.tokens[key]);
    }
    root.dataset.theme = theme.id;
    root.classList.toggle("dark", theme.mode === "dark");
    root.style.colorScheme = theme.mode;
    // Remembered for the pre-React boot script in index.html (prevents a white flash on launch).
    try {
      localStorage.setItem("studyflow:boot-theme", JSON.stringify({ mode: theme.mode, bg: theme.tokens.bg }));
    } catch {
      /* storage unavailable: the boot script falls back to the OS setting */
    }
  }, [theme]);

  return (
    <>
      <CourseColorPropagator theme={theme} />
      {children}
    </>
  );
}
