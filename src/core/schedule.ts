import { timeToMinutes, weekdayOf } from "./dates";
import type { Course, ISODate, ScheduleSlot, TimeOfDay } from "./types";

export interface ClassOccurrence {
  course: Course;
  slot: ScheduleSlot;
  date: ISODate;
}

export type ClassStatus = "done" | "live" | "next" | "later";

/** True when the course meets at all on this date (term bounds, skip dates, archive). */
export function courseMeetsOn(course: Course, date: ISODate): boolean {
  if (course.archived) return false;
  if (course.termStart && date < course.termStart) return false;
  if (course.termEnd && date > course.termEnd) return false;
  return !course.skipDates.includes(date);
}

export function classesOn(date: ISODate, courses: Course[]): ClassOccurrence[] {
  const day = weekdayOf(date);
  const out: ClassOccurrence[] = [];
  for (const course of courses) {
    if (!courseMeetsOn(course, date)) continue;
    for (const slot of course.schedule) {
      if (slot.days.includes(day)) out.push({ course, slot, date });
    }
  }
  return out.sort(
    (a, b) =>
      timeToMinutes(a.slot.start) - timeToMinutes(b.slot.start) ||
      a.course.code.localeCompare(b.course.code),
  );
}

/**
 * Label each of today's classes relative to the current time.
 * Only the first class that hasn't started yet is "next".
 */
export function classStatuses(
  occurrences: ClassOccurrence[],
  now: TimeOfDay,
): Array<ClassOccurrence & { status: ClassStatus }> {
  const nowMin = timeToMinutes(now);
  let nextAssigned = false;
  return occurrences.map((o) => {
    const start = timeToMinutes(o.slot.start);
    const end = timeToMinutes(o.slot.end);
    let status: ClassStatus;
    if (nowMin >= end) status = "done";
    else if (nowMin >= start) status = "live";
    else if (!nextAssigned) {
      status = "next";
      nextAssigned = true;
    } else status = "later";
    return { ...o, status };
  });
}

/** Pairs of slots in one course that overlap on at least one shared weekday. */
export function findSlotConflicts(slots: ScheduleSlot[]): Array<[ScheduleSlot, ScheduleSlot]> {
  const conflicts: Array<[ScheduleSlot, ScheduleSlot]> = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i]!;
      const b = slots[j]!;
      if (!a.days.some((d) => b.days.includes(d))) continue;
      if (timeToMinutes(a.start) < timeToMinutes(b.end) && timeToMinutes(b.start) < timeToMinutes(a.end)) {
        conflicts.push([a, b]);
      }
    }
  }
  return conflicts;
}
