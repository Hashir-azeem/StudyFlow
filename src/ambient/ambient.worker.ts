/**
 * Runs the particle simulation and drawing off the main thread, on an
 * OffscreenCanvas transferred from the page. The UI thread only posts small
 * config messages, so scrolling, typing, and dialogs never compete with it.
 */
import { AmbientEngine } from "./engine";
import type { AmbientMessage } from "./protocol";

let engine: AmbientEngine | null = null;

self.onmessage = (event: MessageEvent<AmbientMessage>) => {
  const msg = event.data;
  switch (msg.type) {
    case "init":
      engine = new AmbientEngine(msg.canvas, undefined, AmbientEngine.workerBudget());
      engine.resize(msg.width, msg.height, msg.dpr);
      break;
    case "config":
      engine?.configure(msg.config);
      break;
    case "resize":
      engine?.resize(msg.width, msg.height, msg.dpr);
      break;
    case "visible":
      engine?.setVisible(msg.visible);
      break;
    case "destroy":
      engine?.destroy();
      engine = null;
      self.close();
      break;
  }
};
