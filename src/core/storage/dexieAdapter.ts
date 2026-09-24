import Dexie, { type EntityTable } from "dexie";
import { newId, nowIso } from "../clock";
import { starterAssessments, STARTER_COURSES } from "../templates/defaults";
import type { Assessment, AssessmentDraft } from "../types/assessment";
import type { Course, CourseDraft, CourseStatus } from "../types/course";
import type { ClassSlot, SlotDraft, Term } from "../types/schedule";
import type { AppSettings } from "../types/settings";
import type { ID, ISODate } from "../types/ids";
import type { StorageAdapter } from "./adapter";
import { DB_NAME, DB_VERSION, SETTINGS_ID } from "./schema";

interface SettingsRow extends AppSettings {
  id: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: { presetId: "minimal-dark", mode: "dark" },
  weekStartsOn: 1,
  timeFormat: "12h",
};

class StudyflowDB extends Dexie {
  courses!: EntityTable<Course, "id">;
  classSlots!: EntityTable<ClassSlot, "id">;
  assessments!: EntityTable<Assessment, "id">;
  terms!: EntityTable<Term, "id">;
  settings!: EntityTable<SettingsRow, "id">;

  constructor() {
    super(DB_NAME);
    this.version(DB_VERSION).stores({
      courses: "id, code, status, termId",
      classSlots: "id, courseId",
      assessments: "id, courseId, dueOn, kind, status",
      terms: "id, isCurrent",
      settings: "id",
    });
  }
}

export const db = new StudyflowDB();

export class DexieAdapter implements StorageAdapter {
  async getSettings(): Promise<AppSettings> {
    const row = await db.settings.get(SETTINGS_ID);
    if (!row) return DEFAULT_SETTINGS;
    return {
      theme: row.theme,
      weekStartsOn: row.weekStartsOn,
      timeFormat: row.timeFormat,
    };
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await db.settings.put({ id: SETTINGS_ID, ...settings });
  }

  async listCourses(status?: CourseStatus): Promise<Course[]> {
    const all = await db.courses.orderBy("code").toArray();
    return status ? all.filter((c) => c.status === status) : all;
  }

  async getCourse(id: ID): Promise<Course | null> {
    return (await db.courses.get(id)) ?? null;
  }

  async createCourse(draft: CourseDraft): Promise<Course> {
    const stamp = nowIso();
    const course: Course = {
      id: newId(),
      name: draft.name,
      code: draft.code,
      instructor: draft.instructor,
      status: "active",
      color: draft.color,
      termId: draft.termId,
      notes: draft.notes,
      createdAt: stamp,
      updatedAt: stamp,
    };
    await db.transaction("rw", db.courses, db.classSlots, async () => {
      await db.courses.add(course);
      await this.writeSlots(course.id, draft.slots, stamp);
    });
    return course;
  }

  async updateCourse(id: ID, patch: Partial<CourseDraft>): Promise<Course> {
    const existing = await db.courses.get(id);
    if (!existing) throw new Error(`Course not found: ${id}`);
    const stamp = nowIso();
    const next: Course = {
      ...existing,
      name: patch.name ?? existing.name,
      code: patch.code ?? existing.code,
      instructor: patch.instructor ?? existing.instructor,
      color: patch.color ?? existing.color,
      termId: patch.termId ?? existing.termId,
      notes: patch.notes ?? existing.notes,
      updatedAt: stamp,
    };
    await db.transaction("rw", db.courses, db.classSlots, async () => {
      await db.courses.put(next);
      if (patch.slots) await this.writeSlots(id, patch.slots, stamp);
    });
    return next;
  }

  async setCourseStatus(id: ID, status: CourseStatus): Promise<void> {
    await db.courses.update(id, { status, updatedAt: nowIso() });
  }

  async listSlots(courseId?: ID): Promise<ClassSlot[]> {
    if (courseId) return db.classSlots.where("courseId").equals(courseId).toArray();
    return db.classSlots.toArray();
  }

  async replaceSlots(courseId: ID, slots: SlotDraft[]): Promise<ClassSlot[]> {
    return this.writeSlots(courseId, slots, nowIso());
  }

  async listTerms(): Promise<Term[]> {
    return db.terms.toArray();
  }

  async upsertTerm(term: Term): Promise<Term> {
    await db.terms.put(term);
    return term;
  }

  async listAssessments(filter?: {
    courseId?: ID;
    from?: ISODate;
    to?: ISODate;
  }): Promise<Assessment[]> {
    let rows = await db.assessments.toArray();
    if (filter?.courseId) {
      rows = rows.filter((a) => a.courseId === filter.courseId);
    }
    if (filter?.from) {
      rows = rows.filter((a) => a.dueOn >= filter.from!);
    }
    if (filter?.to) {
      rows = rows.filter((a) => a.dueOn <= filter.to!);
    }
    return rows.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  }

  async getAssessment(id: ID): Promise<Assessment | null> {
    return (await db.assessments.get(id)) ?? null;
  }

  async createAssessment(draft: AssessmentDraft): Promise<Assessment> {
    const stamp = nowIso();
    const row: Assessment = {
      id: newId(),
      ...draft,
      status: "todo",
      createdAt: stamp,
      updatedAt: stamp,
    };
    await db.assessments.add(row);
    return row;
  }

  async updateAssessment(
    id: ID,
    patch: Partial<AssessmentDraft>,
  ): Promise<Assessment> {
    const existing = await db.assessments.get(id);
    if (!existing) throw new Error(`Assessment not found: ${id}`);
    const next: Assessment = {
      ...existing,
      ...patch,
      updatedAt: nowIso(),
    };
    await db.assessments.put(next);
    return next;
  }

  async setAssessmentStatus(
    id: ID,
    status: Assessment["status"],
  ): Promise<void> {
    await db.assessments.update(id, { status, updatedAt: nowIso() });
  }

  private async writeSlots(
    courseId: ID,
    slots: SlotDraft[],
    stamp: string,
  ): Promise<ClassSlot[]> {
    await db.classSlots.where("courseId").equals(courseId).delete();
    const rows: ClassSlot[] = slots.map((s) => ({
      ...s,
      id: newId(),
      courseId,
      createdAt: stamp,
      updatedAt: stamp,
    }));
    if (rows.length) await db.classSlots.bulkAdd(rows);
    return rows;
  }
}

let seeded = false;

export async function ensureSeeded(adapter: StorageAdapter): Promise<void> {
  if (seeded) return;
  const count = await db.courses.count();
  if (count === 0) {
    const settings = await adapter.getSettings();
    await adapter.saveSettings(settings);
    const ids: Record<string, string> = {};
    for (const draft of STARTER_COURSES) {
      const course = await adapter.createCourse(draft);
      ids[course.code] = course.id;
    }
    for (const a of starterAssessments(ids)) {
      await adapter.createAssessment(a);
    }
  }
  seeded = true;
}

export const adapter = new DexieAdapter();
