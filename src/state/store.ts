import { create } from "zustand";
import { todayISO } from "../core/dates";
import { buildSampleData } from "../core/sampleData";
import {
  newId,
  validateAssessment,
  validateCourse,
} from "../core/validation";
import {
  DEFAULT_SETTINGS,
  type Assessment,
  type AssessmentDraft,
  type Course,
  type CourseDraft,
  type ID,
  type ISODate,
  type Result,
  type Settings,
  type Snapshot,
  type ThemePreference,
  type TimeOfDay,
} from "../core/types";
import { createRepository, StorageError, type Repository } from "../storage";

export type CourseDialog = { mode: "create" } | { mode: "edit"; id: ID } | null;
export type AssessmentDialog =
  | { mode: "create"; prefill?: Partial<AssessmentDraft> }
  | { mode: "edit"; id: ID }
  | null;

export interface Toast {
  id: number;
  tone: "info" | "error";
  message: string;
  undo?: () => Promise<void>;
}

type Status = "loading" | "ready" | "error";

interface AppState {
  status: Status;
  loadError: string | null;
  /** True when persistent storage failed to open and data lives only in memory. */
  degraded: boolean;
  backend: Repository["backend"] | null;

  courses: Course[];
  assessments: Assessment[];
  settings: Settings;

  /** Kept in the store (not recomputed per component) so the app rolls over at midnight. */
  today: ISODate;
  now: TimeOfDay;

  calendarMode: "week" | "month";
  calendarAnchor: ISODate;
  paletteOpen: boolean;
  courseDialog: CourseDialog;
  assessmentDialog: AssessmentDialog;
  toast: Toast | null;
}

interface AppActions {
  init(): Promise<void>;
  tick(date?: Date): void;

  setCalendarMode(mode: "week" | "month"): void;
  setCalendarAnchor(date: ISODate): void;
  setPaletteOpen(open: boolean): void;
  openCourseDialog(dialog: CourseDialog): void;
  openAssessmentDialog(dialog: AssessmentDialog): void;
  dismissToast(): void;
  showMessage(tone: Toast["tone"], message: string): void;

  createCourse(draft: CourseDraft): Promise<Result<Course>>;
  updateCourse(id: ID, draft: CourseDraft): Promise<Result<Course>>;
  setCourseArchived(id: ID, archived: boolean): Promise<void>;
  deleteCourse(id: ID): Promise<void>;

  createAssessment(draft: AssessmentDraft): Promise<Result<Assessment>>;
  updateAssessment(id: ID, draft: AssessmentDraft): Promise<Result<Assessment>>;
  toggleDone(id: ID): Promise<void>;
  deleteAssessment(id: ID): Promise<void>;

  setTheme(theme: ThemePreference): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  exportData(): Promise<Snapshot>;
  /** Replace all data with a parsed backup. Offers Undo by restoring what was there before. */
  importData(snapshot: Snapshot): Promise<void>;
  /** Adds three demo courses with upcoming work. Only allowed when there are no courses yet. */
  loadSampleData(): Promise<void>;
}

export type Store = AppState & AppActions;

let repo: Repository | null = null;
let initPromise: Promise<void> | null = null;
let toastSeq = 0;

function nowTime(date: Date): TimeOfDay {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function describe(err: unknown): string {
  if (err instanceof StorageError) return err.message;
  return err instanceof Error ? err.message : "Something went wrong while saving.";
}

export const useStore = create<Store>()((set, get) => {
  const requireRepo = (): Repository => {
    if (!repo) throw new StorageError("Storage isn't ready yet.", "access storage");
    return repo;
  };

  const showToast = (tone: Toast["tone"], message: string, undo?: Toast["undo"]) =>
    set({ toast: { id: ++toastSeq, tone, message, undo } });

  /**
   * Apply a change to memory immediately, persist it, and roll back if the
   * write fails. The UI never waits on disk, and never lies about what's saved.
   */
  async function commit(
    apply: (s: AppState) => Partial<AppState>,
    persist: (r: Repository) => Promise<void>,
  ): Promise<boolean> {
    const snapshot = { courses: get().courses, assessments: get().assessments, settings: get().settings };
    set((s) => apply(s));
    try {
      await persist(requireRepo());
      return true;
    } catch (err) {
      set(snapshot);
      showToast("error", describe(err));
      return false;
    }
  }

  async function load(): Promise<void> {
    set({ status: "loading", loadError: null });
    try {
      const { repo: r, degraded } = await createRepository();
      repo = r;
      const [courses, assessments, settings] = await Promise.all([
        r.listCourses(),
        r.listAssessments(),
        r.getSettings(),
      ]);
      set({ courses, assessments, settings, degraded, backend: r.backend, status: "ready", loadError: null });
    } catch (err) {
      set({ status: "error", loadError: describe(err) });
    }
  }

  const storageFailure = <T>(message: string): Result<T> => ({ ok: false, errors: { form: message } });

  return {
    status: "loading",
    loadError: null,
    degraded: false,
    backend: null,
    courses: [],
    assessments: [],
    settings: { ...DEFAULT_SETTINGS },
    today: todayISO(),
    now: nowTime(new Date()),
    calendarMode: "week",
    calendarAnchor: todayISO(),
    paletteOpen: false,
    courseDialog: null,
    assessmentDialog: null,
    toast: null,

    init() {
      // StrictMode runs effects twice in dev; share one in-flight load.
      initPromise ??= load().finally(() => {
        if (get().status === "error") initPromise = null;
      });
      return initPromise;
    },

    tick(date = new Date()) {
      const today = todayISO(date);
      const now = nowTime(date);
      const s = get();
      if (s.today !== today || s.now !== now) {
        // When the day rolls over, keep the calendar on "this week" if it was there.
        const followAnchor = s.calendarAnchor === s.today;
        set({ today, now, ...(followAnchor ? { calendarAnchor: today } : {}) });
      }
    },

    setCalendarMode: (calendarMode) => set({ calendarMode }),
    setCalendarAnchor: (calendarAnchor) => set({ calendarAnchor }),
    setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
    openCourseDialog: (courseDialog) => set({ courseDialog, paletteOpen: false }),
    openAssessmentDialog: (assessmentDialog) => set({ assessmentDialog, paletteOpen: false }),
    dismissToast: () => set({ toast: null }),
    showMessage: (tone, message) => showToast(tone, message),

    async createCourse(draft) {
      const v = validateCourse(draft, get().courses);
      if (!v.ok) return v;
      const ts = Date.now();
      const course: Course = { ...v.value, id: newId(), createdAt: ts, updatedAt: ts };
      const saved = await commit(
        (s) => ({ courses: [...s.courses, course] }),
        (r) => r.upsertCourse(course),
      );
      return saved ? { ok: true, value: course } : storageFailure("The course wasn't saved. Try again.");
    },

    async updateCourse(id, draft) {
      const existing = get().courses.find((c) => c.id === id);
      if (!existing) return storageFailure("This course no longer exists.");
      const v = validateCourse(draft, get().courses, id);
      if (!v.ok) return v;
      const course: Course = { ...existing, ...v.value, updatedAt: Date.now() };
      const saved = await commit(
        (s) => ({ courses: s.courses.map((c) => (c.id === id ? course : c)) }),
        (r) => r.upsertCourse(course),
      );
      return saved ? { ok: true, value: course } : storageFailure("Your changes weren't saved. Try again.");
    },

    async setCourseArchived(id, archived) {
      const existing = get().courses.find((c) => c.id === id);
      if (!existing) return;
      // Unarchiving can collide with a course that reused the same code.
      if (!archived) {
        const v = validateCourse({ ...existing, archived: false }, get().courses, id);
        if (!v.ok && v.errors.code) {
          showToast("error", `Can't restore ${existing.code}: ${v.errors.code}`);
          return;
        }
      }
      const course = { ...existing, archived, updatedAt: Date.now() };
      const saved = await commit(
        (s) => ({ courses: s.courses.map((c) => (c.id === id ? course : c)) }),
        (r) => r.upsertCourse(course),
      );
      if (saved) {
        showToast("info", archived ? `Archived ${course.code}.` : `Restored ${course.code}.`, async () => {
          await get().setCourseArchived(id, !archived);
        });
      }
    },

    async deleteCourse(id) {
      const course = get().courses.find((c) => c.id === id);
      if (!course) return;
      const linked = get().assessments.filter((a) => a.courseId === id);
      const saved = await commit(
        (s) => ({
          courses: s.courses.filter((c) => c.id !== id),
          assessments: s.assessments.filter((a) => a.courseId !== id),
        }),
        (r) => r.deleteCourse(id),
      );
      if (!saved) return;
      const count = linked.length;
      showToast(
        "info",
        `Deleted ${course.code}${count ? ` and ${count} assessment${count === 1 ? "" : "s"}` : ""}.`,
        async () => {
          await commit(
            (s) => ({ courses: [...s.courses, course], assessments: [...s.assessments, ...linked] }),
            async (r) => {
              await r.upsertCourse(course);
              for (const a of linked) await r.upsertAssessment(a);
            },
          );
        },
      );
    },

    async createAssessment(draft) {
      const v = validateAssessment(draft, get().courses);
      if (!v.ok) return v;
      const ts = Date.now();
      const assessment: Assessment = { ...v.value, id: newId(), createdAt: ts, updatedAt: ts };
      const saved = await commit(
        (s) => ({ assessments: [...s.assessments, assessment] }),
        (r) => r.upsertAssessment(assessment),
      );
      return saved ? { ok: true, value: assessment } : storageFailure("The assessment wasn't saved. Try again.");
    },

    async updateAssessment(id, draft) {
      const existing = get().assessments.find((a) => a.id === id);
      if (!existing) return storageFailure("This assessment no longer exists.");
      const v = validateAssessment(draft, get().courses);
      if (!v.ok) return v;
      const assessment: Assessment = { ...existing, ...v.value, updatedAt: Date.now() };
      const saved = await commit(
        (s) => ({ assessments: s.assessments.map((a) => (a.id === id ? assessment : a)) }),
        (r) => r.upsertAssessment(assessment),
      );
      return saved ? { ok: true, value: assessment } : storageFailure("Your changes weren't saved. Try again.");
    },

    async toggleDone(id) {
      const existing = get().assessments.find((a) => a.id === id);
      if (!existing) return;
      const assessment: Assessment = {
        ...existing,
        status: existing.status === "done" ? "todo" : "done",
        updatedAt: Date.now(),
      };
      await commit(
        (s) => ({ assessments: s.assessments.map((a) => (a.id === id ? assessment : a)) }),
        (r) => r.upsertAssessment(assessment),
      );
    },

    async deleteAssessment(id) {
      const existing = get().assessments.find((a) => a.id === id);
      if (!existing) return;
      const saved = await commit(
        (s) => ({ assessments: s.assessments.filter((a) => a.id !== id) }),
        (r) => r.deleteAssessment(id),
      );
      if (!saved) return;
      showToast("info", `Deleted "${existing.title}".`, async () => {
        // Only restore if the parent course still exists.
        if (!get().courses.some((c) => c.id === existing.courseId)) return;
        await commit(
          (s) => ({ assessments: [...s.assessments, existing] }),
          (r) => r.upsertAssessment(existing),
        );
      });
    },

    async setTheme(theme) {
      await get().updateSettings({ theme });
    },

    async updateSettings(patch) {
      const settings = { ...get().settings, ...patch };
      await commit(() => ({ settings }), (r) => r.saveSettings(settings));
    },

    exportData: () => requireRepo().exportSnapshot(),

    async loadSampleData() {
      if (get().courses.length > 0) return;
      const { courses, assessments } = buildSampleData(get().today);
      const saved = await commit(
        (s) => ({ courses: [...s.courses, ...courses], assessments: [...s.assessments, ...assessments] }),
        async (r) => {
          for (const c of courses) await r.upsertCourse(c);
          for (const a of assessments) await r.upsertAssessment(a);
        },
      );
      if (saved) showToast("info", "Added 3 sample courses. Delete or archive them anytime from Courses.");
    },

    async importData(snapshot) {
      const r = requireRepo();
      const previous = await r.exportSnapshot();
      try {
        await r.importSnapshot(snapshot);
      } catch (err) {
        showToast("error", describe(err));
        throw err;
      }
      set({ courses: snapshot.courses, assessments: snapshot.assessments, settings: snapshot.settings });
      showToast(
        "info",
        `Restored ${snapshot.courses.length} courses and ${snapshot.assessments.length} assessments.`,
        async () => {
          await r.importSnapshot(previous);
          set({ courses: previous.courses, assessments: previous.assessments, settings: previous.settings });
        },
      );
    },
  };
});
