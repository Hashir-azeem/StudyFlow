import { describe, expect, it } from "vitest";
import { dueToday, MAJOR_KINDS, overdue, upcoming, weightSummary } from "../src/core/assessments";
import { accentOverride, contrastRatio, deriveCourseColors, channelsToRgb, nextCourseColor, DEFAULT_COURSE_COLORS } from "../src/core/colors";
import { addDays, addMonths, diffInDays, formatTime, isISODate, monthGrid, startOfWeek } from "../src/core/dates";
import { buildSampleData } from "../src/core/sampleData";
import { parseQuickAdd, quickAddToDraft } from "../src/core/quickAdd";
import { dueReminders, pruneSentKeys, reminderKey } from "../src/core/reminders";
import { classesOn, classStatuses } from "../src/core/schedule";
import type { Assessment, Course } from "../src/core/types";
import { coerceSlot, validateAssessment, validateCourse } from "../src/core/validation";
import { migrateLegacyAssessment, migrateLegacyCourse, migrateLegacySettings } from "../src/storage/legacyMigration";
import { parseSnapshot } from "../src/storage/snapshot";
import { MemoryRepository } from "../src/storage/memoryRepository";
import { THEMES } from "../src/theme/themes";

// Thursday, Sept 24 2026
const TODAY = "2026-09-24";

function course(overrides: Partial<Course> = {}): Course {
  return {
    id: "c1", name: "Intro to CS", code: "CS 101", instructor: null, color: "#4f7cff",
    schedule: [{ id: "s1", days: [4], start: "10:00", end: "11:20", kind: "lecture", location: "BSB 147" }],
    termStart: null, termEnd: null, skipDates: [], archived: false, createdAt: 0, updatedAt: 0,
    ...overrides,
  };
}

function assessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    id: "a1", courseId: "c1", title: "Midterm", kind: "midterm", dueDate: TODAY, dueTime: null,
    priority: "high", weight: 25, status: "todo", grade: null, notes: "", createdAt: 0, updatedAt: 0,
    ...overrides,
  };
}

describe("dates", () => {
  it("validates real calendar dates only", () => {
    expect(isISODate("2026-02-29")).toBe(false);
    expect(isISODate("2028-02-29")).toBe(true);
    expect(isISODate("2026-13-01")).toBe(false);
  });
  it("does calendar arithmetic across DST and month ends", () => {
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(diffInDays("2026-03-07", "2026-03-09")).toBe(2);
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
  it("builds weeks and a fixed 42-day month grid", () => {
    expect(startOfWeek(TODAY, 1)).toBe("2026-09-21");
    expect(startOfWeek(TODAY, 0)).toBe("2026-09-20");
    const grid = monthGrid(TODAY, 1);
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-08-31");
  });
});

describe("7-day tracker", () => {
  const courses = [course(), course({ id: "c2", code: "OLD 1", archived: true })];
  const items = [
    assessment({ id: "today-low", priority: "low", kind: "task", weight: null }),
    assessment({ id: "today-high" }),
    assessment({ id: "day6", dueDate: addDays(TODAY, 6), kind: "exam" }),
    assessment({ id: "day7", dueDate: addDays(TODAY, 7) }),
    assessment({ id: "late", dueDate: addDays(TODAY, -2) }),
    assessment({ id: "done", status: "done" }),
    assessment({ id: "archived", courseId: "c2" }),
    assessment({ id: "orphan", courseId: "missing" }),
  ];

  it("includes today through day 6, excluding done, archived, and orphaned work", () => {
    expect(upcoming(items, courses, TODAY).map((t) => t.assessment.id)).toEqual(["today-high", "today-low", "day6"]);
  });
  it("filters to midterms and exams", () => {
    expect(upcoming(items, courses, TODAY, { kinds: MAJOR_KINDS }).map((t) => t.assessment.id)).toEqual(["today-high", "day6"]);
  });
  it("reports overdue separately", () => {
    expect(overdue(items, courses, TODAY).map((t) => t.assessment.id)).toEqual(["late"]);
  });
  it("sorts due-today by priority first", () => {
    expect(dueToday(items, courses, TODAY)[0]!.assessment.id).toBe("today-high");
  });
  it("sums weights and flags over-allocation", () => {
    const w = weightSummary("c1", [assessment({ weight: 60, grade: 80 }), assessment({ id: "b", weight: 50 })]);
    expect(w.total).toBe(110);
    expect(w.overAllocated).toBe(true);
    expect(w.currentGrade).toBe(80);
  });
});

describe("schedule", () => {
  it("honors weekday, term bounds, and skip dates", () => {
    expect(classesOn(TODAY, [course()])).toHaveLength(1);
    expect(classesOn(TODAY, [course({ skipDates: [TODAY] })])).toHaveLength(0);
    expect(classesOn(TODAY, [course({ termEnd: "2026-09-01" })])).toHaveLength(0);
    expect(classesOn(addDays(TODAY, 1), [course()])).toHaveLength(0);
  });
  it("labels live and next classes", () => {
    const c = course({
      schedule: [
        { id: "a", days: [4], start: "09:00", end: "10:00", kind: "lecture", location: null },
        { id: "b", days: [4], start: "11:00", end: "12:00", kind: "lab", location: null },
        { id: "c", days: [4], start: "14:00", end: "15:00", kind: "tutorial", location: null },
      ],
    });
    const statuses = classStatuses(classesOn(TODAY, [c]), "09:30").map((o) => o.status);
    expect(statuses).toEqual(["live", "next", "later"]);
  });
});

describe("validation", () => {
  it("rejects duplicate codes regardless of spacing and case", () => {
    const r = validateCourse({ ...course(), code: "cs101" }, [course()]);
    expect(r.ok).toBe(false);
  });
  it("rejects classes that end before they start or overlap", () => {
    const bad = validateCourse(
      { ...course({ id: "x", code: "X 1" }), schedule: [{ id: "s", days: [1], start: "10:00", end: "09:00", kind: "lecture", location: null }] },
      [],
    );
    expect(bad.ok).toBe(false);
    const overlap = validateCourse(
      {
        ...course({ id: "x", code: "X 1" }),
        schedule: [
          { id: "a", days: [1], start: "10:00", end: "11:00", kind: "lecture", location: null },
          { id: "b", days: [1], start: "10:30", end: "11:30", kind: "lab", location: null },
        ],
      },
      [],
    );
    expect(overlap.ok).toBe(false);
  });
  it("requires a real course and a sane weight", () => {
    expect(validateAssessment({ ...assessment(), courseId: "nope" }, [course()]).ok).toBe(false);
    expect(validateAssessment({ ...assessment(), weight: 120 }, [course()]).ok).toBe(false);
    expect(validateAssessment(assessment(), [course()]).ok).toBe(true);
  });
});

describe("quick add", () => {
  const courses = [course(), course({ id: "c2", code: "MATH 1B03", name: "Linear Algebra" })];

  it("parses a full command in any order", () => {
    const p = parseQuickAdd("midterm cs101 oct 14 3pm 20% !!!", courses, TODAY);
    expect(p.kind).toBe("midterm");
    expect(p.course?.id).toBe("c1");
    expect(p.dueDate).toBe("2026-10-14");
    expect(p.dueTime).toBe("15:00");
    expect(p.weight).toBe(20);
    expect(p.priority).toBe("high");
    expect(p.title).toBe("Midterm");
  });
  it("keeps free text as the title and handles spaced codes", () => {
    const p = parseQuickAdd("Problem set 3 math 1b03 due fri at 11:59pm", courses, TODAY);
    expect(p.title).toBe("Problem set 3");
    expect(p.course?.id).toBe("c2");
    expect(p.dueDate).toBe("2026-09-25");
    expect(p.dueTime).toBe("23:59");
  });
  it("resolves relative dates", () => {
    expect(parseQuickAdd("quiz cs101 tomorrow", courses, TODAY).dueDate).toBe("2026-09-25");
    expect(parseQuickAdd("quiz cs101 thu", courses, TODAY).dueDate).toBe("2026-10-01");
    expect(parseQuickAdd("quiz cs101 next mon", courses, TODAY).dueDate).toBe("2026-10-05");
    expect(parseQuickAdd("quiz cs101 in 2 weeks", courses, TODAY).dueDate).toBe("2026-10-08");
    expect(parseQuickAdd("exam cs101 sep 1", courses, TODAY).dueDate).toBe("2027-09-01");
  });
  it("treats 'final project' as a project", () => {
    const p = parseQuickAdd("final project cs101 dec 5", courses, TODAY);
    expect(p.kind).toBe("project");
    expect(p.title).toBe("Final project");
  });
  it("reports what's missing", () => {
    const r = quickAddToDraft(parseQuickAdd("exam dec 10", courses, TODAY), TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toContain("course");
  });
  it("does not invent a weight", () => {
    const r = quickAddToDraft(parseQuickAdd("midterm cs101 oct 1", courses, TODAY), TODAY);
    expect(r.ok && r.draft.weight).toBe(null);
  });
});

describe("course color propagation", () => {
  it("keeps ink readable (≥ 4.5:1) on every theme for every palette color", () => {
    for (const theme of Object.values(THEMES)) {
      const bg = channelsToRgb(theme.tokens.bg);
      for (const hex of [...DEFAULT_COURSE_COLORS, ...theme.coursePalette, "#ffff00", "#000000", "#ffffff"]) {
        const v = deriveCourseColors(hex, theme.tokens.bg, theme.mode);
        expect(contrastRatio(channelsToRgb(v.ink), bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(channelsToRgb(v.ink), channelsToRgb(v.soft))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it("assigns unused palette colors first", () => {
    expect(nextCourseColor([DEFAULT_COURSE_COLORS[0]!])).toBe(DEFAULT_COURSE_COLORS[1]);
  });
});

describe("storage", () => {
  it("drops orphaned assessments on import", () => {
    const { snapshot, dropped } = parseSnapshot({
      version: 1,
      courses: [course()],
      assessments: [assessment(), assessment({ id: "x", courseId: "ghost" })],
      settings: { theme: "neon-nonsense" },
    });
    expect(snapshot.assessments).toHaveLength(1);
    expect(dropped).toBe(1);
    expect(snapshot.settings.theme).toBe("system");
  });
  it("cascades course deletes", async () => {
    const repo = new MemoryRepository();
    await repo.upsertCourse(course());
    await repo.upsertAssessment(assessment());
    await repo.deleteCourse("c1");
    expect(await repo.listAssessments()).toHaveLength(0);
  });
});

describe("reminders", () => {
  const courses = [course()];
  const tomorrow = addDays(TODAY, 1);

  it("warns the evening before a midterm, not earlier", () => {
    const items = [assessment({ dueDate: tomorrow })];
    expect(dueReminders(items, courses, TODAY, "17:59", new Set())).toHaveLength(0);
    const r = dueReminders(items, courses, TODAY, "18:00", new Set());
    expect(r).toHaveLength(1);
    expect(r[0]!.title).toBe("Midterm tomorrow: Midterm");
  });
  it("skips the day-before reminder for low-priority tasks", () => {
    const items = [assessment({ dueDate: tomorrow, kind: "task", priority: "low" })];
    expect(dueReminders(items, courses, TODAY, "20:00", new Set())).toHaveLength(0);
  });
  it("sends the most urgent rule only and marks the rest", () => {
    const items = [assessment({ dueTime: "14:00" })];
    const r = dueReminders(items, courses, TODAY, "13:15", new Set());
    expect(r).toHaveLength(1);
    expect(r[0]!.title).toBe("Due within the hour: Midterm");
    expect(r[0]!.keys).toContain(reminderKey(items[0]!, "morning"));
  });
  it("never repeats a sent reminder and re-arms after rescheduling", () => {
    const a = assessment();
    const sent = new Set([reminderKey(a, "morning")]);
    expect(dueReminders([a], courses, TODAY, "09:00", sent)).toHaveLength(0);
    const moved = { ...a, dueDate: tomorrow };
    expect(dueReminders([moved], courses, TODAY, "19:00", sent)).toHaveLength(1);
  });
  it("stays quiet after the deadline and for done work", () => {
    expect(dueReminders([assessment({ dueTime: "09:00" })], courses, TODAY, "10:00", new Set())).toHaveLength(0);
    expect(dueReminders([assessment({ status: "done" })], courses, TODAY, "09:00", new Set())).toHaveLength(0);
  });
  it("summarises a busy morning into one notification", () => {
    const items = ["a", "b", "c", "d"].map((id) => assessment({ id, kind: "task", priority: "low" }));
    const r = dueReminders(items, courses, TODAY, "08:00", new Set());
    expect(r).toHaveLength(1);
    expect(r[0]!.title).toBe("4 things due today");
    expect(r[0]!.keys).toHaveLength(4);
  });
  it("prunes sent keys for past dates", () => {
    expect(pruneSentKeys([`x:morning:${addDays(TODAY, -1)}`, `y:morning:${TODAY}`], TODAY)).toEqual([`y:morning:${TODAY}`]);
  });
});

describe("multi-day slots", () => {
  it("places one Mon/Wed slot on both days", () => {
    const c = course({ schedule: [{ id: "s", days: [1, 3], start: "10:00", end: "11:00", kind: "lecture", location: null }] });
    expect(classesOn("2026-09-21", [c])).toHaveLength(1); // Monday
    expect(classesOn("2026-09-23", [c])).toHaveLength(1); // Wednesday
    expect(classesOn("2026-09-22", [c])).toHaveLength(0); // Tuesday
  });
  it("detects overlap only on shared days", () => {
    const base = course({ id: "x", code: "X 1" });
    const clash = validateCourse({
      ...base,
      schedule: [
        { id: "a", days: [1, 3], start: "10:00", end: "11:00", kind: "lecture", location: null },
        { id: "b", days: [3, 5], start: "10:30", end: "11:30", kind: "lab", location: null },
      ],
    }, []);
    expect(clash.ok).toBe(false);
    const fine = validateCourse({
      ...base,
      schedule: [
        { id: "a", days: [1, 3], start: "10:00", end: "11:00", kind: "lecture", location: null },
        { id: "b", days: [5], start: "10:30", end: "11:30", kind: "lab", location: null },
      ],
    }, []);
    expect(fine.ok).toBe(true);
  });
  it("rejects a slot with no days", () => {
    const r = validateCourse({ ...course({ id: "x", code: "X 1" }), schedule: [{ id: "a", days: [], start: "10:00", end: "11:00", kind: "lecture", location: null }] }, []);
    expect(r.ok).toBe(false);
  });
  it("reads the earlier single-day shape", () => {
    expect(coerceSlot({ id: "s", day: 2, start: "09:00", end: "10:00", kind: "lab" })?.days).toEqual([2]);
  });
});

describe("migration from the original Cursor schema", () => {
  const legacyCourse = {
    id: "c1", name: "Data Structures", code: "CS 221", instructor: "", status: "archived", color: "#7C9CFF",
    createdAt: "2026-09-01T12:00:00.000Z", updatedAt: "2026-09-02T12:00:00.000Z",
  };
  const legacySlots = [
    { id: "s1", courseId: "c1", kind: "weekly", days: [1, 3], time: { startMin: 600, endMin: 675 }, location: "Hall 204",
      startsOn: "2026-09-01", endsOn: "2027-04-30", cancelledDates: ["2026-10-12"], extraDates: [] },
    { id: "s2", courseId: "c1", kind: "once", days: [], time: { startMin: 540, endMin: 600 }, startsOn: "2026-11-01", cancelledDates: [], extraDates: [] },
    { id: "s3", courseId: "other", kind: "weekly", days: [2], time: { startMin: 60, endMin: 120 }, startsOn: "2026-09-01", cancelledDates: [], extraDates: [] },
  ];

  it("folds weekly slots into the course and maps fields", () => {
    const c = migrateLegacyCourse(legacyCourse, legacySlots)!;
    expect(c.archived).toBe(true);
    expect(c.instructor).toBe(null);
    expect(c.color).toBe("#7c9cff");
    expect(c.schedule).toHaveLength(1);
    expect(c.schedule[0]).toEqual({ id: "s1", days: [1, 3], start: "10:00", end: "11:15", kind: "lecture", location: "Hall 204" });
    expect(c.termStart).toBe("2026-09-01");
    expect(c.termEnd).toBe("2027-04-30");
    expect(c.skipDates).toEqual(["2026-10-12"]);
    expect(c.createdAt).toBe(Date.parse("2026-09-01T12:00:00.000Z"));
  });
  it("maps assessments, including legacy-only values", () => {
    const a = migrateLegacyAssessment({
      id: "a1", courseId: "c1", title: "Lab", kind: "other", dueOn: "2026-10-01", dueTime: { startMin: 870, endMin: 900 },
      priority: "high", weightPercent: 12.5, status: "cancelled", createdAt: "2026-09-01T00:00:00Z",
    })!;
    expect(a.kind).toBe("task");
    expect(a.dueDate).toBe("2026-10-01");
    expect(a.dueTime).toBe("14:30");
    expect(a.weight).toBe(12.5);
    expect(a.status).toBe("done");
    expect(a.notes).toBe("");
  });
  it("maps theme presets, system mode, and custom accent", () => {
    const s = migrateLegacySettings({ id: "singleton", theme: { presetId: "minimal-light", mode: "light", customAccent: "#F4A6C8" }, weekStartsOn: 0, timeFormat: "24h" });
    expect(s.theme).toBe("light");
    expect(s.accent).toBe("#f4a6c8");
    expect(s.weekStartsOn).toBe(0);
    expect(s.timeFormat).toBe("24h");
    expect(migrateLegacySettings({ theme: { presetId: "synthwave", mode: "system" } }).theme).toBe("system");
    expect(migrateLegacySettings(undefined).theme).toBe("system");
  });
});

describe("appearance settings", () => {
  it("keeps a custom accent visible and its text readable on every theme", () => {
    for (const theme of Object.values(THEMES)) {
      for (const hex of ["#ffff00", "#ffffff", "#000000", "#f4a6c8", "#4f7cff"]) {
        const o = accentOverride(hex, theme.tokens.bg);
        expect(contrastRatio(channelsToRgb(o.accent), channelsToRgb(theme.tokens.bg))).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(channelsToRgb(o.accentFg), channelsToRgb(o.accent))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it("formats times as 12h or 24h", () => {
    expect(formatTime("15:05", "24h")).toBe("15:05");
    expect(formatTime("15:05", "12h")).toBe("3:05 PM");
    expect(formatTime("00:30", "12h")).toBe("12:30 AM");
    expect(formatTime("12:00", "12h")).toBe("12:00 PM");
  });
  it("builds valid sample data", () => {
    const { courses, assessments } = buildSampleData(TODAY);
    for (const c of courses) expect(validateCourse(c, courses.filter((o) => o !== c)).ok).toBe(true);
    for (const a of assessments) expect(validateAssessment(a, courses).ok).toBe(true);
  });
});
