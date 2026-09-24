import type { HexColor } from "../types/course";
import type { AppTheme, ThemePreset, ThemeTokens } from "../types/theme";
import { presetById } from "./presets";

export interface ResolvedTheme {
  preset: ThemePreset;
  tokens: ThemeTokens;
  colorScheme: "light" | "dark";
}

export function resolveTheme(
  theme: AppTheme,
  systemDark: boolean,
): ResolvedTheme {
  const preset = presetById(theme.presetId);
  const colorScheme =
    theme.mode === "system" ? (systemDark ? "dark" : "light") : theme.mode;

  const tokens: ThemeTokens = {
    ...preset.tokens,
    ...(theme.customAccent
      ? {
          accent: theme.customAccent,
          accentFg: contrastOn(theme.customAccent),
        }
      : {}),
  };

  return { preset, tokens, colorScheme };
}

function contrastOn(hex: HexColor): HexColor {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#121214" : "#FFFFFF";
}
