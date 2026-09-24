import type { ID, ISODateTime } from "./ids";
import type { ClassSlot, SlotDraft } from "./schedule";

export type CourseStatus = "active" | "archived";

export type HexColor = `#${string}`;

export interface Course {
  id: ID;
  name: string;
  code: string;
  instructor: string;
  status: CourseStatus;
  color: HexColor;
  termId?: ID;
  notes?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface CourseWithSchedule extends Course {
  slots: ClassSlot[];
}

export interface CourseDraft {
  name: string;
  code: string;
  instructor: string;
  color: HexColor;
  termId?: ID;
  notes?: string;
  slots: SlotDraft[];
}
