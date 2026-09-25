import type { EngineConfig } from "./engine";

/** Messages from the main thread to the ambient worker. */
export type AmbientMessage =
  | { type: "init"; canvas: OffscreenCanvas; width: number; height: number; dpr: number }
  | { type: "config"; config: EngineConfig }
  | { type: "resize"; width: number; height: number; dpr: number }
  | { type: "visible"; visible: boolean }
  | { type: "destroy" };
