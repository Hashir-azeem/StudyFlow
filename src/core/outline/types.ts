import type { AssessmentKind, ID, ISODate, SessionKind, TimeOfDay } from "../types";

/**
 * Structured result of reading a course outline (schema v2).
 * docs/outline-schema.json is the same contract as JSON Schema, for any other
 * extractor (e.g. a model) that feeds the review screen through sanitizeOutline().
 *
 * Only this structure leaves the parsing pipeline; the document text never does.
 * `source` is the single matching line, shown during review and never saved.
 */
export const OUTLINE_SCHEMA_VERSION = 2;

/** iCalendar weekday codes (RFC 5545), as used in RRULE BYDAY. Monday first. */
export const DAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type DayCode = (typeof DAY_CODES)[number];

/* ------------------------------------------------------------ instructors */

export const INSTRUCTOR_ROLES = ["instructor", "coordinator", "lab", "tutorial", "ta", "other"] as const;
export type InstructorRole = (typeof INSTRUCTOR_ROLES)[number];

export interface InstructorCandidate {
  id: ID;
  name: string;
  role: InstructorRole;
  /** "011" when the outline ties the person to a section. */
  section: string | null;
  source: string;
}

/* --------------------------------------------------------------- meetings */

/**
 * A weekly recurring class, not an isolated event:
 * { daysOfWeek: ["TU","TH"], startTime: "10:00", endTime: "11:20" } repeating
 * from startDate to endDate (falling back to the term dates).
 */
export interface RecurringMeeting {
  id: ID;
  daysOfWeek: DayCode[];
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  kind: SessionKind;
  location: string | null;
  /** First/last dated session seen, when the outline lists sessions by date. */
  startDate: ISODate | null;
  endDate: ISODate | null;
  /** RFC 5545 rule for interop, e.g. "FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20271207T235959". */
  rrule: string;
  /** Seen on one date only (a review session, say): offered but unticked. */
  oneOff: boolean;
  source: string;
}

/* ------------------------------------------------------------ assessments */

export type AssessmentFlag =
  | "optional" // bonus / extra credit / optional: never counted toward 100%
  | "dropped" // "best 8 of 10": the lowest ones don't count
  | "outside-grading" // found outside the Evaluation section; its weight wasn't trusted
  | "tba" // date to be announced
  | "week-only"; // "Week 7": needs the term start to become a date

export interface ParsedAssessment {
  id: ID;
  title: string;
  kind: AssessmentKind;
  date: ISODate | null;
  week: number | null;
  /** 0 = Sunday … 6 = Saturday, for "Week 7 (Friday)". */
  weekday: number | null;
  time: TimeOfDay | null;
  /** Counted weight, from the grading section when the outline has one. */
  weight: number | null;
  /** A weight mentioned elsewhere (schedule, policies) that was not counted. */
  mentionedWeight: number | null;
  optional: boolean;
  flags: AssessmentFlag[];
  source: string;
}

/* ---------------------------------------------------------- weight check */

export type WeightStatus = "exact" | "under" | "over" | "none";

export interface WeightCheck {
  /** Sum of counted weights of non-optional items. */
  total: number;
  /** "Total 100%" row from the grading table, if present. */
  declaredTotal: number | null;
  status: WeightStatus;
  /** total − 100, rounded to 2 dp. */
  difference: number;
}

/* ---------------------------------------------------------------- outline */

export interface ParsedOutline {
  schemaVersion: typeof OUTLINE_SCHEMA_VERSION;
  course: {
    code: string | null;
    name: string | null;
    term: string | null;
  };
  /** Everyone named with a teaching role, primary lecturers first. */
  instructors: InstructorCandidate[];
  termStart: ISODate | null;
  termEnd: ISODate | null;
  meetings: RecurringMeeting[];
  assessments: ParsedAssessment[];
  weightCheck: WeightCheck;
  /** True when an Evaluation/Grading section was found and weights came only from it. */
  gradingSectionFound: boolean;
  warnings: string[];
}
