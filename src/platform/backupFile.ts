import { isTauri } from "@tauri-apps/api/core";
import type { Snapshot } from "../core/types";

const FILTERS = [{ name: "StudyFlow backup", extensions: ["json"] }];

export function backupFileName(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `studyflow-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/**
 * Save a backup where the user chooses. Returns false if they cancelled.
 * Tauri uses the native save dialog (the chosen path is added to the fs scope
 * automatically); the browser falls back to a regular download.
 */
export async function saveBackupFile(snapshot: Snapshot): Promise<boolean> {
  const json = JSON.stringify(snapshot, null, 2);
  if (isTauri()) {
    const [{ save }, { writeTextFile }] = await Promise.all([
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/plugin-fs"),
    ]);
    const path = await save({ defaultPath: backupFileName(), filters: FILTERS });
    if (!path) return false;
    await writeTextFile(path, json);
    return true;
  }
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFileName();
    document.body.append(a);
    a.click();
    a.remove();
  } finally {
    // Revoke after the click has been handled.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return true;
}

/** Let the user pick a backup and return its parsed JSON, or null if they cancelled. */
export async function openBackupFile(): Promise<unknown | null> {
  let text: string | null;
  if (isTauri()) {
    const [{ open }, { readTextFile }] = await Promise.all([
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/plugin-fs"),
    ]);
    const path = await open({ multiple: false, directory: false, filters: FILTERS });
    if (!path || Array.isArray(path)) return null;
    text = await readTextFile(path);
  } else {
    text = await pickFileInBrowser();
  }
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("That file isn't valid JSON, so it can't be a StudyFlow backup.");
  }
}

function pickFileInBrowser(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(resolve, reject);
    };
    // Fires in modern browsers when the picker is dismissed.
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}
