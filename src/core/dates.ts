import type { ISODate, TimeFormat, TimeOfDay, Weekday } from "./types";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MS_PER_DAY = 86_400_000;

const pad = (n: number): string => String(n).padStart(2, "0");

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string") return false;
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

export function isTimeOfDay(value: unknown): value is TimeOfDay {
  return typeof value === "string" && TIME_RE.test(value);
}

/** Local calendar date of a Date object. */
export function toISODate(date: Date): ISODate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight. Throws on malformed input so bad data fails loudly at the boundary. */
export function fromISODate(iso: ISODate): Date {
  if (!isISODate(iso)) throw new RangeError(`Invalid ISO date: ${String(iso)}`);
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

/** Calendar arithmetic that ignores DST: adding 1 day always moves one date forward. */
export function addDays(iso: ISODate, days: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function addMonths(iso: ISODate, months: number): ISODate {
  const d = fromISODate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toISODate(d);
}

/** Whole calendar days from `a` to `b` (positive when b is later). DST-safe. */
export function diffInDays(a: ISODate, b: ISODate): number {
  const [ay, am, ad] = a.split("-").map(Number) as [number, number, number];
  const [by, bm, bd] = b.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / MS_PER_DAY);
}

export function weekdayOf(iso: ISODate): Weekday {
  return fromISODate(iso).getDay() as Weekday;
}

export function startOfWeek(iso: ISODate, weekStartsOn: 0 | 1): ISODate {
  const offset = (weekdayOf(iso) - weekStartsOn + 7) % 7;
  return addDays(iso, -offset);
}

export function startOfMonth(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`;
}

export function isSameMonth(a: ISODate, b: ISODate): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function rangeOfDays(start: ISODate, count: number): ISODate[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** Always 6 rows × 7 columns so the month grid never jumps in height. */
export function monthGrid(anyDayInMonth: ISODate, weekStartsOn: 0 | 1): ISODate[] {
  return rangeOfDays(startOfWeek(startOfMonth(anyDayInMonth), weekStartsOn), 42);
}

export function timeToMinutes(t: TimeOfDay): number {
  const [h, m] = t.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

export function compareDateTime(
  a: { date: ISODate; time: TimeOfDay | null },
  b: { date: ISODate; time: TimeOfDay | null },
): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  // Untimed items sort to the end of their day.
  const at = a.time === null ? Number.POSITIVE_INFINITY : timeToMinutes(a.time);
  const bt = b.time === null ? Number.POSITIVE_INFINITY : timeToMinutes(b.time);
  return at === bt ? 0 : at < bt ? -1 : 1;
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export function weekdayShort(day: Weekday): string {
  return WEEKDAY_SHORT[day];
}

/** "Tue, Oct 14" */
export function formatDate(iso: ISODate): string {
  const d = fromISODate(iso);
  return `${WEEKDAY_SHORT[d.getDay()]}, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** "October 2026" */
export function formatMonth(iso: ISODate): string {
  return fromISODate(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** "3:30 PM" or "15:30". "auto" follows the device locale. */
export function formatTime(t: TimeOfDay, format: TimeFormat = "auto"): string {
  const [h, m] = t.split(":").map(Number) as [number, number];
  if (format === "24h") return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  if (format === "12h") {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  }
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Today", "Tomorrow", "In 3 days", "2 days ago" */
export function formatRelative(target: ISODate, today: ISODate): string {
  const n = diffInDays(today, target);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}
