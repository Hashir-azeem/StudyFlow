import { useEffect } from "react";
import { useStore } from "../../state/store";

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
export const PALETTE_SHORTCUT = isMac ? "⌘K" : "Ctrl K";

/** Global Cmd+K / Ctrl+K. Works even while focus is inside an input. */
export function usePaletteHotkey(): void {
  const setOpen = useStore((s) => s.setPaletteOpen);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (isMac ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setOpen(!useStore.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}
