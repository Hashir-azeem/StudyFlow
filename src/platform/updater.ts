import { isTauri } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";

export interface AvailableUpdate {
  version: string;
  currentVersion: string;
  notes: string | null;
  date: string | null;
}

/** The pending Update handle. Kept out of React state because it isn't serialisable. */
let pending: Update | null = null;

/** The installed app's version, or null in a plain browser. */
export async function appVersion(): Promise<string | null> {
  if (!isTauri()) return null;
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

/**
 * Ask the release feed whether a newer signed build exists.
 * Returns null when up to date. Throws when offline or when updates aren't
 * available on this platform (browser dev, iOS/Android).
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!isTauri()) throw new Error("Updates are only available in the installed desktop app.");
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  pending = update;
  if (!update) return null;
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body?.trim() || null,
    date: update.date ?? null,
  };
}

/**
 * Download, verify the signature, install, and restart. On Windows the
 * installer closes the app itself partway through; relaunch covers macOS/Linux.
 */
export async function installUpdate(onProgress: (fraction: number | null) => void): Promise<void> {
  if (!pending) throw new Error("No update has been found yet. Check for updates first.");
  let total = 0;
  let received = 0;
  await pending.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
      onProgress(total ? 0 : null);
    } else if (event.event === "Progress") {
      received += event.data.chunkLength;
      onProgress(total ? Math.min(1, received / total) : null);
    } else {
      onProgress(1);
    }
  });
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
