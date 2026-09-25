import { AmbientEngine, type EngineConfig } from "./engine";
import type { AmbientMessage } from "./protocol";

export interface AmbientDriver {
  readonly mode: "worker" | "main";
  configure(config: EngineConfig): void;
  resize(width: number, height: number, dpr: number): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

/**
 * Prefer a Web Worker with OffscreenCanvas (WebView2 on Windows, Chromium,
 * Firefox, Safari 16.4+). Fall back to the main thread where either is missing;
 * the engine's frame budget keeps that path light too.
 */
const NOOP_DRIVER: AmbientDriver = {
  mode: "main",
  configure: () => {},
  resize: () => {},
  setVisible: () => {},
  destroy: () => {},
};

export function createAmbientDriver(canvas: HTMLCanvasElement, width: number, height: number, dpr: number): AmbientDriver {
  const canUseWorker = typeof Worker !== "undefined" && typeof canvas.transferControlToOffscreen === "function";
  if (canUseWorker) {
    let worker: Worker | null = null;
    let transferred = false;
    try {
      worker = new Worker(new URL("./ambient.worker.ts", import.meta.url), { type: "module", name: "studyflow-ambient" });
      const offscreen = canvas.transferControlToOffscreen();
      transferred = true;
      const post = (msg: AmbientMessage, transfer: Transferable[] = []) => worker?.postMessage(msg, transfer);
      post({ type: "init", canvas: offscreen, width, height, dpr }, [offscreen]);
      return {
        mode: "worker",
        configure: (config) => post({ type: "config", config }),
        resize: (w, h, d) => post({ type: "resize", width: w, height: h, dpr: d }),
        setVisible: (visible) => post({ type: "visible", visible }),
        destroy: () => {
          post({ type: "destroy" });
          worker?.terminate();
          worker = null;
        },
      };
    } catch (err) {
      worker?.terminate();
      console.warn("[ambient] worker unavailable:", err);
      // A transferred canvas can't be drawn on from here any more: show nothing rather than fail.
      if (transferred) return NOOP_DRIVER;
    }
  }

  const engine = new AmbientEngine(canvas);
  engine.resize(width, height, dpr);
  return {
    mode: "main",
    configure: (config) => engine.configure(config),
    resize: (w, h, d) => engine.resize(w, h, d),
    setVisible: (visible) => engine.setVisible(visible),
    destroy: () => engine.destroy(),
  };
}
