import type { ID, ISODate, ISODateTime, MinutesFromMidnight } from "./ids";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type RecurrenceKind = "weekly" | "once";

export interface TimeRange {
  startMin: MinutesFromMidnight;
  endMin: MinutesFromMidnight;
}

export interface ClassSlot {
  id: ID;
  courseId: ID;
  kind: RecurrenceKind;
  days: Weekday[];
  time: TimeRange;
  location?: string;
  startsOn: ISODate;
  endsOn?: ISODate;
  cancelledDates: ISODate[];
  extraDates: ISODate[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Term {
  id: ID;
  name: string;
  startsOn: ISODate;
  endsOn: ISODate;
  isCurrent: boolean;
}

export type SlotDraft = Omit<
  ClassSlot,
  "id" | "courseId" | "createdAt" | "updatedAt"
>;
