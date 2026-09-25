import { useEffect, useMemo, useRef } from "react";
import { ambientPalette } from "../core/ambient";
import { useStore } from "../state/store";
import { useResolvedTheme } from "../theme/useResolvedTheme";
import { createAmbientDriver, type AmbientDriver } from "./driver";
import { useAmbientMotion } from "./motion";

// Soft particles don't need full retina resolution; capping saves fill-rate on 4K screens.
const dprNow = () => Math.min(window.devicePixelRatio || 1, 1.5);

/**
 * Full-screen particle layer behind the app. Decorative only: hidden from
 * assistive tech, ignores the pointer, and capped in opacity so text contrast
 * holds (see core/ambient.ts). Pauses while the window is hidden and renders
 * a single still frame when motion is off.
 */
export function AmbientBackground() {
  const effect = useStore((s) => s.settings.ambient.effect);
  const intensity = useStore((s) => s.settings.ambient.intensity);
  const motion = useAmbientMotion();
  const theme = useResolvedTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const driverRef = useRef<AmbientDriver | null>(null);
  const enabled = effect !== "none";

  const palette = useMemo(() => (effect === "none" ? null : ambientPalette(effect, theme)), [effect, theme]);

  // Create the canvas imperatively: an OffscreenCanvas transfer can happen only
  // once per element, and StrictMode mounts effects twice in development.
  useEffect(() => {
    const host = hostRef.current;
    if (!enabled || !host) return;
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    host.append(canvas);
    const driver = createAmbientDriver(canvas, window.innerWidth, window.innerHeight, dprNow());
    driverRef.current = driver;

    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => driver.resize(window.innerWidth, window.innerHeight, dprNow()));
    };
    const onVisibility = () => driver.setVisible(document.visibilityState === "visible");
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      driver.destroy();
      canvas.remove();
      driverRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (effect === "none" || !palette) return;
    driverRef.current?.configure({ effect, intensity, motion, colors: palette.colors });
  }, [effect, intensity, motion, palette]);

  if (!enabled || !palette) return null;
  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden transition-opacity duration-500"
      style={{ opacity: palette.layerOpacity }}
    />
  );
}
