import type { AssessmentKind, Priority } from "../types/assessment";
import type { CourseDraft } from "../types/course";
import type { AssessmentDraft } from "../types/assessment";
import type { SlotDraft } from "../types/schedule";
import { addDays, localDate } from "../clock";

const termStart = (): string => {
  const today = localDate();
  const [y] = today.split("-").map(Number);
  return `${y}-09-01`;
};

const termEnd = (): string => {
  const [y] = localDate().split("-").map(Number);
  return `${y + 1}-04-30`;
};

function weekly(
  days: SlotDraft["days"],
  startMin: number,
  endMin: number,
  location: string,
): SlotDraft {
  return {
    kind: "weekly",
    days,
    time: { startMin, endMin },
    location,
    startsOn: termStart(),
    endsOn: termEnd(),
    cancelledDates: [],
    extraDates: [],
  };
}

export const STARTER_COURSES: CourseDraft[] = [
  {
    name: "Data Structures",
    code: "CS 221",
    instructor: "Dr. Chen",
    color: "#7C9CFF",
    slots: [weekly([1, 3], 10 * 60, 11 * 60 + 15, "Hall 204")],
  },
  {
    name: "Linear Algebra",
    code: "MATH 201",
    instructor: "Prof. Alvarez",
    color: "#8FD3C8",
    slots: [weekly([2, 4], 13 * 60, 14 * 60 + 20, "Science 12")],
  },
  {
    name: "World History",
    code: "HIST 110",
    instructor: "Dr. Okonkwo",
    color: "#F6C177",
    slots: [weekly([1], 15 * 60, 16 * 60 + 30, "Arts 3")],
  },
];

export function starterAssessments(
  courseIds: Record<string, string>,
): AssessmentDraft[] {
  const today = localDate();
  const item = (
    code: string,
    title: string,
    kind: AssessmentKind,
    days: number,
    priority: Priority,
    weightPercent: number,
  ): AssessmentDraft => ({
    courseId: courseIds[code],
    title,
    kind,
    dueOn: addDays(today, days),
    priority,
    weightPercent,
  });

  return [
    item("CS 221", "Problem set 3", "assignment", 1, "medium", 5),
    item("CS 221", "Midterm", "midterm", 6, "high", 20),
    item("MATH 201", "Quiz 2", "quiz", 0, "medium", 8),
    item("MATH 201", "Project proposal", "project", 10, "low", 15),
    item("HIST 110", "Reading response", "assignment", 2, "low", 10),
    item("HIST 110", "Final exam", "exam", 21, "high", 35),
  ];
}
