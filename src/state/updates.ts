import { useEffect } from "react";
import { create } from "zustand";
import { appVersion, checkForUpdate, installUpdate, type AvailableUpdate } from "../platform/updater";

type UpdateStatus = "idle" | "checking" | "current" | "available" | "installing" | "error" | "unsupported";

interface UpdateState {
  status: UpdateStatus;
  version: string | null;
  available: AvailableUpdate | null;
  /** 0–1 while downloading, null when the size is unknown. */
  progress: number | null;
  error: string | null;
  checkedAt: number | null;
  dismissed: boolean;
  check(opts?: { silent?: boolean }): Promise<void>;
  install(): Promise<void>;
  dismiss(): void;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export const useUpdates = create<UpdateState>()((set, get) => ({
  status: "idle",
  version: null,
  available: null,
  progress: null,
  error: null,
  checkedAt: null,
  dismissed: false,

  async check({ silent = false } = {}) {
    if (get().status === "checking" || get().status === "installing") return;
    if (!get().version) {
      const version = await appVersion().catch(() => null);
      if (!version) {
        set({ status: "unsupported" });
        return;
      }
      set({ version });
    }
    set({ status: "checking", error: null });
    try {
      const available = await checkForUpdate();
      set({
        status: available ? "available" : "current",
        available,
        checkedAt: Date.now(),
        // A newer version than the one dismissed brings the banner back.
        dismissed: get().dismissed && get().available?.version === available?.version,
      });
    } catch (err) {
      // Background checks fail quietly (offline is normal); manual checks report why.
      set({ status: silent ? "idle" : "error", error: silent ? null : message(err), checkedAt: Date.now() });
    }
  },

  async install() {
    if (get().status !== "available") return;
    set({ status: "installing", progress: 0, error: null });
    try {
      await installUpdate((progress) => set({ progress }));
    } catch (err) {
      set({ status: "available", error: `The update didn't install: ${message(err)}` });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));

const SIX_HOURS = 6 * 60 * 60 * 1000;

/** Check shortly after launch, then every six hours while the app stays open. */
export function useUpdateCheck(): void {
  const check = useUpdates((s) => s.check);
  useEffect(() => {
    const first = window.setTimeout(() => void check({ silent: true }), 5_000);
    const repeat = window.setInterval(() => void check({ silent: true }), SIX_HOURS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(repeat);
    };
  }, [check]);
}
