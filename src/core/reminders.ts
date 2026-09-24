import { KIND_LABEL, MAJOR_KINDS, trackAll, type TrackedAssessment } from "./assessments";
import { addDays, formatTime, timeToMinutes } from "./dates";
import type { Assessment, Course, ISODate, TimeFormat, TimeOfDay } from "./types";

/**
 * Reminder rules, evaluated against the current wall-clock time:
 *   day-before   Exams, midterms, and high-priority work, from 18:00 the day before.
 *   morning      Everything open and due today, from 08:00.
 *   hour-before  Timed deadlines, in the final 60 minutes.
 * Each rule fires once per assessment per due date (keys include the date,
 * so rescheduling an item re-arms its reminders). If an item has several
 * rules pending at once, only the most urgent is shown.
 */
export type ReminderRule = "day-before" | "morning" | "hour-before";

export const EVENING_REMINDER: TimeOfDay = "18:00";
export const MORNING_REMINDER: TimeOfDay = "08:00";
/** Above this many morning reminders, send one summary instead of a pile of notifications. */
const SUMMARY_THRESHOLD = 3;

export interface Reminder {
  /** Keys to mark as sent once this notification goes out. */
  keys: string[];
  title: string;
  body: string;
}

export function reminderKey(a: Assessment, rule: ReminderRule): string {
  return `${a.id}:${rule}:${a.dueDate}`;
}

const RULE_RANK: Record<ReminderRule, number> = { "hour-before": 0, morning: 1, "day-before": 2 };

function pendingRules(t: TrackedAssessment, today: ISODate, now: number): ReminderRule[] {
  const a = t.assessment;
  const rules: ReminderRule[] = [];
  const important = MAJOR_KINDS.has(a.kind) || a.priority === "high";
  if (important && a.dueDate === addDays(today, 1) && now >= timeToMinutes(EVENING_REMINDER)) {
    rules.push("day-before");
  }
  if (a.dueDate === today) {
    const due = a.dueTime ? timeToMinutes(a.dueTime) : Number.POSITIVE_INFINITY;
    if (now >= due) return []; // already past: the Today view shows it as overdue
    if (now >= timeToMinutes(MORNING_REMINDER)) rules.push("morning");
    if (a.dueTime && now >= due - 60) rules.push("hour-before");
  }
  return rules;
}

function describeItem(t: TrackedAssessment, format: TimeFormat): string {
  const a = t.assessment;
  const when = a.dueTime ? ` at ${formatTime(a.dueTime, format)}` : "";
  const weight = a.weight !== null ? ` (${a.weight}%)` : "";
  return `${t.course.code}: ${a.title}${weight}${when}`;
}

export function dueReminders(
  assessments: Assessment[],
  courses: Course[],
  today: ISODate,
  now: TimeOfDay,
  sent: ReadonlySet<string>,
  format: TimeFormat = "auto",
): Reminder[] {
  const describe = (t: TrackedAssessment) => describeItem(t, format);
  const nowMin = timeToMinutes(now);
  const reminders: Reminder[] = [];
  const morning: Array<{ t: TrackedAssessment; keys: string[] }> = [];

  for (const t of trackAll(assessments, courses, today)) {
    const rules = pendingRules(t, today, nowMin).filter((r) => !sent.has(reminderKey(t.assessment, r)));
    if (rules.length === 0) continue;
    rules.sort((x, y) => RULE_RANK[x] - RULE_RANK[y]);
    const top = rules[0]!;
    // Mark every pending rule (and any earlier, less urgent ones) as handled together.
    const keys = rules.map((r) => reminderKey(t.assessment, r));
    if (top === "hour-before") keys.push(reminderKey(t.assessment, "morning"));

    if (top === "morning") {
      morning.push({ t, keys });
    } else if (top === "hour-before") {
      reminders.push({ keys, title: `Due within the hour: ${t.assessment.title}`, body: describe(t) });
    } else {
      reminders.push({
        keys,
        title: `${KIND_LABEL[t.assessment.kind]} tomorrow: ${t.assessment.title}`,
        body: describe(t),
      });
    }
  }

  if (morning.length > SUMMARY_THRESHOLD) {
    reminders.push({
      keys: morning.flatMap((m) => m.keys),
      title: `${morning.length} things due today`,
      body: morning.map((m) => describe(m.t)).join("\n"),
    });
  } else {
    for (const m of morning) {
      reminders.push({ keys: m.keys, title: `Due today: ${m.t.assessment.title}`, body: describe(m.t) });
    }
  }
  return reminders;
}

/** Drop sent-keys for dates already in the past so the stored set stays small. */
export function pruneSentKeys(sent: Iterable<string>, today: ISODate): string[] {
  return [...sent].filter((k) => (k.split(":").pop() ?? "") >= today);
}
