import { DEFAULT_COURSE_COLORS } from "../core/colors";
import type { Theme, ThemeId } from "../core/types";

/**
 * Every token is an "R G B" triplet consumed as rgb(var(--c-*)) so Tailwind
 * opacity modifiers (bg-accent/10) work. Add a theme by adding an entry here;
 * nothing else needs to change.
 */
export const THEMES: Record<ThemeId, Theme> = {
  light: {
    id: "light",
    name: "Daylight",
    mode: "light",
    tokens: {
      bg: "245 246 249",
      surface: "255 255 255",
      surface2: "236 239 244",
      border: "220 224 232",
      text: "22 27 38",
      muted: "92 100 117",
      accent: "52 88 214",
      accentFg: "255 255 255",
      danger: "200 45 60",
      warning: "176 106 0",
      success: "22 132 90",
    },
    coursePalette: DEFAULT_COURSE_COLORS,
  },
  dark: {
    id: "dark",
    name: "Late night",
    mode: "dark",
    tokens: {
      bg: "16 19 27",
      surface: "23 27 37",
      surface2: "32 37 50",
      border: "46 52 68",
      text: "232 235 242",
      muted: "150 158 176",
      accent: "132 156 255",
      accentFg: "16 19 27",
      danger: "255 120 130",
      warning: "245 190 90",
      success: "90 210 160",
    },
    coursePalette: DEFAULT_COURSE_COLORS,
  },
  pastel: {
    id: "pastel",
    name: "Pastel",
    mode: "light",
    tokens: {
      bg: "249 246 252",
      surface: "255 255 255",
      surface2: "242 236 249",
      border: "229 220 240",
      text: "44 36 64",
      muted: "110 100 134",
      accent: "132 94 196",
      accentFg: "255 255 255",
      danger: "196 64 96",
      warning: "168 110 20",
      success: "40 138 110",
    },
    coursePalette: [
      "#f4a6b8", "#a7c7f2", "#b5e2c4", "#f7cf8f", "#c9b3f0", "#9fdcd6",
      "#f5b895", "#d6e7a1", "#e8b4e4", "#a3d2f0", "#f2a4a4", "#b8bfd0",
    ],
  },
  synthwave: {
    id: "synthwave",
    name: "Synthwave",
    mode: "dark",
    tokens: {
      bg: "22 13 38",
      surface: "33 19 55",
      surface2: "46 27 74",
      border: "72 45 106",
      text: "246 234 255",
      muted: "188 162 216",
      accent: "255 92 190",
      accentFg: "22 13 38",
      danger: "255 105 120",
      warning: "255 200 87",
      success: "80 250 200",
    },
    coursePalette: [
      "#ff5cbe", "#36f9f6", "#fede5d", "#b893ff", "#72f1b8", "#ff8b39",
      "#fe4450", "#03edf9", "#f97e72", "#9d7cd8", "#61e2ff", "#c792ea",
    ],
  },
  mono: {
    id: "mono",
    name: "Monochrome",
    mode: "light",
    tokens: {
      bg: "250 250 250",
      surface: "255 255 255",
      surface2: "240 240 240",
      border: "224 224 224",
      text: "20 20 20",
      muted: "108 108 108",
      accent: "20 20 20",
      accentFg: "255 255 255",
      danger: "180 30 30",
      warning: "140 90 0",
      success: "30 110 60",
    },
    coursePalette: [
      "#1f1f1f", "#4a4a4a", "#767676", "#9a9a9a", "#2f4858", "#5b6770",
      "#3d3d3d", "#606060", "#848484", "#34495e", "#555b6e", "#6b705c",
    ],
  },
};

export const THEME_LIST: Theme[] = Object.values(THEMES);
