import {
  drawAlpha,
  particleCount,
  spawn,
  step,
  tumble,
  MIN_PARTICLES,
  type ActiveEffect,
  type Particle,
} from "../core/ambient";
import type { RGB } from "../core/colors";
import type { AmbientIntensity } from "../core/types";

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface EngineConfig {
  effect: ActiveEffect;
  intensity: AmbientIntensity;
  motion: boolean;
  colors: RGB[];
}

/** requestAnimationFrame where available (main thread, Chromium workers), else a 60 Hz timer. */
export type Scheduler = {
  request(cb: (now: number) => void): number;
  cancel(id: number): void;
};

export function defaultScheduler(): Scheduler {
  const g = globalThis as unknown as {
    requestAnimationFrame?: (cb: (now: number) => void) => number;
    cancelAnimationFrame?: (id: number) => void;
  };
  if (typeof g.requestAnimationFrame === "function" && typeof g.cancelAnimationFrame === "function") {
    return { request: (cb) => g.requestAnimationFrame!(cb), cancel: (id) => g.cancelAnimationFrame!(id) };
  }
  return {
    request: (cb) => setTimeout(() => cb(performance.now()), 1000 / 60) as unknown as number,
    cancel: (id) => clearTimeout(id),
  };
}

function makeCanvas(size: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(size, size);
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return c;
}

const rgba = ({ r, g, b }: RGB, a: number) => `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${a})`;

/**
 * Draw each particle shape once per palette color. Frames then only call
 * drawImage, which is far cheaper than building gradients and paths per particle.
 */
function buildSprites(effect: ActiveEffect, colors: RGB[]): AnyCanvas[] {
  return colors.map((color) => {
    const size = effect === "sakura" ? 64 : effect === "embers" ? 64 : 32;
    const canvas = makeCanvas(size);
    const ctx = canvas.getContext("2d") as Ctx2D | null;
    if (!ctx) return canvas;
    const c = size / 2;
    if (effect === "snow") {
      const g = ctx.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, rgba(color, 1));
      g.addColorStop(0.45, rgba(color, 0.85));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    } else if (effect === "embers") {
      // Hot core plus a soft glow; alpha stays ≤ 1, so the layer opacity cap still holds.
      const g = ctx.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, rgba({ r: 255, g: 240, b: 200 }, 1));
      g.addColorStop(0.12, rgba(color, 1));
      g.addColorStop(0.35, rgba(color, 0.35));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    } else {
      // Sakura petal: two curves meeting at a notched tip.
      ctx.translate(c, c);
      const s = size * 0.42;
      const grad = ctx.createLinearGradient(-s, 0, s, 0);
      grad.addColorStop(0, rgba(color, 1));
      grad.addColorStop(1, rgba({ r: Math.min(255, color.r + 20), g: Math.min(255, color.g + 30), b: Math.min(255, color.b + 30) }, 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.bezierCurveTo(-s * 0.4, -s * 0.9, s * 0.6, -s * 0.7, s, -s * 0.12);
      ctx.lineTo(s * 0.78, 0);
      ctx.lineTo(s, s * 0.12);
      ctx.bezierCurveTo(s * 0.6, s * 0.7, -s * 0.4, s * 0.9, -s, 0);
      ctx.fill();
    }
    return canvas;
  });
}

/** Rendered size (px) relative to the particle's `size`. */
const DRAW_SCALE: Record<ActiveEffect, number> = { snow: 2.6, sakura: 1.6, embers: 5 };

/** Main-thread work budget per frame before the engine thins particles. Workers get more room. */
const BUDGET_MS = { main: 4, worker: 8 };

export class AmbientEngine {
  private ctx: Ctx2D | null;
  private particles: Particle[] = [];
  private sprites: AnyCanvas[] = [];
  private config: EngineConfig | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private visible = true;
  private frameId: number | null = null;
  private last = 0;
  private t = 0;
  private costEma = 0;
  /** Adaptive cap, lowered when frames run over budget. */
  private capFactor = 1;
  private readonly rng = Math.random;
  private readonly canvas: AnyCanvas;
  private readonly scheduler: Scheduler;
  private readonly budgetMs: number;

  constructor(canvas: AnyCanvas, scheduler: Scheduler = defaultScheduler(), budgetMs: number = BUDGET_MS.main) {
    this.canvas = canvas;
    this.scheduler = scheduler;
    this.budgetMs = budgetMs;
    this.ctx = canvas.getContext("2d", { alpha: true }) as Ctx2D | null;
  }

  static workerBudget(): number {
    return BUDGET_MS.worker;
  }

  configure(next: EngineConfig): void {
    const prev = this.config;
    this.config = next;
    const effectChanged = !prev || prev.effect !== next.effect;
    if (effectChanged || prev.colors !== next.colors) this.sprites = buildSprites(next.effect, next.colors);
    if (effectChanged) {
      this.particles = [];
      this.capFactor = 1;
    }
    this.fill(effectChanged);
    this.restart();
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.dpr = dpr;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.fill(false);
    this.restart();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.restart();
  }

  destroy(): void {
    this.stop();
    this.particles = [];
    this.sprites = [];
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Match the particle count to viewport, intensity, and adaptive cap. */
  private fill(scatterAll: boolean): void {
    const cfg = this.config;
    if (!cfg || this.width <= 1) return;
    const target = Math.max(
      MIN_PARTICLES,
      Math.round(particleCount(cfg.effect, this.width, this.height, cfg.intensity) * this.capFactor),
    );
    if (this.particles.length > target) this.particles.length = target;
    while (this.particles.length < target) {
      this.particles.push(spawn(cfg.effect, this.width, this.height, this.rng, cfg.colors.length, true));
    }
    if (scatterAll) {
      for (let i = 0; i < this.particles.length; i++) {
        this.particles[i] = spawn(cfg.effect, this.width, this.height, this.rng, cfg.colors.length, true);
      }
    }
  }

  private restart(): void {
    this.stop();
    if (!this.config || this.width <= 1) return;
    this.draw();
    if (this.config.motion && this.visible) {
      this.last = performance.now();
      this.frameId = this.scheduler.request(this.tick);
    }
  }

  private stop(): void {
    if (this.frameId !== null) this.scheduler.cancel(this.frameId);
    this.frameId = null;
  }

  private tick = (now: number): void => {
    const cfg = this.config;
    if (!cfg) return;
    const started = performance.now();
    // Clamp dt so a long pause (sleep, hidden tab) doesn't teleport particles.
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.t += dt;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!;
      if (!step(cfg.effect, p, dt, this.t, this.width, this.height)) {
        this.particles[i] = spawn(cfg.effect, this.width, this.height, this.rng, cfg.colors.length, false);
      }
    }
    this.draw();
    this.adapt(performance.now() - started);
    this.frameId = this.scheduler.request(this.tick);
  };

  /** Thin the particle count by 20% whenever average work time exceeds the budget. */
  private adapt(cost: number): void {
    this.costEma = this.costEma * 0.92 + cost * 0.08;
    if (this.costEma > this.budgetMs && this.capFactor > 0.25) {
      this.capFactor *= 0.8;
      this.costEma = this.budgetMs * 0.75;
      this.fill(false);
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    const cfg = this.config;
    if (!ctx || !cfg) return;
    const { dpr, width, height, t } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const scale = DRAW_SCALE[cfg.effect];

    for (const p of this.particles) {
      const alpha = drawAlpha(cfg.effect, p, t, height);
      if (alpha <= 0.01 || p.x < -60 || p.x > width + 60) continue;
      const sprite = this.sprites[p.color];
      if (!sprite) continue;
      const size = p.size * scale;
      ctx.globalAlpha = alpha;
      if (cfg.effect === "sakura") {
        const c = Math.cos(p.rot);
        const s = Math.sin(p.rot);
        // Squash one axis as the petal flips; keep a sliver so it never vanishes.
        const f = Math.max(0.18, Math.abs(tumble(p, t)));
        ctx.setTransform(dpr * c, dpr * s, -dpr * s * f, dpr * c * f, dpr * p.x, dpr * p.y);
        ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      } else {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size);
      }
    }
    ctx.globalAlpha = 1;
  }
}
