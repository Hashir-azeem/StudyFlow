import Database from "@tauri-apps/plugin-sql";
import { coerceAssessment, coerceCourse } from "../core/validation";
import type { Assessment, Course, ID, Settings, Snapshot } from "../core/types";
import { guard, type Repository } from "./repository";
import { coerceSettings, parseSnapshot } from "./snapshot";

/**
 * Schema lives in src-tauri/src/lib.rs as plugin-sql migrations, which run
 * natively and atomically before the WebView ever opens the database.
 * Keep DB_URL in sync with the URL registered there.
 */
export const DB_URL = "sqlite:studyflow.db";

interface CourseRow {
  id: string;
  name: string;
  code: string;
  instructor: string | null;
  color: string;
  schedule: string;
  term_start: string | null;
  term_end: string | null;
  skip_dates: string;
  archived: number;
  created_at: number;
  updated_at: number;
}

interface AssessmentRow {
  id: string;
  course_id: string;
  title: string;
  kind: string;
  due_date: string;
  due_time: string | null;
  priority: string;
  weight: number | null;
  status: string;
  grade: number | null;
  notes: string;
  created_at: number;
  updated_at: number;
}

function safeJson(text: string, fallback: unknown): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function rowToCourse(row: CourseRow): Course | null {
  return coerceCourse({
    id: row.id,
    name: row.name,
    code: row.code,
    instructor: row.instructor,
    color: row.color,
    schedule: safeJson(row.schedule, []),
    termStart: row.term_start,
    termEnd: row.term_end,
    skipDates: safeJson(row.skip_dates, []),
    archived: row.archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function rowToAssessment(row: AssessmentRow): Assessment | null {
  return coerceAssessment({
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    kind: row.kind,
    dueDate: row.due_date,
    dueTime: row.due_time,
    priority: row.priority,
    weight: row.weight,
    status: row.status,
    grade: row.grade,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

const UPSERT_COURSE = `
  INSERT INTO courses (id, name, code, instructor, color, schedule, term_start, term_end, skip_dates, archived, created_at, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name, code = excluded.code, instructor = excluded.instructor,
    color = excluded.color, schedule = excluded.schedule, term_start = excluded.term_start,
    term_end = excluded.term_end, skip_dates = excluded.skip_dates, archived = excluded.archived,
    updated_at = excluded.updated_at`;

const UPSERT_ASSESSMENT = `
  INSERT INTO assessments (id, course_id, title, kind, due_date, due_time, priority, weight, status, grade, notes, created_at, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
  ON CONFLICT(id) DO UPDATE SET
    course_id = excluded.course_id, title = excluded.title, kind = excluded.kind,
    due_date = excluded.due_date, due_time = excluded.due_time, priority = excluded.priority,
    weight = excluded.weight, status = excluded.status, grade = excluded.grade,
    notes = excluded.notes, updated_at = excluded.updated_at`;

const courseParams = (c: Course) => [
  c.id, c.name, c.code, c.instructor, c.color, JSON.stringify(c.schedule),
  c.termStart, c.termEnd, JSON.stringify(c.skipDates), c.archived ? 1 : 0, c.createdAt, c.updatedAt,
];

const assessmentParams = (a: Assessment) => [
  a.id, a.courseId, a.title, a.kind, a.dueDate, a.dueTime, a.priority,
  a.weight, a.status, a.grade, a.notes, a.createdAt, a.updatedAt,
];

export class SqliteRepository implements Repository {
  readonly backend = "sqlite" as const;
  private db: Database | null = null;

  private get conn(): Database {
    if (!this.db) throw new Error("Database not initialised; call init() first.");
    return this.db;
  }

  async init(): Promise<void> {
    await guard("open your saved data", async () => {
      this.db = await Database.load(DB_URL);
    });
  }

  listCourses(): Promise<Course[]> {
    return guard("load your courses", async () => {
      const rows = await this.conn.select<CourseRow[]>("SELECT * FROM courses ORDER BY code COLLATE NOCASE");
      return rows.map(rowToCourse).filter((c) => c !== null);
    });
  }

  upsertCourse(course: Course): Promise<void> {
    return guard("save the course", async () => {
      await this.conn.execute(UPSERT_COURSE, courseParams(course));
    });
  }

  deleteCourse(id: ID): Promise<void> {
    return guard("delete the course", async () => {
      // plugin-sql pools connections, so BEGIN/COMMIT across calls isn't reliable.
      // Deleting children first keeps the invariant even if the second call fails:
      // at worst the course survives with no assessments, never the reverse.
      await this.conn.execute("DELETE FROM assessments WHERE course_id = $1", [id]);
      await this.conn.execute("DELETE FROM courses WHERE id = $1", [id]);
    });
  }

  listAssessments(): Promise<Assessment[]> {
    return guard("load your assessments", async () => {
      const rows = await this.conn.select<AssessmentRow[]>(
        "SELECT * FROM assessments ORDER BY due_date, due_time",
      );
      return rows.map(rowToAssessment).filter((a) => a !== null);
    });
  }

  upsertAssessment(assessment: Assessment): Promise<void> {
    return guard("save the assessment", async () => {
      await this.conn.execute(UPSERT_ASSESSMENT, assessmentParams(assessment));
    });
  }

  deleteAssessment(id: ID): Promise<void> {
    return guard("delete the assessment", async () => {
      await this.conn.execute("DELETE FROM assessments WHERE id = $1", [id]);
    });
  }

  getSettings(): Promise<Settings> {
    return guard("load your settings", async () => {
      const rows = await this.conn.select<Array<{ value: string }>>(
        "SELECT value FROM settings WHERE key = 'app'",
      );
      return coerceSettings(rows[0] ? safeJson(rows[0].value, null) : null);
    });
  }

  saveSettings(settings: Settings): Promise<void> {
    return guard("save your settings", async () => {
      await this.conn.execute(
        "INSERT INTO settings (key, value) VALUES ('app', $1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [JSON.stringify(settings)],
      );
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
      // Write the new rows first under upsert, then prune anything not in the
      // backup. If the app dies midway, the user has a superset, not an empty DB.
      for (const c of snapshot.courses) await this.conn.execute(UPSERT_COURSE, courseParams(c));
      for (const a of snapshot.assessments) await this.conn.execute(UPSERT_ASSESSMENT, assessmentParams(a));
      const keepA = snapshot.assessments.map((a) => a.id);
      const keepC = snapshot.courses.map((c) => c.id);
      await this.conn.execute(
        `DELETE FROM assessments WHERE id NOT IN (SELECT value FROM json_each($1))`,
        [JSON.stringify(keepA)],
      );
      await this.conn.execute(
        `DELETE FROM courses WHERE id NOT IN (SELECT value FROM json_each($1))`,
        [JSON.stringify(keepC)],
      );
      await this.saveSettings(snapshot.settings);
    });
  }
}
