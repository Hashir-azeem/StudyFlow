import { newId } from "../validation";
import type { AssessmentKind, ISODate, SessionKind, Weekday } from "../types";
import {
  findCountEach,
  findDate,
  findDays,
  findLocation,
  findTime,
  findTimeRange,
  findWeight,
  isOnlyWeight,
  normalizeLines,
  weekToDate,
  type DateMatch,
} from "./text";
import type { ParsedAssessment, ParsedMeeting, ParsedOutline } from "./types";

/**
 * Deterministic, on-device outline parser. Pure: text in, structure out, no
 * I/O, so it runs anywhere and every rule is covered by unit tests.
 *
 * It favors precision over recall. An item is kept only with evidence
 * (a date, a week number, a weight, or TBA); everything it finds goes through
 * a review screen before anything is saved.
 */
export interface ParseOptions {
  /** Anchor for dates without a year when the outline gives no term start. */
  today: ISODate;
}

/* ------------------------------------------------------------ course info */

const CODE = /\b([A-Z]{2,5})\s?-?(\d{2,4}[A-Z]?)\b/g;
const NOT_CODE = /^(AM|PM|ID|ISBN|WEEK|ROOM|RM|PAGE|FALL|WINTER|SPRING|SUMMER|UTC|EST|EDT)$/;
const TERM = /\b(fall|winter|spring|summer|autumn)\s*(?:term|semester|session)?\s*,?\s*(\d{4})\b/i;
const INSTRUCTOR =
  /\b(?:instructors?|professors?|lecturers?|course (?:director|coordinator|instructor)|taught by)\b(?:\s*\(s\))?(?:\s+name)?\s*[:-]?\s*(.*)$/i;
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

  let instructor: string | null = null;
  for (let i = 0; i < lines.length && !instructor; i++) {
    const m = INSTRUCTOR.exec(lines[i]!);
    if (!m) continue;
    instructor = personName(m[1]!) ?? (m[1]!.trim() === "" ? personName(lines[i + 1] ?? "") : null);
  }

  const term = lines.map((l) => TERM.exec(l)).find(Boolean);
  return {
    code,
    name,
    instructor,
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

function personName(raw: string): string | null {
  const s = raw
    .replace(/\S+@\S+/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(?:dr|prof|professor|mr|ms|mrs|mx)\.?\s+/gi, "")
    .split(/[,;|]| - |\b(?:office|email|e-mail|phone|tel)\b/i)[0]!
    .trim();
  const m = /^([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,3})/.exec(s);
  return m && m[1]!.length >= 3 ? m[1]! : null;
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

/* --------------------------------------------------------------- meetings */

const NOT_MEETING = /\b(office\s*hours?|OH|exams?|midterms?|quiz(?:zes)?|tests?|deadlines?|due|drop|withdraw\w*|holiday|reading week|no class(?:es)?|closed)\b/i;

function sessionKind(line: string): SessionKind | null {
  if (/\b(?:lab(?:oratory|oratories)?s?|LAB)\b/i.test(line)) return "lab";
  if (/\b(?:tut(?:orial)?s?|TUT)\b/i.test(line)) return "tutorial";
  if (/\b(?:seminars?|SEM)\b/i.test(line)) return "seminar";
  if (/\b(?:lec(?:ture)?s?|LEC)\b/i.test(line)) return "lecture";
  return null;
}

function findMeetings(lines: string[], courseCode: string | null): ParsedMeeting[] {
  const found: ParsedMeeting[] = [];
  lines.forEach((line, i) => {
    if (NOT_MEETING.test(line)) return;
    const range = findTimeRange(line);
    if (!range) return;
    const prev = lines[i - 1] ?? "";
    // Table layouts put the day or session type on the line above.
    const prevIsLabel = prev.length <= 40 && !findTimeRange(prev) && !NOT_MEETING.test(prev);
    let days = findDays(line);
    if (days.length === 0 && prevIsLabel) days = findDays(prev);
    if (days.length === 0) return;
    const next = lines[i + 1] ?? "";
    found.push({
      id: newId(),
      days,
      start: range.start,
      end: range.end,
      kind: sessionKind(line) ?? (prevIsLabel ? sessionKind(prev) : null) ?? "lecture",
      location: findLocation(line, courseCode) ?? (/^(?:room|location|rm)\b/i.test(next) ? findLocation(next, courseCode) : null),
      source: line,
    });
  });

  // "Monday 10-11:50" and "Wednesday 10-11:50" on separate lines are one meeting pattern.
  const merged = new Map<string, ParsedMeeting>();
  for (const m of found) {
    const key = `${m.kind}|${m.start}|${m.end}|${m.location ?? ""}`;
    const existing = merged.get(key);
    if (existing) existing.days = [...new Set([...existing.days, ...m.days])].sort((a, b) => a - b) as Weekday[];
    else merged.set(key, { ...m });
  }
  return [...merged.values()];
}

/* ------------------------------------------------------------ assessments */

/** Policy sentences mention "10%" and "assignment" without being assessments. */
const POLICY =
  /\b(?:late|penalt\w*|deduct\w*|per day|loses?|lost|reduced|miss(?:ed|ing)?|make-?up|accommodat\w*|polic(?:y|ies)|integrity|plagiari\w*|re-?grade|appeal\w*|excus\w*|grading scheme|letter grade|extensions?)\b/i;

const KINDS: Array<{ re: RegExp; kind: AssessmentKind; label: string }> = [
  { re: /\bfinal\s+(?:exam(?:ination)?|test|assessment)\b/i, kind: "exam", label: "Final exam" },
  { re: /\bmid-?\s?terms?(?:\s+(?:exam(?:ination)?|test))?\b/i, kind: "midterm", label: "Midterm" },
  { re: /\bterm\s+tests?\b/i, kind: "midterm", label: "Term test" },
  { re: /\bexam(?:ination)?s?\b/i, kind: "exam", label: "Exam" },
  { re: /\bquiz(?:zes)?\b/i, kind: "quiz", label: "Quiz" },
  { re: /\btests?\b/i, kind: "quiz", label: "Test" },
  { re: /\b(?:final\s+)?projects?\b/i, kind: "project", label: "Project" },
  { re: /\bpresentations?\b/i, kind: "project", label: "Presentation" },
  { re: /\b(?:assignments?|homework|problem\s+sets?)\b/i, kind: "assignment", label: "Assignment" },
  { re: /\blab(?:oratory)?\s+reports?\b/i, kind: "assignment", label: "Lab report" },
  { re: /\blabs?\b/i, kind: "assignment", label: "Lab" },
  { re: /\b(?:essays?|papers?|reports?|reflections?|proposals?|case stud(?:y|ies))\b/i, kind: "assignment", label: "Paper" },
  { re: /\b(?:participation|attendance|engagement)\b/i, kind: "task", label: "Participation" },
];
const EXAM_LIKE = new Set<AssessmentKind>(["exam", "midterm", "quiz"]);

interface Candidate extends ParsedAssessment {
  key: string;
}

function titleFrom(line: string, start: number, cuts: Array<number | undefined>, fallback: string): string {
  const end = Math.min(line.length, ...cuts.filter((i): i is number => i !== undefined && i > start));
  let t = line
    .slice(start, end)
    .replace(/[\s:,;|(-]+$/, "")
    .trim();
  if ((t.match(/\(/g)?.length ?? 0) > (t.match(/\)/g)?.length ?? 0)) t = t.replace(/\s*\([^)]*$/, "");
  if (!t || t.length > 70) t = fallback;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function findAssessments(lines: string[], anchor: ISODate): ParsedAssessment[] {
  const candidates: Candidate[] = [];

  lines.forEach((line, i) => {
    if (line.length > 220 || POLICY.test(line)) return;
    const hit = KINDS.map((k) => ({ ...k, m: k.re.exec(line) })).find((k) => k.m);
    if (!hit?.m) return;
    const range = findTimeRange(line);
    // "Lab: Fri 2-3:50pm" is a class meeting, not graded work.
    if (range && findDays(line).length > 0 && !EXAM_LIKE.has(hit.kind)) return;

    const each = findCountEach(line);
    let weight = each ? { weight: each.count * each.each, index: each.index } : findWeight(line);
    let date: DateMatch | null = findDate(line, anchor);

    // DOCX/PDF tables often put the weight or date cell on its own line.
    for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
      const next = lines[j]!;
      if (KINDS.some((k) => k.re.test(next))) break;
      if (!weight && isOnlyWeight(next)) weight = { weight: Number(/[\d.]+/.exec(next)![0]), index: Infinity };
      else if (!date && next.length <= 32) {
        const d = findDate(next, anchor);
        if (d) date = { ...d, index: Infinity };
      }
    }
    if (!weight && !date) return;

    const after = line.slice(hit.m.index + hit.m[0].length);
    const number = /^\s*#?\s*(\d{1,2})\b/.exec(after)?.[1] ?? null;
    const time = EXAM_LIKE.has(hit.kind) || /\bdue\b|\bby\b/i.test(line) ? findTime(line) : null;
    const days = findDays(line);
    const kind: AssessmentKind = hit.label === "Test" && (weight?.weight ?? 0) >= 15 ? "midterm" : hit.kind;
    const due = /\bdue\b/i.exec(line)?.index;
    const title = titleFrom(
      line,
      hit.m.index,
      [weight?.index, date?.index, each?.index, range?.index, time?.index, due, line.indexOf(" | ")],
      `${hit.label}${number ? ` ${number}` : ""}`,
    );

    const base = {
      kind,
      date: date?.date ?? null,
      week: date?.week ?? null,
      weekday: days.length === 1 ? days[0]! : null,
      time: time?.time ?? null,
      tba: date?.tba ?? false,
      source: line,
    };

    if (each && !number) {
      // "Labs (10 x 1%)" → Lab 1 … Lab 10, each 1%, dates to fill in.
      const singular = hit.label;
      for (let n = 1; n <= each.count; n++) {
        candidates.push({
          ...base,
          id: newId(),
          title: `${singular} ${n}`,
          weight: each.each,
          date: null,
          week: null,
          key: `${singular.toLowerCase()}|${n}`,
        });
      }
      return;
    }

    candidates.push({ ...base, id: newId(), title, weight: weight?.weight ?? null, key: `${hit.label.toLowerCase()}|${number ?? ""}` });
  });

  // The grading table gives weights; the schedule gives dates. Same key → one item.
  const merged = new Map<string, Candidate>();
  for (const c of candidates) {
    const e = merged.get(c.key);
    if (!e) {
      merged.set(c.key, { ...c });
      continue;
    }
    e.date ??= c.date;
    e.week ??= c.week;
    e.weekday ??= c.weekday;
    e.time ??= c.time;
    e.weight ??= c.weight;
    e.tba = e.tba && !e.date && !c.date;
  }

  return [...merged.values()]
    .map(({ key: _key, ...rest }) => rest)
    .sort((a, b) => (a.date ?? "9999") < (b.date ?? "9999") ? -1 : (a.date ?? "9999") > (b.date ?? "9999") ? 1 : (b.weight ?? 0) - (a.weight ?? 0));
}

/* ----------------------------------------------------------------- output */

/** Calendar date for review: the explicit date, else the week number resolved against the term start. */
export function resolveAssessmentDate(a: ParsedAssessment, termStart: ISODate | null): ISODate | null {
  if (a.date) return a.date;
  if (a.week && termStart) return weekToDate(termStart, a.week, a.weekday);
  return null;
}

export function parseOutline(raw: string, { today }: ParseOptions): ParsedOutline {
  const lines = normalizeLines(raw);
  const course = findCourseInfo(lines);
  const { termStart, termEnd } = findTermDates(lines, today);
  const meetings = findMeetings(lines, course.code);
  const assessments = findAssessments(lines, termStart ?? today);

  const warnings: string[] = [];
  if (meetings.length === 0) warnings.push("No weekly class times were found. You can add them to the course afterwards.");
  if (assessments.length === 0) warnings.push("No graded work with a date or weight was found.");
  const byWeek = assessments.filter((a) => !a.date && a.week);
  if (byWeek.length && !termStart) {
    warnings.push(`${byWeek.length} ${byWeek.length === 1 ? "item is" : "items are"} given by week number. Enter the term start date to place ${byWeek.length === 1 ? "it" : "them"} on the calendar.`);
  }
  const tba = assessments.filter((a) => a.tba && !a.date);
  if (tba.length) warnings.push(`${tba.length} ${tba.length === 1 ? "item is" : "items are"} marked TBA and left unticked until you pick a date.`);
  const total = assessments.reduce((sum, a) => sum + (a.weight ?? 0), 0);
  if (total > 0 && Math.abs(total - 100) > 0.01) warnings.push(`The weights found add up to ${Math.round(total * 100) / 100}%, not 100%. Check the grading section.`);

  return { course, termStart, termEnd, meetings, assessments, warnings };
}
