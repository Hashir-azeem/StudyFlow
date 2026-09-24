import { nextCourseColor } from "./colors";
import { addDays } from "./dates";
import { newId } from "./validation";
import type {
  AssessmentDraft,
  AssessmentKind,
  Course,
  CourseDraft,
  ID,
  ISODate,
  Priority,
  ScheduleSlot,
  Weekday,
} from "./types";

/** Sensible defaults per kind; the user can override every field. */
export const KIND_DEFAULTS: Record<AssessmentKind, { priority: Priority; weight: number | null }> = {
  exam: { priority: "high", weight: 40 },
  midterm: { priority: "high", weight: 25 },
  project: { priority: "medium", weight: 20 },
  quiz: { priority: "medium", weight: 5 },
  assignment: { priority: "medium", weight: 10 },
  task: { priority: "low", weight: null },
};

export function blankCourse(existing: Course[]): CourseDraft {
  return {
    name: "",
    code: "",
    instructor: null,
    color: nextCourseColor(existing.map((c) => c.color)),
    schedule: [],
    termStart: null,
    termEnd: null,
    skipDates: [],
    archived: false,
  };
}

export function blankSlot(days: Weekday[] = [1, 3]): ScheduleSlot {
  return { id: newId(), days, start: "09:00", end: "10:20", kind: "lecture", location: null };
}

export function blankAssessment(
  courseId: ID,
  today: ISODate,
  kind: AssessmentKind = "assignment",
): AssessmentDraft {
  return {
    courseId,
    title: "",
    kind,
    dueDate: addDays(today, 7),
    dueTime: null,
    priority: KIND_DEFAULTS[kind].priority,
    weight: KIND_DEFAULTS[kind].weight,
    status: "todo",
    grade: null,
    notes: "",
  };
}
