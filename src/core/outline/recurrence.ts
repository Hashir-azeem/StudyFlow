import { diffInDays, isISODate, isTimeOfDay, timeToMinutes } from "../dates";
import type { ISODate, TimeOfDay, Weekday } from "../types";
import { DAY_CODES, type DayCode } from "./types";

/**
 * Day and recurrence normalisation. Every day string an outline (or any
 * extractor) might produce funnels through normalizeDayToken, so the rest of
 * the app only ever sees RFC 5545 codes MO…SU.
 */

const WEEKDAY_TO_CODE: Record<Weekday, DayCode> = { 0: "SU", 1: "MO", 2: "TU", 3: "WE", 4: "TH", 5: "FR", 6: "SA" };
const CODE_TO_WEEKDAY: Record<DayCode, Weekday> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export const weekdayToCode = (d: Weekday): DayCode => WEEKDAY_TO_CODE[d];
export const codeToWeekday = (c: DayCode): Weekday => CODE_TO_WEEKDAY[c];

const ALIASES: Record<string, DayCode> = {
  mo: "MO", mon: "MO", monday: "MO", m: "MO",
  tu: "TU", tue: "TU", tues: "TU", tuesday: "TU", t: "TU",
  we: "WE", wed: "WE", weds: "WE", wednesday: "WE", w: "WE",
  th: "TH", thu: "TH", thur: "TH", thurs: "TH", thursday: "TH", r: "TH",
  fr: "FR", fri: "FR", friday: "FR", f: "FR",
  sa: "SA", sat: "SA", saturday: "SA", s: "SA",
  su: "SU", sun: "SU", sunday: "SU", u: "SU",
};

/**
 * "Tues", "THURSDAY", "Th", "R", "we", 3, "3", "Mondays" → a DayCode.
 * Numbers use JavaScript's 0 = Sunday convention.
 */
export function normalizeDayToken(token: unknown): DayCode | null {
  if (typeof token === "number" || (typeof token === "string" && /^\s*[0-6]\s*$/.test(token))) {
    const n = Number(token);
    return Number.isInteger(n) && n >= 0 && n <= 6 ? WEEKDAY_TO_CODE[n as Weekday] : null;
  }
  if (typeof token !== "string") return null;
  const t = token.trim().replace(/\.$/, "").toLowerCase();
  if ((DAY_CODES as readonly string[]).includes(t.toUpperCase())) return t.toUpperCase() as DayCode;
  return ALIASES[t] ?? ALIASES[t.replace(/s$/, "")] ?? null;
}

/** Monday-first order, duplicates removed, invalid tokens dropped. */
export function normalizeDays(input: unknown): DayCode[] {
  const list = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[\s,/&+]+|\band\b/i) : [];
  const set = new Set<DayCode>();
  for (const t of list) {
    const code = normalizeDayToken(t);
    if (code) set.add(code);
  }
  return DAY_CODES.filter((c) => set.has(c));
}

/** Inclusive day range, wrapping past Sunday: FR→MO gives FR, SA, SU, MO. */
export function expandDayRange(from: DayCode, to: DayCode): DayCode[] {
  const a = DAY_CODES.indexOf(from);
  const b = DAY_CODES.indexOf(to);
  const out: DayCode[] = [];
  for (let i = a; ; i = (i + 1) % 7) {
    out.push(DAY_CODES[i]!);
    if (i === b || out.length === 7) break;
  }
  return out;
}

/** RFC 5545 weekly rule. UNTIL is end-of-day local ("floating") time. */
export function toRRule(days: DayCode[], until: ISODate | null): string {
  const byDay = normalizeDays(days).join(",");
  const untilPart = until && isISODate(until) ? `;UNTIL=${until.replace(/-/g, "")}T235959` : "";
  return `FREQ=WEEKLY;BYDAY=${byDay}${untilPart}`;
}

/** True when first→last dated session covers most of a term (8+ weeks). */
export function spansTerm(first: ISODate | null, last: ISODate | null): boolean {
  return !!first && !!last && diffInDays(first, last) >= 56;
}

/**
 * The one place a meeting's RRULE is decided.
 *  - One-off sessions occur once (COUNT=1).
 *  - Weekly classes repeat until the term end. A dated schedule that lists only
 *    the first few weeks must not end the class early, so the last dated row is
 *    trusted as the end only when it spans 8+ weeks.
 */
export function meetingRRule(
  m: { daysOfWeek: DayCode[]; startDate: ISODate | null; endDate: ISODate | null; oneOff: boolean },
  termEnd: ISODate | null,
): string {
  const days = normalizeDays(m.daysOfWeek);
  if (m.oneOff) return `FREQ=WEEKLY;COUNT=1;BYDAY=${days.join(",")}`;
  return toRRule(days, termEnd ?? (spansTerm(m.startDate, m.endDate) ? m.endDate : null));
}

/** "Every Tue & Thu" / "Every weekday" / "Every day". */
export function describeDays(days: DayCode[]): string {
  const d = normalizeDays(days);
  const label: Record<DayCode, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };
  if (d.length === 7) return "Every day";
  if (d.join() === "MO,TU,WE,TH,FR") return "Every weekday";
  if (d.join() === "SA,SU") return "Every weekend";
  const names = d.map((c) => label[c]);
  return names.length <= 1 ? `Every ${names[0] ?? "—"}` : `Every ${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export interface RecurrenceInput {
  daysOfWeek: DayCode[];
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  startDate: ISODate | null;
  endDate: ISODate | null;
}

/** Problems that would make a weekly rule unusable; empty when it's fine. */
export function validateRecurrence(r: RecurrenceInput): string[] {
  const problems: string[] = [];
  if (normalizeDays(r.daysOfWeek).length === 0) problems.push("Pick at least one day.");
  if (!isTimeOfDay(r.startTime) || !isTimeOfDay(r.endTime)) problems.push("Enter a start and end time.");
  else {
    const len = timeToMinutes(r.endTime) - timeToMinutes(r.startTime);
    if (len <= 0) problems.push("The class has to end after it starts.");
    else if (len > 6 * 60) problems.push("That's longer than 6 hours; check the times.");
  }
  if (r.startDate && !isISODate(r.startDate)) problems.push("The first date isn't valid.");
  if (r.endDate && !isISODate(r.endDate)) problems.push("The last date isn't valid.");
  if (r.startDate && r.endDate && r.endDate < r.startDate) problems.push("The last class is before the first.");
  return problems;
}
