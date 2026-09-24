import type { ID, ISODate, ISODateTime } from "./ids";
import type { TimeRange } from "./schedule";

export type AssessmentKind =
  | "assignment"
  | "project"
  | "quiz"
  | "midterm"
  | "exam"
  | "other";

export type Priority = "low" | "medium" | "high";

export type AssessmentStatus = "todo" | "in_progress" | "done" | "cancelled";

export interface Assessment {
  id: ID;
  courseId: ID;
  title: string;
  kind: AssessmentKind;
  dueOn: ISODate;
  dueTime?: TimeRange;
  priority: Priority;
  weightPercent: number | null;
  status: AssessmentStatus;
  notes?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface AssessmentDraft {
  courseId: ID;
  title: string;
  kind: AssessmentKind;
  dueOn: ISODate;
  dueTime?: TimeRange;
  priority: Priority;
  weightPercent: number | null;
  notes?: string;
}
