import { isTauri } from "@tauri-apps/api/core";
import type { Repository } from "./repository";

export type { Repository } from "./repository";
export { StorageError } from "./repository";

/**
 * Pick the backend at runtime. Backends are code-split with dynamic import,
 * so the browser bundle never loads the Tauri SQL bindings and vice versa.
 *   Tauri desktop / iOS / Android → SQLite (app-owned file, survives eviction)
 *   Plain browser (vite dev)      → IndexedDB via Dexie
 *   Anything failing to open      → in-memory, with `degraded: true` so the UI can warn
 */
export async function createRepository(): Promise<{ repo: Repository; degraded: boolean }> {
  try {
    const repo: Repository = isTauri()
      ? new (await import("./sqliteRepository")).SqliteRepository()
      : new (await import("./dexieRepository")).DexieRepository();
    await repo.init();
    return { repo, degraded: false };
  } catch (err) {
    console.error("[storage] falling back to memory:", err);
    const { MemoryRepository } = await import("./memoryRepository");
    const repo = new MemoryRepository();
    await repo.init();
    return { repo, degraded: true };
  }
}
