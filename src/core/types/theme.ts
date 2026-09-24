import type { HexColor } from "./course";

export type ThemeMode = "light" | "dark" | "system";

export type ThemePresetId =
  | "minimal-light"
  | "minimal-dark"
  | "pastel"
  | "synthwave"
  | "mono";

export interface ThemeTokens {
  bg: HexColor;
  bgSubtle: HexColor;
  surface: HexColor;
  border: HexColor;
  text: HexColor;
  textMuted: HexColor;
  accent: HexColor;
  accentFg: HexColor;
  danger: HexColor;
  warning: HexColor;
  success: HexColor;
}

export interface ThemePreset {
  id: ThemePresetId;
  label: string;
  mode: Exclude<ThemeMode, "system">;
  tokens: ThemeTokens;
}

export interface AppTheme {
  presetId: ThemePresetId;
  mode: ThemeMode;
  customAccent?: HexColor;
}

export const COURSE_PALETTE: HexColor[] = [
  "#7C9CFF",
  "#F4A6C8",
  "#8FD3C8",
  "#F6C177",
  "#C4B5FD",
  "#FB7185",
  "#67E8F9",
  "#A3A3A3",
];
