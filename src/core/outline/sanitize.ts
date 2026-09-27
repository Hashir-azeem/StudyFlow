import { isISODate } from "../dates";
import { newId } from "../validation";
import { ASSESSMENT_KINDS, SESSION_KINDS, type AssessmentKind, type ISODate, type SessionKind, type TimeOfDay } from "../types";
import { meetingRRule, normalizeDays, validateRecurrence } from "./recurrence";
import {
  INSTRUCTOR_ROLES,
  OUTLINE_SCHEMA_VERSION,
  type AssessmentFlag,
  type InstructorCandidate,
  type InstructorRole,
  type ParsedAssessment,
  type ParsedOutline,
  type RecurringMeeting,
} from "./types";
import { checkWeights } from "./weights";

/**
 * The single gate every extraction passes through before the review screen,
 * whether it came from the rule-based parser or, later, a model returning
 * JSON (docs/outline-schema.json). Coerces loose values ("Tues", "10am",
 * "25%"), drops what can't be repaired, then recomputes the derived fields
 * (RRULE, weight check, warnings) so they can't disagree with the data.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const FLAGS: readonly AssessmentFlag[] = ["optional", "dropped", "outside-grading", "tba", "week-only"];

/** "10:00", "9:05", "10am", "10:30 pm", "1030", "22:15" → "HH:mm". */
export function normalizeTime(v: unknown): TimeOfDay | null {
  if (typeof v !== "string") return null;
  const m = /^\s*(\d{1,2})(?::?(\d{2}))?\s*([ap])?\.?\s*m?\.?\s*$/i.exec(v);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ap === "p" ? 12 : 0);
  } else if (h > 23 || m[2] === undefined) {
    return null; // "10" alone is ambiguous
  }
  return `${pad(h)}:${pad(min)}`;
}

/** 25, "25", "25%", " 12.5 % " → a number in (0, 100]; anything else → null. */
export function normalizeWeight(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/%/g, "").trim()) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
}

const iso = (v: unknown): ISODate | null => (isISODate(v) ? v : null);

function sanitizeInstructor(raw: unknown): InstructorCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name);
  if (!name || name.length > 80) return null;
  return {
    id: str(r.id) ?? newId(),
    name,
    role: INSTRUCTOR_ROLES.includes(r.role as never) ? (r.role as InstructorRole) : "other",
    section: str(r.section),
    source: str(r.source) ?? "",
  };
}

function sanitizeMeeting(raw: unknown, termEnd: ISODate | null): RecurringMeeting | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const daysOfWeek = normalizeDays(r.daysOfWeek ?? r.days);
  const startTime = normalizeTime(r.startTime ?? r.start);
  const endTime = normalizeTime(r.endTime ?? r.end);
  if (!startTime || !endTime) return null;
  const startDate = iso(r.startDate);
  const endDate = iso(r.endDate);
  if (validateRecurrence({ daysOfWeek, startTime, endTime, startDate, endDate }).length) return null;
  return {
    id: str(r.id) ?? newId(),
    daysOfWeek,
    startTime,
    endTime,
    kind: SESSION_KINDS.includes(r.kind as never) ? (r.kind as SessionKind) : "lecture",
    location: str(r.location),
    startDate,
    endDate,
    oneOff: r.oneOff === true,
    rrule: meetingRRule({ daysOfWeek, startDate, endDate, oneOff: r.oneOff === true }, termEnd),
    source: str(r.source) ?? "",
  };
}

function sanitizeAssessment(raw: unknown): ParsedAssessment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = str(r.title);
  if (!title) return null;
  const week = Number(r.week);
  const weekday = Number(r.weekday);
  const flags = Array.isArray(r.flags) ? (r.flags.filter((f) => FLAGS.includes(f as AssessmentFlag)) as AssessmentFlag[]) : [];
  const optional = r.optional === true || flags.includes("optional");
  return {
    id: str(r.id) ?? newId(),
    title: title.slice(0, 200),
    kind: ASSESSMENT_KINDS.includes(r.kind as never) ? (r.kind as AssessmentKind) : "task",
    date: iso(r.date),
    week: Number.isInteger(week) && week >= 1 && week <= 20 ? week : null,
    weekday: Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : null,
    time: normalizeTime(r.time),
    weight: normalizeWeight(r.weight),
    mentionedWeight: normalizeWeight(r.mentionedWeight),
    optional,
    flags: optional && !flags.includes("optional") ? [...flags, "optional"] : [...new Set(flags)],
    source: str(r.source) ?? "",
  };
}

export function sanitizeOutline(raw: unknown): ParsedOutline {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const course = r.course && typeof r.course === "object" ? (r.course as Record<string, unknown>) : {};
  const termStart = iso(r.termStart);
  let termEnd = iso(r.termEnd);
  if (termStart && termEnd && termEnd < termStart) termEnd = null;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);

  const instructors = list(r.instructors).map(sanitizeInstructor).filter((x) => x !== null);
  const meetings = list(r.meetings).map((m) => sanitizeMeeting(m, termEnd)).filter((x) => x !== null);
  const assessments = list(r.assessments).map(sanitizeAssessment).filter((x) => x !== null);
  const declared = normalizeWeight(r.weightCheck && typeof r.weightCheck === "object" ? (r.weightCheck as Record<string, unknown>).declaredTotal : null);
  const gradingSectionFound = r.gradingSectionFound === true;
  const weightCheck = checkWeights(assessments, declared);

  const warnings: string[] = [];
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  if (instructors.length > 1) warnings.push(`${n(instructors.length, "person is", "people are")} listed with teaching roles. Choose your instructor.`);
  if (meetings.length === 0) warnings.push("No weekly class times were found. You can add them to the course afterwards.");
  const oneOffs = meetings.filter((m) => m.oneOff).length;
  if (oneOffs) warnings.push(`${n(oneOffs, "session appears", "sessions appear")} on a single date only, so ${oneOffs === 1 ? "it's" : "they're"} not added as weekly classes unless you tick ${oneOffs === 1 ? "it" : "them"}.`);
  if (assessments.length === 0) warnings.push("No graded work with a date or weight was found.");
  if (!gradingSectionFound && assessments.some((a) => a.weight !== null)) {
    warnings.push("No Evaluation or Grading section was recognised, so weights were collected from the whole outline. Check them carefully.");
  }
  const byWeek = assessments.filter((a) => a.flags.includes("week-only")).length;
  if (byWeek && !termStart) warnings.push(`${n(byWeek, "item is", "items are")} given by week number. Enter the term start date to place ${byWeek === 1 ? "it" : "them"} on the calendar.`);
  const tba = assessments.filter((a) => a.flags.includes("tba")).length;
  if (tba) warnings.push(`${n(tba, "item is", "items are")} marked TBA and left unticked until you pick a date.`);
  const optional = assessments.filter((a) => a.optional).length;
  if (optional) warnings.push(`${n(optional, "bonus or optional item was", "bonus or optional items were")} found and ${optional === 1 ? "isn't" : "aren't"} counted toward 100%.`);
  if (weightCheck.status === "over") {
    warnings.push(`Counted weights add up to ${weightCheck.total}%, ${weightCheck.difference}% over 100%. You'll be asked to check this before saving.`);
  } else if (weightCheck.status === "under") {
    warnings.push(`Counted weights add up to ${weightCheck.total}%, ${-weightCheck.difference}% short of 100%. Something from the grading table may be missing.`);
  }
  if (declared !== null && weightCheck.total > 0 && Math.abs(declared - weightCheck.total) > 0.01) {
    warnings.push(`The outline's grading table says the total is ${declared}%, but the items found add up to ${weightCheck.total}%.`);
  }

  return {
    schemaVersion: OUTLINE_SCHEMA_VERSION,
    course: { code: str(course.code), name: str(course.name), term: str(course.term) },
    instructors,
    termStart,
    termEnd,
    meetings,
    assessments,
    weightCheck,
    gradingSectionFound,
    warnings,
  };
}
