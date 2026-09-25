import type { AssessmentKind, ID, ISODate, SessionKind, TimeOfDay, Weekday } from "../types";

/**
 * Structured result of reading a course outline. This is the only thing that
 * leaves the parsing pipeline: the raw document text never does. `source` is
 * the single matching line, shown during review so the student can check the
 * extraction, and dropped when the approved items are saved.
 */
export interface ParsedMeeting {
  id: ID;
  days: Weekday[];
  start: TimeOfDay;
  end: TimeOfDay;
  kind: SessionKind;
  location: string | null;
  source: string;
}

export interface ParsedAssessment {
  id: ID;
  title: string;
  kind: AssessmentKind;
  /** Explicit calendar date found in the outline. */
  date: ISODate | null;
  /** "Week 7" style reference, resolved against the term start during review. */
  week: number | null;
  weekday: Weekday | null;
  time: TimeOfDay | null;
  weight: number | null;
  /** Outline says TBA / "during the exam period". */
  tba: boolean;
  source: string;
}

export interface ParsedOutline {
  course: {
    code: string | null;
    name: string | null;
    instructor: string | null;
    term: string | null;
  };
  termStart: ISODate | null;
  termEnd: ISODate | null;
  meetings: ParsedMeeting[];
  assessments: ParsedAssessment[];
  warnings: string[];
}
