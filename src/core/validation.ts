import { isHexColor, normalizeHex } from "./colors";
import { isISODate, isTimeOfDay, timeToMinutes } from "./dates";
import { findSlotConflicts } from "./schedule";
import {
  ASSESSMENT_KINDS,
  ASSESSMENT_STATUSES,
  PRIORITIES,
  SESSION_KINDS,
  type Assessment,
  type AssessmentDraft,
  type Course,
  type CourseDraft,
  type FieldErrors,
  type ID,
  type Result,
  type ScheduleSlot,
  type Weekday,
} from "./types";

export function newId(): ID {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older mobile WebViews.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** "cs 101" and "CS101" are the same course code. */
export function normalizeCode(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

const fail = <T>(errors: FieldErrors): Result<T> => ({ ok: false, errors });
const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export function validateCourse(
  draft: CourseDraft,
  existing: Course[],
  editingId: ID | null = null,
): Result<CourseDraft> {
  const errors: FieldErrors = {};
  const name = draft.name.trim();
  const code = draft.code.trim().replace(/\s+/g, " ");
  const color = normalizeHex(draft.color);

  if (!name) errors.name = "Enter a course name.";
  else if (name.length > 120) errors.name = "Keep the name under 120 characters.";

  if (!code) errors.code = "Enter a course code, like CS 101.";
  else if (code.length > 24) errors.code = "Keep the code under 24 characters.";
  else if (
    existing.some(
      (c) => c.id !== editingId && !c.archived && normalizeCode(c.code) === normalizeCode(code),
    )
  ) {
    errors.code = `${code} is already in your course list.`;
  }

  if (!color) errors.color = "Pick a color or enter a hex value like #4f7cff.";

  if (draft.termStart && !isISODate(draft.termStart)) errors.termStart = "Enter a valid start date.";
  if (draft.termEnd && !isISODate(draft.termEnd)) errors.termEnd = "Enter a valid end date.";
  if (draft.termStart && draft.termEnd && draft.termEnd < draft.termStart) {
    errors.termEnd = "The term has to end after it starts.";
  }

  draft.schedule.forEach((slot, i) => {
    if (!SESSION_KINDS.includes(slot.kind)) errors[`schedule.${i}.kind`] = "Choose a session type.";
    if (slot.days.length === 0) errors[`schedule.${i}.days`] = "Pick at least one day.";
    if (!isTimeOfDay(slot.start)) errors[`schedule.${i}.start`] = "Enter a start time.";
    if (!isTimeOfDay(slot.end)) errors[`schedule.${i}.end`] = "Enter an end time.";
    else if (isTimeOfDay(slot.start) && timeToMinutes(slot.end) <= timeToMinutes(slot.start)) {
      errors[`schedule.${i}.end`] = "The class has to end after it starts, on the same day.";
    }
  });
  if (!Object.keys(errors).some((k) => k.startsWith("schedule."))) {
    for (const [a, b] of findSlotConflicts(draft.schedule)) {
      const idx = draft.schedule.indexOf(b);
      errors[`schedule.${idx}.start`] = `Overlaps another ${a.kind} on the same day.`;
    }
  }

  if (Object.keys(errors).length) return fail(errors);
  return ok({
    ...draft,
    name,
    code,
    color: color!,
    instructor: draft.instructor?.trim() || null,
    skipDates: [...new Set(draft.skipDates.filter(isISODate))].sort(),
    schedule: draft.schedule.map((s) => ({
      ...s,
      days: [...new Set(s.days)].sort((a, b) => a - b),
      location: s.location?.trim() || null,
    })),
  });
}

export function validateAssessment(
  draft: AssessmentDraft,
  courses: Course[],
): Result<AssessmentDraft> {
  const errors: FieldErrors = {};
  const title = draft.title.trim();

  if (!courses.some((c) => c.id === draft.courseId)) errors.courseId = "Choose a course.";
  if (!title) errors.title = "Enter a title.";
  else if (title.length > 200) errors.title = "Keep the title under 200 characters.";
  if (!ASSESSMENT_KINDS.includes(draft.kind)) errors.kind = "Choose a type.";
  if (!PRIORITIES.includes(draft.priority)) errors.priority = "Choose a priority.";
  if (!ASSESSMENT_STATUSES.includes(draft.status)) errors.status = "Choose a status.";
  if (!isISODate(draft.dueDate)) errors.dueDate = "Enter a due date.";
  if (draft.dueTime !== null && !isTimeOfDay(draft.dueTime)) errors.dueTime = "Enter a valid time or leave it blank.";
  if (draft.weight !== null && (!Number.isFinite(draft.weight) || draft.weight < 0 || draft.weight > 100)) {
    errors.weight = "Weight is a percentage between 0 and 100.";
  }
  if (draft.grade !== null && (!Number.isFinite(draft.grade) || draft.grade < 0 || draft.grade > 150)) {
    errors.grade = "Grade is a percentage between 0 and 150.";
  }

  if (Object.keys(errors).length) return fail(errors);
  return ok({ ...draft, title, notes: draft.notes.trim() });
}

/**
 * Defensive coercion for rows coming out of storage or an imported file.
 * Returns null for records that can't be repaired so one corrupt row
 * never prevents the app from loading.
 */
const isWeekday = (v: unknown): v is Weekday => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 6;

/** Accepts the current shape ({ days: [] }) and the earlier single-day shape ({ day }). */
export function coerceSlot(raw: unknown): ScheduleSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string" || !isTimeOfDay(s.start) || !isTimeOfDay(s.end)) return null;
  const days = Array.isArray(s.days) ? s.days.filter(isWeekday) : isWeekday(s.day) ? [s.day] : [];
  if (days.length === 0) return null;
  return {
    id: s.id,
    days: [...new Set(days)].sort((a, b) => a - b),
    start: s.start,
    end: s.end,
    kind: SESSION_KINDS.includes(s.kind as never) ? (s.kind as ScheduleSlot["kind"]) : "lecture",
    location: typeof s.location === "string" && s.location.trim() ? s.location : null,
  };
}

export function coerceCourse(raw: unknown): Course | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.name !== "string" || typeof r.code !== "string") return null;
  const color = typeof r.color === "string" && isHexColor(normalizeHex(r.color)) ? normalizeHex(r.color)! : "#64748b";
  const schedule = Array.isArray(r.schedule)
    ? r.schedule.map(coerceSlot).filter((slot) => slot !== null)
    : [];
  const now = Date.now();
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    instructor: typeof r.instructor === "string" ? r.instructor : null,
    color,
    schedule,
    termStart: isISODate(r.termStart) ? r.termStart : null,
    termEnd: isISODate(r.termEnd) ? r.termEnd : null,
    skipDates: Array.isArray(r.skipDates) ? r.skipDates.filter(isISODate) : [],
    archived: Boolean(r.archived),
    createdAt: typeof r.createdAt === "number" ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : now,
  };
}

export function coerceAssessment(raw: unknown): Assessment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.courseId !== "string" || !isISODate(r.dueDate)) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const now = Date.now();
  return {
    id: r.id,
    courseId: r.courseId,
    title: typeof r.title === "string" && r.title.trim() ? r.title : "Untitled",
    kind: ASSESSMENT_KINDS.includes(r.kind as never) ? (r.kind as Assessment["kind"]) : "task",
    dueDate: r.dueDate,
    dueTime: isTimeOfDay(r.dueTime) ? r.dueTime : null,
    priority: PRIORITIES.includes(r.priority as never) ? (r.priority as Assessment["priority"]) : "medium",
    weight: num(r.weight),
    status: ASSESSMENT_STATUSES.includes(r.status as never) ? (r.status as Assessment["status"]) : "todo",
    grade: num(r.grade),
    notes: typeof r.notes === "string" ? r.notes : "",
    createdAt: typeof r.createdAt === "number" ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : now,
  };
}
