import { channelsToRgb, contrastRatio, mix, type RGB } from "./colors";
import type { AmbientEffect, AmbientIntensity, Theme } from "./types";

/**
 * Ambient particle effects, framework-free so the same code runs on the main
 * thread, inside a Web Worker, and in unit tests.
 *
 * Accessibility model
 * -------------------
 * Particles are drawn into one canvas layer whose CSS opacity is capped at
 * `layerOpacity`. Whatever the particles do (overlap, glow, flicker), every
 * canvas pixel has alpha ≤ 1, so what the eye sees behind any text is at most
 *   mix(particleColor, pageBackground, layerOpacity).
 * `layerOpacity` is the largest value for which body text AND muted text
 * still reach WCAG AA 4.5:1 against that worst case, for every particle color
 * and every blend of two of them. Cards and dialogs are opaque, so text on
 * them is never affected at all.
 */

export type ActiveEffect = Exclude<AmbientEffect, "none">;

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  /** Rotation speed (sakura). */
  vr: number;
  /** Base opacity before fades and flicker, 0–1. */
  alpha: number;
  /** Random phase so particles don't move in lockstep. */
  phase: number;
  /** Sway / wander amplitude in px. */
  amp: number;
  /** Sway / flicker / tumble frequency in rad/s. */
  freq: number;
  /** Index into the palette. */
  color: number;
  /** Seconds alive, and lifetime (embers only). */
  life: number;
  maxLife: number;
}

export type Rng = () => number;

/** Small, fast, seedable PRNG (mulberry32) so tests are deterministic. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);

/* ------------------------------------------------------------------ colors */

const PALETTES: Record<ActiveEffect, { dark: RGB[]; light: RGB[] }> = {
  snow: {
    dark: [{ r: 255, g: 255, b: 255 }, { r: 222, g: 233, b: 255 }],
    // White is invisible on light pages; a cool slate reads as "snow" there.
    light: [{ r: 148, g: 163, b: 184 }, { r: 125, g: 146, b: 180 }],
  },
  sakura: {
    dark: [{ r: 255, g: 183, b: 197 }, { r: 255, g: 209, b: 220 }, { r: 244, g: 143, b: 177 }],
    light: [{ r: 236, g: 112, b: 153 }, { r: 244, g: 143, b: 177 }, { r: 219, g: 112, b: 147 }],
  },
  embers: {
    dark: [{ r: 255, g: 150, b: 60 }, { r: 255, g: 110, b: 40 }, { r: 255, g: 196, b: 90 }],
    light: [{ r: 234, g: 88, b: 12 }, { r: 220, g: 60, b: 20 }, { r: 245, g: 130, b: 30 }],
  },
};

/** Upper bound regardless of contrast headroom: ambience, not decoration overload. */
const CEILING: Record<ActiveEffect, number> = { snow: 0.9, sakura: 0.85, embers: 0.9 };
const MIN_TEXT_CONTRAST = 4.5;

function midpoint(a: RGB, b: RGB): RGB {
  return { r: (a.r + b.r) / 2, g: (a.g + b.g) / 2, b: (a.b + b.b) / 2 };
}

/**
 * Largest layer opacity (0.01 steps) such that, for every opacity from 0 up to
 * it, text and muted text keep ≥ 4.5:1 over the particle colors (and blends of
 * any two). Scanning upward, not bisecting, because contrast isn't guaranteed
 * to change monotonically with alpha.
 */
export function safeLayerOpacity(colors: RGB[], theme: Theme, ceiling = 1): number {
  const bg = channelsToRgb(theme.tokens.bg);
  const inks = [channelsToRgb(theme.tokens.text), channelsToRgb(theme.tokens.muted)];
  const samples = [...colors];
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) samples.push(midpoint(colors[i]!, colors[j]!));
  }
  const ok = (alpha: number) =>
    samples.every((c) => {
      const behind = mix(c, bg, alpha);
      return inks.every((ink) => contrastRatio(ink, behind) >= MIN_TEXT_CONTRAST);
    });
  let safe = 0;
  for (let a = 0.01; a <= ceiling + 1e-9; a += 0.01) {
    if (!ok(a)) break;
    safe = a;
  }
  return Math.round(safe * 100) / 100;
}

export interface AmbientPalette {
  colors: RGB[];
  /** CSS opacity for the whole particle layer. */
  layerOpacity: number;
}

export function ambientPalette(effect: ActiveEffect, theme: Theme): AmbientPalette {
  const colors = PALETTES[effect][theme.mode];
  return { colors, layerOpacity: safeLayerOpacity(colors, theme, CEILING[effect]) };
}

/* ----------------------------------------------------------------- density */

const DENSITY: Record<AmbientIntensity, number> = { 1: 0.35, 2: 0.65, 3: 1, 4: 1.35, 5: 1.7 };
/** Particles per 10,000 px² of viewport at intensity 3. */
const RATE: Record<ActiveEffect, number> = { snow: 0.55, sakura: 0.2, embers: 0.28 };
export const MAX_PARTICLES = 360;
export const MIN_PARTICLES = 8;

export function particleCount(effect: ActiveEffect, width: number, height: number, intensity: AmbientIntensity): number {
  const n = Math.round(((width * height) / 10_000) * RATE[effect] * DENSITY[intensity]);
  return Math.max(MIN_PARTICLES, Math.min(MAX_PARTICLES, n));
}

/* -------------------------------------------------------------- simulation */

/**
 * Create a particle. `scatter` places it anywhere on screen (first frame and
 * still mode); otherwise it enters from the edge its effect flows from.
 */
export function spawn(effect: ActiveEffect, w: number, h: number, rng: Rng, paletteSize: number, scatter: boolean): Particle {
  const base: Particle = {
    x: rng() * w,
    y: rng() * h,
    vx: 0,
    vy: 0,
    size: 2,
    rot: rng() * Math.PI * 2,
    vr: 0,
    alpha: 1,
    phase: rng() * Math.PI * 2,
    amp: 0,
    freq: 1,
    color: Math.floor(rng() * paletteSize) % Math.max(1, paletteSize),
    life: 0,
    maxLife: 1,
  };
  switch (effect) {
    case "snow": {
      base.size = between(rng, 1.4, 4.2);
      // Larger flakes fall faster: reads as depth.
      base.vy = 14 + base.size * between(rng, 6, 11);
      base.amp = between(rng, 8, 28);
      base.freq = between(rng, 0.3, 0.9);
      base.alpha = between(rng, 0.45, 1);
      if (!scatter) base.y = -base.size * 3;
      return base;
    }
    case "sakura": {
      base.size = between(rng, 7, 13);
      base.vx = between(rng, 18, 50);
      base.vy = between(rng, 26, 60);
      base.vr = between(rng, 0.6, 2) * (rng() < 0.5 ? -1 : 1);
      base.amp = between(rng, 6, 20);
      base.freq = between(rng, 1, 2.6);
      base.alpha = between(rng, 0.65, 1);
      if (!scatter) {
        // Drift in diagonally: from the top edge or the left edge.
        if (rng() < 0.65) {
          base.x = between(rng, -0.25 * w, w);
          base.y = -base.size * 2;
        } else {
          base.x = -base.size * 2;
          base.y = between(rng, 0, 0.7 * h);
        }
      }
      return base;
    }
    case "embers": {
      base.size = between(rng, 1.3, 3.4);
      base.vy = -between(rng, 14, 42);
      base.amp = between(rng, 6, 18);
      base.freq = between(rng, 3, 8);
      base.alpha = between(rng, 0.55, 1);
      // Rise through part of the screen, then burn out.
      base.maxLife = (h * between(rng, 0.35, 0.9)) / Math.abs(base.vy);
      if (scatter) base.life = rng() * base.maxLife;
      else base.y = h + base.size * 4;
      return base;
    }
  }
}

/** Advance one particle by dt seconds. Returns false when it should respawn. */
export function step(effect: ActiveEffect, p: Particle, dt: number, t: number, w: number, h: number): boolean {
  switch (effect) {
    case "snow":
      p.y += p.vy * dt;
      p.x += Math.sin(p.phase + t * p.freq) * p.amp * p.freq * dt;
      return p.y < h + p.size * 3 && p.x > -40 && p.x < w + 40;
    case "sakura":
      p.x += (p.vx + Math.sin(p.phase + t * p.freq) * p.amp) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      return p.x < w + p.size * 3 && p.y < h + p.size * 3;
    case "embers":
      p.y += p.vy * dt;
      p.x += Math.sin(p.phase + t * p.freq * 0.35) * p.amp * dt;
      p.life += dt;
      return p.life < p.maxLife && p.y > -p.size * 4;
  }
}

/** Opacity to draw this frame (fades and flicker), 0–1. */
export function drawAlpha(effect: ActiveEffect, p: Particle, t: number, h: number): number {
  switch (effect) {
    case "snow": {
      const fadeIn = Math.min(1, (p.y + p.size * 3) / (h * 0.06 + 1));
      const fadeOut = Math.min(1, (h - p.y) / (h * 0.12 + 1));
      return clamp01(p.alpha * Math.max(0, Math.min(fadeIn, fadeOut)));
    }
    case "sakura":
      return clamp01(p.alpha);
    case "embers": {
      const lifeFade = Math.sin(Math.PI * Math.min(1, p.life / p.maxLife));
      const flicker = 0.62 + 0.38 * Math.sin(t * p.freq + p.phase);
      return clamp01(p.alpha * lifeFade * flicker);
    }
  }
}

/** Sakura tumble: the petal's apparent width as it flips, -1…1. */
export function tumble(p: Particle, t: number): number {
  return Math.cos(p.phase + t * p.freq);
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
