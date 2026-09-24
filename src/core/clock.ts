import type { ISODate, ISODateTime } from "./types/ids";

export function nowIso(clock: () => Date = () => new Date()): ISODateTime {
  return clock().toISOString();
}

export function localDate(clock: () => Date = () => new Date()): ISODate {
  const d = clock();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  const yy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function weekdayOf(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function newId(): string {
  return crypto.randomUUID();
}
