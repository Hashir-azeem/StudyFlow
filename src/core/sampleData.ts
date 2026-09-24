import { addDays } from "./dates";
import { newId } from "./validation";
import type { Assessment, AssessmentKind, Course, ISODate, Priority, ScheduleSlot, Weekday } from "./types";

/**
 * Optional demo data (content from the original starter templates), offered from
 * the empty state so a new student can explore before entering real courses.
 * Dates are relative to today so the Today view and trackers are populated.
 */
export function buildSampleData(today: ISODate): { courses: Course[]; assessments: Assessment[] } {
  const ts = Date.now();
  const slot = (days: Weekday[], start: string, end: string, location: string, kind: ScheduleSlot["kind"] = "lecture"): ScheduleSlot => ({
    id: newId(), days, start, end, kind, location,
  });
  const course = (code: string, name: string, instructor: string, color: string, schedule: ScheduleSlot[]): Course => ({
    id: newId(), code, name, instructor, color, schedule,
    termStart: null, termEnd: null, skipDates: [], archived: false, createdAt: ts, updatedAt: ts,
  });

  const cs = course("CS 221", "Data Structures", "Dr. Chen", "#4f7cff", [
    slot([1, 3], "10:00", "11:15", "Hall 204"),
    slot([5], "14:30", "16:20", "Lab B", "lab"),
  ]);
  const math = course("MATH 201", "Linear Algebra", "Prof. Alvarez", "#1fa98a", [slot([2, 4], "13:00", "14:20", "Science 12")]);
  const hist = course("HIST 110", "World History", "Dr. Okonkwo", "#f59e0b", [slot([1], "15:00", "16:30", "Arts 3", "seminar")]);

  const item = (c: Course, title: string, kind: AssessmentKind, inDays: number, priority: Priority, weight: number, dueTime: string | null = null): Assessment => ({
    id: newId(), courseId: c.id, title, kind, dueDate: addDays(today, inDays), dueTime, priority, weight,
    status: "todo", grade: null, notes: "", createdAt: ts, updatedAt: ts,
  });

  return {
    courses: [cs, math, hist],
    assessments: [
      item(cs, "Problem set 3", "assignment", 1, "medium", 5, "23:59"),
      item(cs, "Midterm", "midterm", 6, "high", 20, "10:00"),
      item(math, "Quiz 2", "quiz", 0, "medium", 8, "13:00"),
      item(math, "Project proposal", "project", 10, "low", 15),
      item(hist, "Reading response", "assignment", 2, "low", 10),
      item(hist, "Final exam", "exam", 21, "high", 35, "09:00"),
    ],
  };
}
