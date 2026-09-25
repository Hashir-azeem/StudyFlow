import { describe, expect, it } from "vitest";
import {
  ambientPalette,
  drawAlpha,
  particleCount,
  seededRng,
  spawn,
  step,
  MAX_PARTICLES,
  MIN_PARTICLES,
  type ActiveEffect,
} from "../src/core/ambient";
import { channelsToRgb, contrastRatio, mix } from "../src/core/colors";
import { THEMES } from "../src/theme/themes";

const EFFECTS: ActiveEffect[] = ["snow", "sakura", "embers"];

describe("ambient accessibility", () => {
  it("keeps body and muted text at WCAG AA over any particle, on every theme", () => {
    for (const theme of Object.values(THEMES)) {
      const bg = channelsToRgb(theme.tokens.bg);
      const inks = [channelsToRgb(theme.tokens.text), channelsToRgb(theme.tokens.muted)];
      for (const effect of EFFECTS) {
        const { colors, layerOpacity } = ambientPalette(effect, theme);
        for (let a = 0; a <= layerOpacity + 1e-9; a += 0.01) {
          for (const c of colors) {
            const behind = mix(c, bg, a);
            for (const ink of inks) expect(contrastRatio(ink, behind)).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });

  it("still leaves every effect visible on every theme", () => {
    for (const theme of Object.values(THEMES)) {
      for (const effect of EFFECTS) {
        expect(ambientPalette(effect, theme).layerOpacity).toBeGreaterThanOrEqual(0.2);
      }
    }
  });
});

describe("ambient simulation", () => {
  it("scales particle count with viewport and intensity, within limits", () => {
    expect(particleCount("snow", 1920, 1080, 3)).toBeGreaterThanOrEqual(80);
    expect(particleCount("snow", 1920, 1080, 5) > particleCount("snow", 1920, 1080, 1)).toBe(true);
    expect(particleCount("snow", 7680, 4320, 5)).toBe(MAX_PARTICLES);
    expect(particleCount("embers", 320, 480, 1)).toBe(MIN_PARTICLES);
  });

  it("moves each effect in its direction and keeps values finite", () => {
    for (const effect of EFFECTS) {
      const rng = seededRng(42);
      const w = 1200;
      const h = 800;
      const p = spawn(effect, w, h, rng, 3, true);
      const y0 = p.y;
      const x0 = p.x;
      let alive = true;
      for (let i = 0; i < 30 && alive; i++) alive = step(effect, p, 1 / 60, i / 60, w, h);
      for (const v of [p.x, p.y, p.rot, drawAlpha(effect, p, 0.5, h)]) expect(Number.isFinite(v)).toBe(true);
      if (effect === "snow") expect(p.y > y0).toBe(true);
      if (effect === "embers") expect(p.y < y0).toBe(true);
      if (effect === "sakura") expect(p.x > x0 && p.y > y0).toBe(true);
      const a = drawAlpha(effect, p, 0.5, h);
      expect(a >= 0 && a <= 1).toBe(true);
    }
  });

  it("respawns particles that leave the screen", () => {
    const rng = seededRng(7);
    const p = spawn("snow", 400, 300, rng, 2, false);
    let steps = 0;
    while (step("snow", p, 0.05, steps * 0.05, 400, 300) && steps < 10_000) steps++;
    expect(steps < 10_000).toBe(true);
  });
});
