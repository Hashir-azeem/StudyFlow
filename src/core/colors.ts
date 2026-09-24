import type { HexColor, RGBChannels, ThemeMode } from "./types";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: unknown): value is HexColor {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/** Accepts "#abc", "abc", "#aabbcc"; returns canonical lowercase "#aabbcc" or null. */
export function normalizeHex(value: string): HexColor | null {
  const m = HEX_RE.exec(value.trim());
  if (!m) return null;
  let hex = m[1]!.toLowerCase();
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return `#${hex}`;
}

export function hexToRgb(hex: HexColor): RGB {
  const n = normalizeHex(hex);
  if (!n) throw new RangeError(`Invalid hex color: ${hex}`);
  const int = parseInt(n.slice(1), 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export function rgbToHex({ r, g, b }: RGB): HexColor {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function toChannels({ r, g, b }: RGB): RGBChannels {
  return `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`;
}

export function channelsToRgb(channels: RGBChannels): RGB {
  const [r, g, b] = channels.trim().split(/\s+/).map(Number) as [number, number, number];
  return { r, g, b };
}

function relativeLuminance({ r, g, b }: RGB): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.x contrast ratio, 1–21. */
export function contrastRatio(a: RGB, b: RGB): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

interface HSL {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h / 6, s, l };
}

function hslToRgb({ h, s, l }: HSL): RGB {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const hue = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue(p, q, h + 1 / 3) * 255,
    g: hue(p, q, h) * 255,
    b: hue(p, q, h - 1 / 3) * 255,
  };
}

/**
 * Shift a color's lightness (keeping hue/saturation) until it reaches `minRatio`
 * against `background`. Moves darker on light themes and lighter on dark themes.
 */
export function ensureContrast(color: RGB, background: RGB, minRatio: number): RGB {
  if (contrastRatio(color, background) >= minRatio) return color;
  const hsl = rgbToHsl(color);
  const darken = relativeLuminance(background) > 0.4;
  for (let step = 1; step <= 50; step++) {
    const l = darken ? hsl.l - step * 0.02 : hsl.l + step * 0.02;
    const candidate = hslToRgb({ ...hsl, l: Math.min(1, Math.max(0, l)) });
    if (contrastRatio(candidate, background) >= minRatio) return candidate;
  }
  return darken ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
}

/** Composite `color` at `alpha` over `background` (what the eye sees for bg-course/15). */
export function mix(color: RGB, background: RGB, alpha: number): RGB {
  return {
    r: color.r * alpha + background.r * (1 - alpha),
    g: color.g * alpha + background.g * (1 - alpha),
    b: color.b * alpha + background.b * (1 - alpha),
  };
}

export interface CourseColorVars {
  /** Raw course color: stripes, dots, borders. */
  base: RGBChannels;
  /** Text/icons placed on a solid `base` fill. */
  onBase: RGBChannels;
  /** Opaque tinted background for chips and cards. */
  soft: RGBChannels;
  /** Text on `soft` and on the page background; always ≥ 4.5:1. */
  ink: RGBChannels;
}

/**
 * Derive a full, accessible color set for one course against one theme.
 * This is the heart of the color propagator: every badge, card, and calendar
 * chip reads from these variables, so a course recolor updates everywhere.
 */
export function deriveCourseColors(
  hex: HexColor,
  themeBg: RGBChannels,
  mode: ThemeMode,
): CourseColorVars {
  const base = hexToRgb(hex);
  const bg = channelsToRgb(themeBg);
  const soft = mix(base, bg, mode === "dark" ? 0.22 : 0.14);
  const black = { r: 17, g: 17, b: 20 };
  const white = { r: 255, g: 255, b: 255 };
  const onBase = contrastRatio(black, base) >= contrastRatio(white, base) ? black : white;
  // Ink must be readable on both the soft tint and the page background. Target a
  // hair above WCAG AA (4.5) so rounding to integer channels can't dip below it.
  const TARGET = 4.6;
  let ink = base;
  for (let pass = 0; pass < 4; pass++) {
    ink = ensureContrast(ensureContrast(ink, soft, TARGET), bg, TARGET);
    if (contrastRatio(ink, soft) >= TARGET && contrastRatio(ink, bg) >= TARGET) break;
  }
  return {
    base: toChannels(base),
    onBase: toChannels(onBase),
    soft: toChannels(soft),
    ink: toChannels(ink),
  };
}

/**
 * Replace a theme's accent with a user-chosen color, keeping it usable:
 * the accent is nudged until it reads against the page (3:1, WCAG for UI
 * components), and its foreground is whichever of near-black/white contrasts more.
 */
export function accentOverride(hex: HexColor, themeBg: RGBChannels): { accent: RGBChannels; accentFg: RGBChannels } {
  const bg = channelsToRgb(themeBg);
  // 3.1 rather than 3: leaves room for rounding to integer channels.
  const accent = ensureContrast(hexToRgb(hex), bg, 3.1);
  const black = { r: 17, g: 17, b: 20 };
  const white = { r: 255, g: 255, b: 255 };
  const fg = contrastRatio(black, accent) >= contrastRatio(white, accent) ? black : white;
  return { accent: toChannels(accent), accentFg: toChannels(fg) };
}

/** Curated defaults that survive every built-in theme. */
export const DEFAULT_COURSE_COLORS: HexColor[] = [
  "#4f7cff", "#e2557b", "#1fa98a", "#f59e0b",
  "#8b5cf6", "#0ea5e9", "#ef6c3a", "#65a30d",
  "#d946ef", "#14b8a6", "#e11d48", "#64748b",
];

/** Pick the first palette color not already used, cycling when all are taken. */
export function nextCourseColor(used: HexColor[], palette: HexColor[] = DEFAULT_COURSE_COLORS): HexColor {
  const taken = new Set(used.map((c) => c.toLowerCase()));
  return palette.find((c) => !taken.has(c.toLowerCase())) ?? palette[used.length % palette.length]!;
}
