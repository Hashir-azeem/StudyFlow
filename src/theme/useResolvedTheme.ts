import { useMemo, useSyncExternalStore } from "react";
import { accentOverride } from "../core/colors";
import type { Theme } from "../core/types";
import { useStore } from "../state/store";
import { THEMES } from "./themes";

const QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const getSystemDark = () => window.matchMedia(QUERY).matches;

/**
 * The concrete theme in effect: follows the OS when the preference is "system"
 * (switching the whole palette, not just color-scheme), then applies the user's
 * custom accent if they picked one.
 */
export function useResolvedTheme(): Theme {
  const preference = useStore((s) => s.settings.theme);
  const accent = useStore((s) => s.settings.accent);
  const systemDark = useSyncExternalStore(subscribe, getSystemDark, () => false);
  const base = preference === "system" ? (systemDark ? THEMES.dark : THEMES.light) : THEMES[preference];
  return useMemo(() => {
    if (!accent) return base;
    return { ...base, tokens: { ...base.tokens, ...accentOverride(accent, base.tokens.bg) } };
  }, [base, accent]);
}
