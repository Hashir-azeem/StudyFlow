import { addDays, diffInDays, isISODate, startOfWeek } from "../dates";
import type { ISODate, TimeOfDay, Weekday } from "../types";

/**
 * Recognisers for the fragments course outlines are made of. Each works on a
 * single normalised line and reports where it matched, so callers can cut
 * titles around dates and weights.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Split into trimmed, non-empty lines with unified dashes, spaces, and am/pm. */
export function normalizeLines(raw: string): string[] {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u2007\u202f\t]/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\b([ap])\.\s?m\.?(?=\s|$|[),;])/gi, (_, ap: string) => `${ap.toLowerCase()}m`)
    .split("\n")
    .map((l) => l.replace(/ {2,}/g, " ").trim())
    .filter((l) => l.length > 0);
}

/* -------------------------------------------------------------------- days */

const DAY_WORD = /\b(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)s?\b\.?/gi;
const DAY_INDEX: Record<string, Weekday> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };

/** Compact registrar notation: MWF, TTh, TR, MW, TuTh. Case-sensitive on purpose. */
const COMPACT = /\b(?:Th|Tu|Sa|Su|M|T|W|R|F|S|U)+\b/g;
const COMPACT_PART = /Th|Tu|Sa|Su|M|T|W|R|F|S|U/g;
const COMPACT_INDEX: Record<string, Weekday> = { M: 1, T: 2, Tu: 2, W: 3, R: 4, Th: 4, F: 5, S: 6, Sa: 6, U: 0, Su: 0 };

export function findDays(line: string): Weekday[] {
  const days = new Set<Weekday>();
  for (const m of line.matchAll(DAY_WORD)) days.add(DAY_INDEX[m[1]!.slice(0, 3).toLowerCase()]!);
  for (const m of line.matchAll(COMPACT)) {
    const parts = (m[0].match(COMPACT_PART) ?? []).map((part) => COMPACT_INDEX[part]!);
    // A real day pattern never repeats a day; "TUT" (tutorial) would read as Tue/Sun/Tue.
    if (new Set(parts).size !== parts.length) continue;
    parts.forEach((d) => days.add(d));
  }
  return [...days].sort((a, b) => a - b);
}

/* ------------------------------------------------------------------- times */

export interface TimeRangeMatch {
  start: TimeOfDay;
  end: TimeOfDay;
  index: number;
  length: number;
}

const RANGE = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|to|until|till)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?(?![\d:])/i;

const to24 = (h: number, ap: string) => (h % 12) + (ap.toLowerCase() === "pm" ? 12 : 0);
/** Bare hours in a timetable: 1–7 are afternoon classes, 8–12 are as written. */
const classHour = (h: number) => (h >= 1 && h <= 7 ? h + 12 : h);

export function findTimeRange(line: string): TimeRangeMatch | null {
  const m = RANGE.exec(line);
  if (!m) return null;
  const [h1, m1, h2, m2] = [Number(m[1]), Number(m[2] ?? 0), Number(m[4]), Number(m[5] ?? 0)];
  const ap1 = m[3]?.toLowerCase();
  const ap2 = m[6]?.toLowerCase();
  // "Oct 10-14" and "Weeks 5-6" have neither minutes nor am/pm: not times.
  if (m[2] === undefined && m[5] === undefined && !ap1 && !ap2) return null;
  if (m1 > 59 || m2 > 59 || h1 > 23 || h2 > 23) return null;
  if ((ap1 && (h1 < 1 || h1 > 12)) || (ap2 && (h2 < 1 || h2 > 12))) return null;

  let s: number;
  let e: number;
  if (ap1 || ap2) {
    e = ap2 ? to24(h2, ap2) : h2 > 12 ? h2 : to24(h2, ap1!);
    if (ap1) s = to24(h1, ap1);
    else if (h1 > 12) s = h1;
    else {
      // "11-12:20pm": 11 shares pm only if that still starts before the end.
      const same = to24(h1, ap2!);
      s = same * 60 + m1 < e * 60 + m2 ? same : to24(h1, ap2 === "pm" ? "am" : "pm");
    }
    if (!ap2 && h2 <= 12 && e * 60 + m2 <= s * 60 + m1) e += 12;
  } else if (h1 <= 12 && h2 <= 12) {
    s = classHour(h1);
    e = classHour(h2);
    if (e * 60 + m2 <= s * 60 + m1 && e + 12 < 24) e += 12;
  } else {
    s = h1;
    e = h2;
  }
  const startMin = s * 60 + m1;
  const endMin = e * 60 + m2;
  if (e > 23 || endMin <= startMin || endMin - startMin > 6 * 60) return null;
  return { start: `${pad(s)}:${pad(m1)}`, end: `${pad(e)}:${pad(m2)}`, index: m.index, length: m[0].length };
}

const SINGLE_TIME = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b|\b(noon|midnight)\b|\b([01]?\d|2[0-3]):([0-5]\d)\b/i;

/** A single clock time, e.g. a due time: "11:59 pm", "noon", "23:59". */
export function findTime(line: string): { time: TimeOfDay; index: number } | null {
  const range = findTimeRange(line);
  if (range) return { time: range.start, index: range.index };
  const m = SINGLE_TIME.exec(line);
  if (!m) return null;
  if (m[4]) return { time: m[4].toLowerCase() === "noon" ? "12:00" : "23:59", index: m.index };
  if (m[3]) {
    const h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    if (h < 1 || h > 12 || min > 59) return null;
    return { time: `${pad(to24(h, m[3]))}:${pad(min)}`, index: m.index };
  }
  return { time: `${pad(Number(m[5]))}:${m[6]}`, index: m.index };
}

/* ------------------------------------------------------------------- dates */

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
const MONTH_FIRST = new RegExp(`\\b(${MONTHS})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, "i");
const DAY_FIRST = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})[a-z]*\\.?(?:,?\\s+(\\d{4}))?\\b`, "i");
const ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const SLASH = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/;
const WEEK = /\bweek\s*#?\s*(\d{1,2})\b/i;
const TBA = /\b(tba|tbd|to be (?:announced|determined|confirmed)|(?:final )?exam(?:ination)? period)\b/i;
const MONTH_INDEX = MONTHS.split("|");

/**
 * Year for a month/day with no year given. Anchored to the term (or today):
 * dates more than four months before the anchor belong to the next year, which
 * is how a January exam in a winter outline read in December resolves.
 */
export function inferYear(month: number, day: number, anchor: ISODate): ISODate | null {
  const year = Number(anchor.slice(0, 4));
  for (const y of [year, year + 1, year - 1]) {
    const iso = `${y}-${pad(month)}-${pad(day)}`;
    if (!isISODate(iso)) continue;
    const delta = diffInDays(anchor, iso);
    if (delta >= -120 && delta <= 300) return iso;
  }
  const fallback = `${year}-${pad(month)}-${pad(day)}`;
  return isISODate(fallback) ? fallback : null;
}

export interface DateMatch {
  date: ISODate | null;
  week: number | null;
  tba: boolean;
  /** Index of the earliest date-like fragment, for trimming titles. */
  index: number;
}

export function findDate(line: string, anchor: ISODate): DateMatch | null {
  const hits: Array<{ index: number; date: ISODate | null }> = [];
  const iso = ISO.exec(line);
  if (iso && isISODate(iso[0])) hits.push({ index: iso.index, date: iso[0] });
  const mf = MONTH_FIRST.exec(line);
  if (mf) {
    const month = MONTH_INDEX.indexOf(mf[1]!.slice(0, 3).toLowerCase()) + 1;
    const date = mf[3] ? `${mf[3]}-${pad(month)}-${pad(Number(mf[2]))}` : inferYear(month, Number(mf[2]), anchor);
    if (date && isISODate(date)) hits.push({ index: mf.index, date });
  }
  const df = DAY_FIRST.exec(line);
  // "Assignment 2 Nov 7": both patterns share "Nov"; month-first is the real date.
  const dfMonthAt = df ? df.index + df[0].toLowerCase().indexOf(df[2]!.toLowerCase()) : -1;
  if (df && !(mf && mf.index === dfMonthAt)) {
    const month = MONTH_INDEX.indexOf(df[2]!.slice(0, 3).toLowerCase()) + 1;
    const date = df[3] ? `${df[3]}-${pad(month)}-${pad(Number(df[1]))}` : inferYear(month, Number(df[1]), anchor);
    if (date && isISODate(date)) hits.push({ index: df.index, date });
  }
  const sl = SLASH.exec(line);
  if (sl) {
    let [a, b] = [Number(sl[1]), Number(sl[2])];
    if (a > 12 && b <= 12) [a, b] = [b, a]; // 14/10 → Oct 14
    const y = sl[3] ? (sl[3].length === 2 ? 2000 + Number(sl[3]) : Number(sl[3])) : null;
    const date = y ? `${y}-${pad(a)}-${pad(b)}` : inferYear(a, b, anchor);
    if (date && isISODate(date)) hits.push({ index: sl.index, date });
  }
  const wk = WEEK.exec(line);
  const tba = TBA.exec(line);
  if (hits.length === 0 && !wk && !tba) return null;
  hits.sort((x, y) => x.index - y.index);
  const indexes = [hits[0]?.index, wk?.index, tba?.index].filter((i): i is number => i !== undefined);
  return {
    date: hits[0]?.date ?? null,
    week: wk ? Number(wk[1]) : null,
    tba: Boolean(tba) && hits.length === 0,
    index: Math.min(...indexes),
  };
}

/** Week N of a term: N-1 weeks after the term's first week, on `weekday` if given, else the term's start weekday. */
export function weekToDate(termStart: ISODate, week: number, weekday: Weekday | null): ISODate {
  if (weekday === null) return addDays(termStart, 7 * (week - 1));
  const monday = startOfWeek(termStart, 1);
  return addDays(monday, 7 * (week - 1) + ((weekday + 6) % 7));
}

/* ----------------------------------------------------------------- weights */

const PERCENT = /(\d{1,3}(?:\.\d+)?)\s*%/g;
const COUNT_EACH = /\b(\d{1,2})\s*(?:x|×|@|\*)\s*(\d{1,3}(?:\.\d+)?)\s*%/i;

export function findWeight(line: string): { weight: number; index: number } | null {
  for (const m of line.matchAll(PERCENT)) {
    const w = Number(m[1]);
    if (w > 0 && w <= 100) return { weight: w, index: m.index };
  }
  return null;
}

/** "10 x 1%" → ten items worth 1% each. */
export function findCountEach(line: string): { count: number; each: number; index: number } | null {
  const m = COUNT_EACH.exec(line);
  if (!m) return null;
  const count = Number(m[1]);
  const each = Number(m[2]);
  return count >= 2 && count <= 15 && each > 0 && count * each <= 100 ? { count, each, index: m.index } : null;
}

export const isOnlyWeight = (line: string) => /^\(?\s*\d{1,3}(?:\.\d+)?\s*%\s*\)?$/.test(line);

/* --------------------------------------------------------------- locations */

// Label is case-insensitive, the room code itself must be uppercase (so "room for 30" isn't a room).
const LABELED_ROOM = /\b(?:[Rr]oom|ROOM|[Rr]m\.?|RM|[Ll]ocation|LOCATION|[Ll]oc\.|[Bb]ldg\.?|[Bb]uilding|[Cc]lassroom)\s*[:#-]?\s*([A-Z]{1,5}[- ]?[A-Z]?\d{1,4}[A-Z]?)\b/;
const IN_ROOM = /\bin\s+([A-Z]{2,5}[- ]?[A-Z]?\d{2,4}[A-Z]?)\b/;
const BARE_ROOM = /\b([A-Z]{2,5})[- ]?([A-Z]?\d{2,4}[A-Z]?)\b/g;
const ONLINE = /\b(online|zoom|virtual|remote|d2l|brightspace)\b/i;

export function findLocation(line: string, courseCode: string | null): string | null {
  const labeled = LABELED_ROOM.exec(line) ?? IN_ROOM.exec(line);
  if (labeled) return labeled[1]!.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  const codeKey = courseCode?.replace(/\s+/g, "").toUpperCase();
  for (const m of line.matchAll(BARE_ROOM)) {
    const token = `${m[1]} ${m[2]}`;
    if (token.replace(/\s+/g, "") === codeKey) continue;
    if (/^(AM|PM|WEEK)$/i.test(m[1]!)) continue;
    // "MWF 09:10": day letters followed by a clock time, not a building and room.
    if (/^(?:Th|Tu|Sa|Su|M|T|W|R|F|S|U)+$/.test(m[1]!) || line[m.index + m[0].length] === ":") continue;
    return token;
  }
  const online = ONLINE.exec(line);
  return online ? online[1]![0]!.toUpperCase() + online[1]!.slice(1).toLowerCase() : null;
}
