import Dexie, { type Table } from "dexie";
import { coerceAssessment, coerceCourse } from "../core/validation";
import type { Assessment, Course, ID, Settings, Snapshot } from "../core/types";
import { guard, type Repository } from "./repository";
import { migrateLegacyAssessment, migrateLegacyCourse, migrateLegacySettings } from "./legacyMigration";
import { coerceSettings, parseSnapshot } from "./snapshot";

interface SettingsRow {
  id: "app";
  value: Settings;
}

type LegacyRow = Record<string, unknown>;

class StudyFlowDB extends Dexie {
  courses!: Table<Course, ID>;
  assessments!: Table<Assessment, ID>;
  settings!: Table<SettingsRow, string>;

  constructor() {
    super("studyflow");

    // v1: the original Cursor-generated schema. Declared so existing databases open.
    this.version(1).stores({
      courses: "id, code, status, termId",
      classSlots: "id, courseId",
      assessments: "id, courseId, dueOn, kind, status",
      terms: "id, isCurrent",
      settings: "id",
    });

    // v2: current model. Slots fold into courses, fields are renamed, settings move
    // to one { id: "app" } row. Old tables stay readable during this upgrade…
    this.version(2)
      .stores({
        courses: "id, code",
        assessments: "id, courseId, dueDate, status",
        settings: "id",
      })
      .upgrade(async (tx) => {
        const slots = (await tx.table("classSlots").toArray()) as LegacyRow[];
        const oldCourses = (await tx.table("courses").toArray()) as LegacyRow[];
        const oldAssessments = (await tx.table("assessments").toArray()) as LegacyRow[];
        const oldSettings = (await tx.table("settings").get("singleton")) as LegacyRow | undefined;

        const courses = oldCourses.map((c) => migrateLegacyCourse(c, slots)).filter((c) => c !== null);
        const ids = new Set(courses.map((c) => c.id));
        const assessments = oldAssessments
          .map(migrateLegacyAssessment)
          .filter((a) => a !== null && ids.has(a.courseId)) as Assessment[];

        await tx.table("courses").clear();
        await tx.table("courses").bulkPut(courses);
        await tx.table("assessments").clear();
        await tx.table("assessments").bulkPut(assessments);
        await tx.table("settings").clear();
        await tx.table("settings").put({ id: "app", value: migrateLegacySettings(oldSettings) });
      });

    // v3: …and are dropped once the data has moved.
    this.version(3).stores({ classSlots: null, terms: null });
    // For every future schema change: add version(n + 1) with an .upgrade(). Never edit a shipped version.
  }
}

/**
 * Used in `vite dev` in a normal browser and for any future web build.
 * Inside Tauri the SQLite repository is preferred: iOS may evict WebView
 * IndexedDB under storage pressure, while the SQLite file is app-owned.
 */
export class DexieRepository implements Repository {
  readonly backend = "indexeddb" as const;
  private readonly db = new StudyFlowDB();

  async init(): Promise<void> {
    await guard("open your saved data", async () => {
      await this.db.open();
      // Ask the browser not to evict our data. Ignored where unsupported.
      await navigator.storage?.persist?.().catch(() => false);
    });
  }

  listCourses(): Promise<Course[]> {
    return guard("load your courses", async () =>
      (await this.db.courses.toArray()).map(coerceCourse).filter((c) => c !== null),
    );
  }

  upsertCourse(course: Course): Promise<void> {
    return guard("save the course", async () => {
      await this.db.courses.put(course);
    });
  }

  deleteCourse(id: ID): Promise<void> {
    return guard("delete the course", () =>
      this.db.transaction("rw", this.db.courses, this.db.assessments, async () => {
        await this.db.assessments.where("courseId").equals(id).delete();
        await this.db.courses.delete(id);
      }),
    );
  }

  listAssessments(): Promise<Assessment[]> {
    return guard("load your assessments", async () =>
      (await this.db.assessments.orderBy("dueDate").toArray()).map(coerceAssessment).filter((a) => a !== null),
    );
  }

  upsertAssessment(assessment: Assessment): Promise<void> {
    return guard("save the assessment", async () => {
      await this.db.assessments.put(assessment);
    });
  }

  deleteAssessment(id: ID): Promise<void> {
    return guard("delete the assessment", () => this.db.assessments.delete(id));
  }

  getSettings(): Promise<Settings> {
    return guard("load your settings", async () => coerceSettings((await this.db.settings.get("app"))?.value));
  }

  saveSettings(settings: Settings): Promise<void> {
    return guard("save your settings", async () => {
      await this.db.settings.put({ id: "app", value: settings });
    });
  }

  async exportSnapshot(): Promise<Snapshot> {
    const [courses, assessments, settings] = await Promise.all([
      this.listCourses(),
      this.listAssessments(),
      this.getSettings(),
    ]);
    return { version: 1, exportedAt: Date.now(), courses, assessments, settings };
  }

  importSnapshot(raw: Snapshot): Promise<void> {
    return guard("import your backup", async () => {
      const { snapshot } = parseSnapshot(raw);
      await this.db.transaction("rw", this.db.courses, this.db.assessments, this.db.settings, async () => {
        await Promise.all([this.db.courses.clear(), this.db.assessments.clear()]);
        await this.db.courses.bulkPut(snapshot.courses);
        await this.db.assessments.bulkPut(snapshot.assessments);
        await this.db.settings.put({ id: "app", value: snapshot.settings });
      });
    });
  }
}
