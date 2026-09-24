import { addDays, compareDateTime, diffInDays } from "./dates";
import type { Assessment, AssessmentKind, Course, ID, ISODate, Priority } from "./types";

export type Urgency = "overdue" | "today" | "soon" | "upcoming";

export interface TrackedAssessment {
  assessment: Assessment;
  course: Course;
  daysUntil: number;
  urgency: Urgency;
}

export const MAJOR_KINDS: ReadonlySet<AssessmentKind> = new Set(["exam", "midterm"]);

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export const KIND_LABEL: Record<AssessmentKind, string> = {
  exam: "Exam",
  midterm: "Midterm",
  quiz: "Quiz",
  project: "Project",
  assignment: "Assignment",
  task: "Task",
};

function urgencyFor(daysUntil: number): Urgency {
  if (daysUntil < 0) return "overdue";
  if (daysUntil === 0) return "today";
  if (daysUntil <= 2) return "soon";
  return "upcoming";
}

/** Chronological, then high priority first, then heavier weight first. */
export function compareTracked(a: TrackedAssessment, b: TrackedAssessment): number {
  return (
    compareDateTime(
      { date: a.assessment.dueDate, time: a.assessment.dueTime },
      { date: b.assessment.dueDate, time: b.assessment.dueTime },
    ) ||
    PRIORITY_RANK[a.assessment.priority] - PRIORITY_RANK[b.assessment.priority] ||
    (b.assessment.weight ?? 0) - (a.assessment.weight ?? 0) ||
    a.assessment.title.localeCompare(b.assessment.title)
  );
}

/**
 * Join assessments to their courses, dropping completed work, archived courses,
 * and orphans (an assessment whose course no longer exists: possible after a
 * failed partial import, so we never crash on it).
 */
export function trackAll(
  assessments: Assessment[],
  courses: Course[],
  today: ISODate,
): TrackedAssessment[] {
  const byId = new Map<ID, Course>(courses.map((c) => [c.id, c]));
  const out: TrackedAssessment[] = [];
  for (const a of assessments) {
    if (a.status === "done") continue;
    const course = byId.get(a.courseId);
    if (!course || course.archived) continue;
    const daysUntil = diffInDays(today, a.dueDate);
    out.push({ assessment: a, course, daysUntil, urgency: urgencyFor(daysUntil) });
  }
  return out.sort(compareTracked);
}

export interface UpcomingOptions {
  /** Days ahead to include, counting today as day 0. Default 7. */
  days?: number;
  /** Restrict to these kinds (e.g. MAJOR_KINDS for "exams this week"). */
  kinds?: ReadonlySet<AssessmentKind>;
}

/** The 7-day tracker: everything due from today through today + days - 1. */
export function upcoming(
  assessments: Assessment[],
  courses: Course[],
  today: ISODate,
  { days = 7, kinds }: UpcomingOptions = {},
): TrackedAssessment[] {
  const last = addDays(today, Math.max(1, days) - 1);
  return trackAll(assessments, courses, today).filter(
    (t) =>
      t.assessment.dueDate >= today &&
      t.assessment.dueDate <= last &&
      (!kinds || kinds.has(t.assessment.kind)),
  );
}

export function overdue(
  assessments: Assessment[],
  courses: Course[],
  today: ISODate,
): TrackedAssessment[] {
  return trackAll(assessments, courses, today).filter((t) => t.urgency === "overdue");
}

/** Due today, high priority first, then by time. */
export function dueToday(
  assessments: Assessment[],
  courses: Course[],
  today: ISODate,
): TrackedAssessment[] {
  return trackAll(assessments, courses, today)
    .filter((t) => t.urgency === "today")
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.assessment.priority] - PRIORITY_RANK[b.assessment.priority] ||
        compareTracked(a, b),
    );
}

/** Group tracked items by due date, preserving order; days with nothing are omitted. */
export function groupByDate(items: TrackedAssessment[]): Array<{ date: ISODate; items: TrackedAssessment[] }> {
  const groups = new Map<ISODate, TrackedAssessment[]>();
  for (const item of items) {
    const list = groups.get(item.assessment.dueDate) ?? [];
    list.push(item);
    groups.set(item.assessment.dueDate, list);
  }
  return [...groups.entries()].map(([date, list]) => ({ date, items: list }));
}

/** Assessments indexed by due date, including completed ones (calendar shows history). */
export function indexByDate(assessments: Assessment[], courses: Course[]): Map<ISODate, Array<{ assessment: Assessment; course: Course }>> {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const index = new Map<ISODate, Array<{ assessment: Assessment; course: Course }>>();
  for (const a of assessments) {
    const course = byId.get(a.courseId);
    if (!course || course.archived) continue;
    const list = index.get(a.dueDate) ?? [];
    list.push({ assessment: a, course });
    index.set(a.dueDate, list);
  }
  for (const list of index.values()) {
    list.sort((x, y) =>
      compareDateTime(
        { date: x.assessment.dueDate, time: x.assessment.dueTime },
        { date: y.assessment.dueDate, time: y.assessment.dueTime },
      ),
    );
  }
  return index;
}

export interface WeightSummary {
  total: number;
  graded: number;
  /** Weighted average of graded work, 0–100, or null if nothing graded. */
  currentGrade: number | null;
  overAllocated: boolean;
}

export function weightSummary(courseId: ID, assessments: Assessment[]): WeightSummary {
  let total = 0;
  let graded = 0;
  let earned = 0;
  for (const a of assessments) {
    if (a.courseId !== courseId || a.weight === null) continue;
    total += a.weight;
    if (a.grade !== null) {
      graded += a.weight;
      earned += (a.grade / 100) * a.weight;
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    total: round(total),
    graded: round(graded),
    currentGrade: graded > 0 ? round((earned / graded) * 100) : null,
    overAllocated: total > 100.0001,
  };
}
