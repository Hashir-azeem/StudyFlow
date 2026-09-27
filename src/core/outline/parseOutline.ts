import type { ISODate, Weekday } from "../types";
import { findAssessments } from "./assessments";
import { findInstructors } from "./instructors";
import { findMeetings } from "./meetings";
import { spansTerm } from "./recurrence";
import { sanitizeOutline } from "./sanitize";
import { segmentOutline } from "./sections";
import { findDate, weekToDate } from "./text";
import type { ParsedAssessment, ParsedOutline } from "./types";

/**
 * Deterministic, on-device outline parser. Pure: text in, structure out.
 *
 *   segmentOutline  → which section each line is in (grading, schedule, policy…)
 *   findInstructors → every person with a teaching role, ranked
 *   findMeetings    → weekly recurring rules (dated sessions folded into patterns)
 *   findAssessments → graded work; weights only from the grading section
 *   sanitizeOutline → normalise, verify weights against 100%, write warnings
 *
 * It favours precision over recall, and everything goes through a review
 * screen before anything is saved.
 */
export interface ParseOptions {
  /** Anchor for dates without a year when the outline gives no term start. */
  today: ISODate;
}

/* ------------------------------------------------------------ course info */

const CODE = /\b([A-Z]{2,5})\s?-?(\d{2,4}[A-Z]?)\b/g;
const NOT_CODE = /^(AM|PM|ID|ISBN|WEEK|ROOM|RM|PAGE|FALL|WINTER|SPRING|SUMMER|UTC|EST|EDT)$/;
const TERM = /\b(fall|winter|spring|summer|autumn)\s*(?:term|semester|session)?\s*,?\s*(\d{4})\b/i;
const TITLE_LABEL = /\bcourse\s+(?:title|name)\s*[:-]\s*(.+)$/i;

function codeMatches(line: string) {
  return [...line.matchAll(CODE)].filter((m) => !NOT_CODE.test(m[1]!));
}

function findCourseInfo(lines: string[]): ParsedOutline["course"] {
  let code: string | null = null;
  let name: string | null = null;
  let codeLine: string | null = null;
  let codeRaw: string | null = null;

  // Prefer a code near the top (title block); else the most repeated one.
  for (const line of lines.slice(0, 12)) {
    const m = codeMatches(line)[0];
    if (m) {
      code = `${m[1]} ${m[2]}`;
      codeLine = line;
      codeRaw = m[0];
      break;
    }
  }
  if (!code) {
    const counts = new Map<string, number>();
    for (const line of lines) for (const m of codeMatches(line)) counts.set(`${m[1]} ${m[2]}`, (counts.get(`${m[1]} ${m[2]}`) ?? 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 2) code = best[0];
  }

  const labeled = lines.map((l) => TITLE_LABEL.exec(l)).find(Boolean);
  if (labeled) name = cleanName(labeled[1]!);
  else if (codeLine && codeRaw) name = cleanName(codeLine.replace(codeRaw, ""));

  const term = lines.map((l) => TERM.exec(l)).find(Boolean);
  return {
    code,
    name,
    term: term ? `${term[1]![0]!.toUpperCase()}${term[1]!.slice(1).toLowerCase()} ${term[2]}` : null,
  };
}

function cleanName(raw: string): string | null {
  const s = raw
    .replace(/\bcourse\s+(?:outline|syllabus|information|overview)\b/gi, "")
    .replace(TERM, "")
    .replace(/[()]/g, " ")
    .replace(/^[\s:,|-]+|[\s:,|-]+$/g, "")
    .replace(/\s{2,}/g, " ");
  return s.length >= 3 && s.length <= 90 && /[a-z]/i.test(s) ? s : null;
}

/* ------------------------------------------------------------- term dates */

const TERM_START = /\b(?:(?:classes|lectures|term|semester|instruction)\s+(?:begins?|starts?|commences?)|first\s+(?:day|class|week)\s+of\s+(?:classes|class|lectures|term))\b/i;
const TERM_END = /\b(?:last\s+day\s+of\s+(?:classes|lectures|term)|(?:classes|lectures|term)\s+(?:ends?|finish(?:es)?))\b/i;

function findTermDates(lines: string[], today: ISODate): { termStart: ISODate | null; termEnd: ISODate | null } {
  let termStart: ISODate | null = null;
  let termEnd: ISODate | null = null;
  for (const line of lines) {
    const s = TERM_START.exec(line);
    if (s && !termStart) termStart = findDate(line.slice(s.index), today)?.date ?? null;
    const e = TERM_END.exec(line);
    if (e && !termEnd) termEnd = findDate(line.slice(e.index), termStart ?? today)?.date ?? null;
  }
  if (termStart && termEnd && termEnd < termStart) termEnd = null;
  return { termStart, termEnd };
}

/* ----------------------------------------------------------------- output */

/** Calendar date for review: the explicit date, else the week number resolved against the term start. */
export function resolveAssessmentDate(a: ParsedAssessment, termStart: ISODate | null): ISODate | null {
  if (a.date) return a.date;
  if (a.week && termStart) return weekToDate(termStart, a.week, (a.weekday ?? null) as Weekday | null);
  return null;
}

export function parseOutline(raw: string, { today }: ParseOptions): ParsedOutline {
  const lines = segmentOutline(raw);
  const texts = lines.map((l) => l.text);
  const course = findCourseInfo(texts);
  let { termStart, termEnd } = findTermDates(texts, today);
  const anchor = termStart ?? today;
  const meetings = findMeetings(lines, course.code, anchor, termEnd);

  // No stated term dates: a dated weekly schedule still says when classes start,
  // and when they end only if it covers most of the term.
  const weekly = meetings.filter((m) => !m.oneOff && m.startDate);
  if (!termStart && weekly.length) termStart = weekly.map((m) => m.startDate!).sort()[0]!;
  if (!termEnd) {
    const last = weekly.map((m) => m.endDate).filter((d): d is ISODate => !!d).sort().reverse()[0] ?? null;
    if (spansTerm(termStart, last)) termEnd = last;
  }

  const scan = findAssessments(lines, termStart ?? anchor);
  return sanitizeOutline({
    course,
    instructors: findInstructors(lines),
    termStart,
    termEnd,
    meetings,
    assessments: scan.assessments,
    weightCheck: { declaredTotal: scan.declaredTotal },
    gradingSectionFound: scan.gradingSectionFound,
  });
}
