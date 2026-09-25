import { useSyncExternalStore } from "react";
import { useStore } from "../state/store";

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const mql = window.matchMedia(REDUCED);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
};

/** True when the OS asks apps to minimise motion. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);
}

/** Resolved motion: the user's choice, with "auto" deferring to the OS setting. */
export function useAmbientMotion(): boolean {
  const motion = useStore((s) => s.settings.ambient.motion);
  const reduced = usePrefersReducedMotion();
  return motion === "on" || (motion === "auto" && !reduced);
}
