import { KIND_LABEL } from "./assessments";
import { addDays, isISODate, weekdayOf } from "./dates";
import { KIND_DEFAULTS } from "./templates";
import { normalizeCode } from "./validation";
import type {
  AssessmentDraft,
  AssessmentKind,
  Course,
  ISODate,
  Priority,
  TimeOfDay,
  Weekday,
} from "./types";

/**
 * Quick-add grammar (order-independent, case-insensitive):
 *   kind      exam | final | midterm | mid | quiz | project | proj | assignment | hw | task | todo
 *   course    any active course code: "cs101", "CS 101", "#cs101"
 *   date      today | tomorrow | tmr | fri | next fri | in 3 days | in 2 weeks
 *             | oct 14 | 14 oct | oct 14 2027 | 10/14 | 10/14/2027 | 2026-10-14
 *   time      3pm | 3:30pm | 3 pm | 15:30 | noon | midnight   (optionally "at" / "@")
 *   weight    20%
 *   priority  !!! | !high | p1 | urgent → high;  !! | !med | p2 → medium;  ! | !low | p3 → low
 *   filler    due | on | by   (dropped when followed by a date or time)
 * Anything else becomes the title. "fri" means the next Friday 1–7 days out;
 * "next fri" adds a week. Month-day dates already past roll to next year.
 */
export interface QuickAddParse {
  kind: AssessmentKind | null;
  course: Course | null;
  dueDate: ISODate | null;
  dueTime: TimeOfDay | null;
  weight: number | null;
  priority: Priority | null;
  title: string;
}

const KIND_WORDS: Record<string, AssessmentKind> = {
  exam: "exam", exams: "exam", final: "exam", finals: "exam",
  midterm: "midterm", midterms: "midterm", mid: "midterm",
  quiz: "quiz", quizzes: "quiz",
  project: "project", proj: "project",
  assignment: "assignment", assign: "assignment", hw: "assignment", homework: "assignment",
  task: "task", todo: "task",
};

const WEEKDAYS: Record<string, Weekday> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

const PRIORITY_WORDS: Record<string, Priority> = {
  "!!!": "high", "!high": "high", "!h": "high", p1: "high", urgent: "high",
  "!!": "medium", "!med": "medium", "!medium": "medium", "!m": "medium", p2: "medium",
  "!": "low", "!low": "low", "!l": "low", p3: "low",
};

const FILLERS = new Set(["due", "on", "by", "at"]);

interface Match<T> {
  value: T;
  consumed: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

function buildDate(year: number, month: number, day: number): ISODate | null {
  const iso = `${year}-${pad(month)}-${pad(day)}`;
  return isISODate(iso) ? iso : null;
}

function stripOrdinal(s: string): string {
  return s.replace(/(\d+)(st|nd|rd|th)$/, "$1");
}

/** Month/day without a year: this year, or next year if it's already past. */
function resolveYearless(month: number, day: number, today: ISODate): ISODate | null {
  const year = Number(today.slice(0, 4));
  const thisYear = buildDate(year, month, day);
  if (thisYear && thisYear >= today) return thisYear;
  return buildDate(year + 1, month, day);
}

function matchDate(tokens: string[], i: number, today: ISODate): Match<ISODate> | null {
  const t = tokens[i]!;
  const next = tokens[i + 1];
  const next2 = tokens[i + 2];

  if (t === "today" || t === "tod" || t === "tonight") return { value: today, consumed: 1 };
  if (t === "tomorrow" || t === "tmr" || t === "tmrw" || t === "tom") {
    return { value: addDays(today, 1), consumed: 1 };
  }

  const nextWeekday = (wd: Weekday) => {
    const delta = ((wd - weekdayOf(today) + 7) % 7) || 7;
    return addDays(today, delta);
  };
  if (t in WEEKDAYS) return { value: nextWeekday(WEEKDAYS[t]!), consumed: 1 };
  if (t === "next" && next && next in WEEKDAYS) {
    return { value: addDays(nextWeekday(WEEKDAYS[next]!), 7), consumed: 2 };
  }
  if (t === "next" && next === "week") return { value: addDays(today, 7), consumed: 2 };

  if (t === "in" && next) {
    const n = next === "a" || next === "an" ? 1 : Number(next);
    if (Number.isInteger(n) && n > 0 && n < 1000 && next2) {
      if (/^days?$/.test(next2)) return { value: addDays(today, n), consumed: 3 };
      if (/^weeks?$/.test(next2)) return { value: addDays(today, n * 7), consumed: 3 };
    }
  }

  // 2026-10-14
  if (/^\d{4}-\d{2}-\d{2}$/.test(t) && isISODate(t)) return { value: t, consumed: 1 };

  // 10/14 or 10/14/2026 or 10/14/26  (month first)
  const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(t);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    if (slash[3]) {
      const y = slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3]);
      const v = buildDate(y, month, day);
      return v ? { value: v, consumed: 1 } : null;
    }
    const v = resolveYearless(month, day, today);
    return v ? { value: v, consumed: 1 } : null;
  }

  const yearAt = (idx: number): number | null => {
    const tok = tokens[idx];
    return tok && /^\d{4}$/.test(tok) ? Number(tok) : null;
  };

  // oct 14 [2027]
  if (t in MONTHS && next && /^\d{1,2}(st|nd|rd|th)?$/.test(next)) {
    const day = Number(stripOrdinal(next));
    const year = yearAt(i + 2);
    const v = year ? buildDate(year, MONTHS[t]!, day) : resolveYearless(MONTHS[t]!, day, today);
    return v ? { value: v, consumed: year ? 3 : 2 } : null;
  }
  // 14 oct [2027]
  if (/^\d{1,2}(st|nd|rd|th)?$/.test(t) && next && next in MONTHS) {
    const day = Number(stripOrdinal(t));
    const year = yearAt(i + 2);
    const v = year ? buildDate(year, MONTHS[next]!, day) : resolveYearless(MONTHS[next]!, day, today);
    return v ? { value: v, consumed: year ? 3 : 2 } : null;
  }
  return null;
}

function matchTime(tokens: string[], i: number): Match<TimeOfDay> | null {
  let t = tokens[i]!;
  let consumed = 1;
  if (t.startsWith("@")) t = t.slice(1);
  if (t === "noon") return { value: "12:00", consumed };
  // A deadline "at midnight" means the end of that day, not its start.
  if (t === "midnight") return { value: "23:59", consumed };

  const next = tokens[i + 1];
  if (/^\d{1,2}(:\d{2})?$/.test(t) && (next === "am" || next === "pm")) {
    t += next;
    consumed = 2;
  }
  const ampm = /^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)$/.exec(t);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2] ?? 0);
    if (h < 1 || h > 12 || m > 59) return null;
    const pm = ampm[3]!.startsWith("p");
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
    return { value: `${pad(h)}:${pad(m)}`, consumed };
  }
  const h24 = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t);
  if (h24) return { value: `${pad(Number(h24[1]))}:${h24[2]}`, consumed };
  return null;
}

function matchCourse(tokens: string[], i: number, courses: Course[]): Match<Course> | null {
  const active = courses.filter((c) => !c.archived);
  const byCode = new Map(active.map((c) => [normalizeCode(c.code), c]));
  const first = tokens[i]!.replace(/^#/, "");
  const two = tokens[i + 1] ? normalizeCode(first + tokens[i + 1]) : null;
  if (two && byCode.has(two)) return { value: byCode.get(two)!, consumed: 2 };
  const one = normalizeCode(first);
  if (one && byCode.has(one)) return { value: byCode.get(one)!, consumed: 1 };
  return null;
}

export function parseQuickAdd(input: string, courses: Course[], today: ISODate): QuickAddParse {
  const original = input.trim().split(/\s+/).filter(Boolean);
  const tokens = original.map((t) => t.toLowerCase().replace(/[,.;]+$/, ""));
  const result: QuickAddParse = {
    kind: null,
    course: null,
    dueDate: null,
    dueTime: null,
    weight: null,
    priority: null,
    title: "",
  };
  const titleWords: string[] = [];

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;

    if (FILLERS.has(t) && i + 1 < tokens.length) {
      const date = result.dueDate ? null : matchDate(tokens, i + 1, today);
      const time = result.dueTime ? null : matchTime(tokens, i + 1);
      if (date) {
        result.dueDate = date.value;
        i += 1 + date.consumed;
        continue;
      }
      if (time) {
        result.dueTime = time.value;
        i += 1 + time.consumed;
        continue;
      }
    }

    if (!result.weight) {
      const w = /^(\d{1,3}(?:\.\d+)?)%$/.exec(t);
      if (w && Number(w[1]) <= 100) {
        result.weight = Number(w[1]);
        i++;
        continue;
      }
    }

    if (!result.priority && t in PRIORITY_WORDS) {
      result.priority = PRIORITY_WORDS[t]!;
      i++;
      continue;
    }

    if (!result.dueDate) {
      const date = matchDate(tokens, i, today);
      if (date) {
        result.dueDate = date.value;
        i += date.consumed;
        continue;
      }
    }

    if (!result.dueTime) {
      const time = matchTime(tokens, i);
      if (time) {
        result.dueTime = time.value;
        i += time.consumed;
        continue;
      }
    }

    if (!result.course) {
      const course = matchCourse(tokens, i, courses);
      if (course) {
        result.course = course.value;
        i += course.consumed;
        continue;
      }
    }

    if (!result.kind && t in KIND_WORDS) {
      // "final project" is a project, not an exam: let the more specific word win.
      const nextKind = tokens[i + 1] ? KIND_WORDS[tokens[i + 1]!] : undefined;
      if (t.startsWith("final") && nextKind) {
        titleWords.push(original[i]!);
        i++;
        continue;
      }
      result.kind = KIND_WORDS[t]!;
      // Keep the word in the title when other words follow ("Midterm review").
      titleWords.push(original[i]!);
      i++;
      continue;
    }

    titleWords.push(original[i]!);
    i++;
  }

  const joined = titleWords.join(" ").trim();
  const onlyKindWord = result.kind !== null && titleWords.length === 1;
  const title = onlyKindWord || !joined ? (result.kind ? KIND_LABEL[result.kind] : "") : joined;
  result.title = title.charAt(0).toUpperCase() + title.slice(1);
  return result;
}

/** Turn a parse into a draft; returns the missing pieces when it can't. */
export function quickAddToDraft(
  parse: QuickAddParse,
  today: ISODate,
): { ok: true; draft: AssessmentDraft } | { ok: false; missing: Array<"course" | "title"> } {
  const missing: Array<"course" | "title"> = [];
  if (!parse.course) missing.push("course");
  if (!parse.title) missing.push("title");
  if (missing.length) return { ok: false, missing };
  const kind = parse.kind ?? "task";
  return {
    ok: true,
    draft: {
      courseId: parse.course!.id,
      title: parse.title,
      kind,
      dueDate: parse.dueDate ?? today,
      dueTime: parse.dueTime,
      priority: parse.priority ?? KIND_DEFAULTS[kind].priority,
      // Only use a weight the user typed; silent defaults would skew grade totals.
      weight: parse.weight,
      status: "todo",
      grade: null,
      notes: "",
    },
  };
}
