import { addDays, localDate, weekdayOf } from "../clock";
import type { Assessment } from "../types/assessment";
import type { Course } from "../types/course";
import type { ClassSlot } from "../types/schedule";
import type { ISODate } from "../types/ids";
import { adapter } from "../storage";

export interface TodayMeeting {
  slot: ClassSlot;
  course: Course;
  date: ISODate;
}

export interface DashboardData {
  today: ISODate;
  meetings: TodayMeeting[];
  todayTasks: Assessment[];
  overdue: Assessment[];
  examsIn7Days: Assessment[];
  courses: Course[];
}

function occursOn(slot: ClassSlot, date: ISODate): boolean {
  if (date < slot.startsOn) return false;
  if (slot.endsOn && date > slot.endsOn) return false;
  if (slot.cancelledDates.includes(date)) return false;
  if (slot.extraDates.includes(date)) return true;
  if (slot.kind === "once") return slot.startsOn === date;
  const wd = weekdayOf(date) as ClassSlot["days"][number];
  return slot.days.includes(wd);
}

export async function loadDashboard(
  today: ISODate = localDate(),
): Promise<DashboardData> {
  const horizon = addDays(today, 7);
  const [courses, slots, assessments] = await Promise.all([
    adapter.listCourses("active"),
    adapter.listSlots(),
    adapter.listAssessments(),
  ]);
  const byId = new Map(courses.map((c) => [c.id, c]));

  const meetings: TodayMeeting[] = slots
    .filter((s) => occursOn(s, today) && byId.has(s.courseId))
    .map((slot) => ({ slot, course: byId.get(slot.courseId)!, date: today }))
    .sort((a, b) => a.slot.time.startMin - b.slot.time.startMin);

  const open = assessments.filter(
    (a) => a.status !== "done" && a.status !== "cancelled",
  );

  return {
    today,
    meetings,
    todayTasks: open.filter((a) => a.dueOn === today),
    overdue: open.filter((a) => a.dueOn < today),
    examsIn7Days: open.filter(
      (a) =>
        (a.kind === "exam" || a.kind === "midterm") &&
        a.dueOn >= today &&
        a.dueOn <= horizon,
    ),
    courses,
  };
}

export { occursOn };
