import { weekdayOf } from "../dates";
import { newId } from "../validation";
import type { ISODate, SessionKind, Weekday } from "../types";
import { meetingRRule, normalizeDays, weekdayToCode } from "./recurrence";
import type { OutlineLine } from "./sections";
import { findDate, findDays, findLocation, findTimeRange } from "./text";
import type { RecurringMeeting } from "./types";

const NOT_MEETING =
  /\b(office\s*hours?|student\s+hours|consultation|drop-?in|OH|exams?|midterms?|quiz(?:zes)?|tests?|deadlines?|due|submit\w*|drop|withdraw\w*|holiday|reading week|no class(?:es)?|closed|cancel+ed)\b/i;

function sessionKind(line: string): SessionKind | null {
  if (/\b(?:lab(?:oratory|oratories)?s?|LAB)\b/i.test(line)) return "lab";
  if (/\b(?:tut(?:orial)?s?|TUT)\b/i.test(line)) return "tutorial";
  if (/\b(?:seminars?|SEM)\b/i.test(line)) return "seminar";
  if (/\b(?:lec(?:ture)?s?|LEC|class(?:es)?)\b/i.test(line)) return "lecture";
  return null;
}

interface Session {
  days: Weekday[];
  start: string;
  end: string;
  kind: SessionKind;
  location: string | null;
  /** Set when the day came from a calendar date rather than a weekday name. */
  date: ISODate | null;
  source: string;
}

function collectSessions(lines: OutlineLine[], courseCode: string | null, anchor: ISODate): Session[] {
  const sessions: Session[] = [];
  lines.forEach((line, i) => {
    // Office hours, textbook lists, and policy text are never class meetings.
    if (line.heading || line.block || line.section === "policy" || line.section === "materials") return;
    if (NOT_MEETING.test(line.text)) return;
    const range = findTimeRange(line.text);
    if (!range) return;

    const prev = lines[i - 1];
    const prevIsLabel =
      !!prev && !prev.heading && !prev.block && prev.text.length <= 40 && !findTimeRange(prev.text) && !NOT_MEETING.test(prev.text);
    let days = findDays(line.text);
    if (days.length === 0 && prevIsLabel) days = findDays(prev.text);

    // "Jan 13  Lecture 1: Intro  10:00-11:20": a dated session in a schedule table.
    let date: ISODate | null = null;
    if (days.length === 0) {
      date = findDate(line.text, anchor)?.date ?? null;
      if (!date) return;
      days = [weekdayOf(date)];
    }

    const next = lines[i + 1];
    sessions.push({
      days,
      start: range.start,
      end: range.end,
      kind: sessionKind(line.text) ?? (prevIsLabel ? sessionKind(prev.text) : null) ?? "lecture",
      location:
        findLocation(line.text, courseCode) ??
        (next && /^(?:room|location|rm)\b/i.test(next.text) ? findLocation(next.text, courseCode) : null),
      date,
      source: line.text,
    });
  });
  return sessions;
}

/**
 * Fold sessions into weekly rules. Same type + same times = one pattern; the
 * days are unioned, so "Tuesday…" and "Thursday…" on separate lines, or a
 * dated schedule with Jan 13 / Jan 15 / Jan 20, become TU,TH. Different rooms
 * stay separate (a Tuesday room and a Thursday room are two meetings); a
 * session with no room joins the pattern it belongs to.
 */
export function findMeetings(
  lines: OutlineLine[],
  courseCode: string | null,
  anchor: ISODate,
  termEnd: ISODate | null,
): RecurringMeeting[] {
  const groups = new Map<string, Session[]>();
  for (const s of collectSessions(lines, courseCode, anchor)) {
    const key = `${s.kind}|${s.start}|${s.end}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  const meetings: RecurringMeeting[] = [];
  for (const sessions of groups.values()) {
    const byRoom = new Map<string, Session[]>();
    const roomless: Session[] = [];
    for (const s of sessions) {
      if (s.location) byRoom.set(s.location, [...(byRoom.get(s.location) ?? []), s]);
      else roomless.push(s);
    }
    const clusters = [...byRoom.values()];
    if (clusters.length === 0) clusters.push(roomless);
    else if (roomless.length) {
      // Unassigned sessions join the biggest room cluster.
      clusters.sort((a, b) => b.length - a.length)[0]!.push(...roomless);
    }

    for (const cluster of clusters) {
      const stated = cluster.filter((s) => s.date === null);
      const dated = cluster.filter((s) => s.date !== null);
      // A stated pattern ("Tues/Thurs") wins; dated rows then only give the date
      // range. Without one, the dated rows' weekdays are the pattern.
      const days = normalizeDays((stated.length ? stated : dated).flatMap((s) => s.days.map(weekdayToCode)));
      const dates = [...new Set(dated.map((s) => s.date!))].sort();
      const first = stated[0] ?? cluster[0]!;
      const startDate = dates[0] ?? null;
      const endDate = dates.length > 1 ? dates[dates.length - 1]! : null;
      const oneOff = stated.length === 0 && dates.length === 1;
      meetings.push({
        id: newId(),
        daysOfWeek: days,
        startTime: first.start,
        endTime: first.end,
        kind: first.kind,
        location: cluster.find((s) => s.location)?.location ?? null,
        startDate,
        endDate,
        rrule: meetingRRule({ daysOfWeek: days, startDate, endDate, oneOff }, termEnd),
        oneOff,
        source: first.source,
      });
    }
  }
  return meetings;
}
