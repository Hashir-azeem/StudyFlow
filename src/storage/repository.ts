import type { Assessment, Course, ID, Settings, Snapshot } from "../core/types";

/**
 * The only door between the app and persistence. UI and state code depend on
 * this interface, never on SQLite or IndexedDB directly, so the backend can be
 * swapped (desktop, iOS, Android, browser dev server, tests) without touching
 * a single component.
 */
export interface Repository {
  readonly backend: "sqlite" | "indexeddb" | "memory";
  init(): Promise<void>;

  listCourses(): Promise<Course[]>;
  upsertCourse(course: Course): Promise<void>;
  /** Also deletes every assessment linked to the course. */
  deleteCourse(id: ID): Promise<void>;

  listAssessments(): Promise<Assessment[]>;
  upsertAssessment(assessment: Assessment): Promise<void>;
  deleteAssessment(id: ID): Promise<void>;

  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;

  exportSnapshot(): Promise<Snapshot>;
  /** Replaces all data. Validates first so a bad file never wipes good data. */
  importSnapshot(snapshot: Snapshot): Promise<void>;
}

export class StorageError extends Error {
  readonly operation: string;

  constructor(message: string, operation: string, cause?: unknown) {
    // Native ES2022 error cause: shows up in devtools and error reporters.
    super(message, { cause });
    this.name = "StorageError";
    this.operation = operation;
  }
}

/** Wrap backend errors with a message a student can act on. */
export async function guard<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StorageError) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new StorageError(`Couldn't ${operation}. Your last change wasn't saved. (${detail})`, operation, err);
  }
}
