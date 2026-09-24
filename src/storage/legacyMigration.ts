import { isISODate } from "../core/dates";
import { coerceAssessment, coerceCourse, coerceSlot } from "../core/validation";
import type { Assessment, Course, Settings } from "../core/types";
import { coerceSettings } from "./snapshot";

/**
 * Converters from the first (Cursor-generated) IndexedDB schema, v1:
 *   courses      { id, name, code, instructor, status, color, termId?, notes?, createdAt: ISO string }
 *   classSlots   { id, courseId, kind: "weekly"|"once", days[], time: {startMin,endMin},
 *                  location?, startsOn, endsOn?, cancelledDates[], extraDates[] }
 *   assessments  { id, courseId, title, kind, dueOn, dueTime?: {startMin,endMin},
 *                  priority, weightPercent, status, notes?, createdAt: ISO string }
 *   settings     { id: "singleton", theme: {presetId, mode, customAccent?}, weekStartsOn, timeFormat }
 * Pure functions so the migration is unit-tested without IndexedDB.
 */

type Row = Record<string, unknown>;

const toHHMM = (min: unknown): string | null => {
  if (typeof min !== "number" || !Number.isInteger(min) || min < 0 || min >= 24 * 60) return null;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
};

const toMillis = (iso: unknown): number | undefined => {
  const t = typeof iso === "string" ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : undefined;
};

export function migrateLegacyCourse(course: Row, slots: Row[]): Course | null {
  const own = slots.filter((s) => s.courseId === course.id);
  // One-off ("once") meetings and extra dates have no equivalent yet; weekly patterns carry over.
  const weekly = own.filter((s) => s.kind !== "once");
  const time = (s: Row) => (s.time && typeof s.time === "object" ? (s.time as Row) : {});
  const starts = weekly.map((s) => s.startsOn).filter(isISODate).sort();
  const ends = weekly.map((s) => s.endsOn).filter(isISODate).sort();
  const skip = weekly.flatMap((s) => (Array.isArray(s.cancelledDates) ? s.cancelledDates : [])).filter(isISODate);

  return coerceCourse({
    id: course.id,
    name: course.name,
    code: course.code,
    instructor: typeof course.instructor === "string" && course.instructor.trim() ? course.instructor : null,
    color: course.color,
    schedule: weekly
      .map((s) =>
        coerceSlot({
          id: s.id,
          days: s.days,
          start: toHHMM(time(s).startMin),
          end: toHHMM(time(s).endMin),
          kind: "lecture",
          location: s.location,
        }),
      )
      .filter((s) => s !== null),
    termStart: starts[0] ?? null,
    termEnd: ends.length === weekly.length && ends.length > 0 ? ends[ends.length - 1] : null,
    skipDates: [...new Set(skip)],
    archived: course.status === "archived",
    createdAt: toMillis(course.createdAt),
    updatedAt: toMillis(course.updatedAt),
  });
}

export function migrateLegacyAssessment(a: Row): Assessment | null {
  const due = a.dueTime && typeof a.dueTime === "object" ? (a.dueTime as Row) : null;
  return coerceAssessment({
    id: a.id,
    courseId: a.courseId,
    title: a.title,
    kind: a.kind === "other" ? "task" : a.kind,
    dueDate: a.dueOn,
    dueTime: due ? toHHMM(due.startMin) : null,
    priority: a.priority,
    weight: a.weightPercent,
    // "cancelled" was never reachable from the old UI; treat it as finished rather than lose the row.
    status: a.status === "cancelled" ? "done" : a.status,
    grade: null,
    notes: typeof a.notes === "string" ? a.notes : "",
    createdAt: toMillis(a.createdAt),
    updatedAt: toMillis(a.updatedAt),
  });
}

const PRESET_MAP: Record<string, Settings["theme"]> = {
  "minimal-light": "light",
  "minimal-dark": "dark",
  pastel: "pastel",
  synthwave: "synthwave",
  mono: "mono",
};

export function migrateLegacySettings(row: Row | undefined): Settings {
  const theme = row?.theme && typeof row.theme === "object" ? (row.theme as Row) : {};
  return coerceSettings({
    theme: theme.mode === "system" ? "system" : PRESET_MAP[String(theme.presetId)] ?? "system",
    weekStartsOn: row?.weekStartsOn,
    timeFormat: row?.timeFormat,
    accent: theme.customAccent ?? null,
  });
}
