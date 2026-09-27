import { describe, expect, it } from "vitest";
import { parseOutline, resolveAssessmentDate } from "../src/core/outline/parseOutline";
import { findDate, findDays, findLocation, findTimeRange, normalizeLines } from "../src/core/outline/text";
import { linesFromTextItems, MAX_OUTLINE_BYTES, OutlineReadError, readOutline } from "../src/platform/outlineReader";
import { describeDays, normalizeDays, validateRecurrence } from "../src/core/outline/recurrence";
import { normalizeTime, sanitizeOutline } from "../src/core/outline/sanitize";
import { checkWeights } from "../src/core/outline/weights";

const TODAY = "2026-09-24";

const TMU_OUTLINE = `
Toronto Metropolitan University
CPS 109: Computer Science I
Fall 2026 – Course Outline
Instructor: Dr. Jane Okafor (jokafor@torontomu.ca)
Office hours: Thursdays 1:00–2:00 p.m., ENG 288
Lectures: Monday and Wednesday, 10:00 a.m. – 11:50 a.m., Room KHW 071
Lab: Fri 2-3:50pm in ENG 203
Classes begin September 8, 2026. Last day of classes: December 7, 2026.

Evaluation
Assignment 1 (Python basics)\tOct 3\t10%
Assignment 2\tNov 7\t10%
Labs (10 x 1%)\t10%
Midterm Exam\tWeek 7\t25%
Final Exam\tTBA (final exam period)\t45%

Late assignments lose 10% per day.

Schedule
Week 7 (Oct 20): Midterm exam in class
`;

describe("outline text recognisers", () => {
  it("reads day names, plurals, and registrar shorthand", () => {
    expect(findDays("Mondays and Wednesdays")).toEqual([1, 3]);
    expect(findDays("LEC MWF 09:10-10:00")).toEqual([1, 3, 5]);
    expect(findDays("TUT TTh 4-5pm")).toEqual([2, 4]);
    expect(findDays("TR 13:00-14:20")).toEqual([2, 4]);
    expect(findDays("The Tutorial Monthly Weekly")).toEqual([]);
  });
  it("resolves am/pm the way timetables write them", () => {
    expect(findTimeRange("10:00 am - 11:50 am")).toEqual({ start: "10:00", end: "11:50", index: 0, length: 19 });
    expect(findTimeRange("11-12:20pm")?.start).toBe("11:00");
    expect(findTimeRange("2-3:50pm")?.start).toBe("14:00");
    expect(findTimeRange("12:10-1:00")?.end).toBe("13:00");
    expect(findTimeRange("14:00-15:20")?.start).toBe("14:00");
    expect(findTimeRange("Oct 10-14")).toBe(null);
    expect(findTimeRange("Weeks 5-6")).toBe(null);
  });
  it("normalises dashes and a.m./p.m.", () => {
    expect(normalizeLines("1:00–2:00 p.m.")).toEqual(["1:00-2:00 pm"]);
  });
  it("reads dates in common outline formats, inferring the year", () => {
    expect(findDate("Oct 3", TODAY)?.date).toBe("2026-10-03");
    expect(findDate("due 14 November", TODAY)?.date).toBe("2026-11-14");
    expect(findDate("Jan 15", "2026-12-10")?.date).toBe("2027-01-15");
    expect(findDate("2026-10-14", TODAY)?.date).toBe("2026-10-14");
    expect(findDate("Week 7", TODAY)?.week).toBe(7);
    expect(findDate("TBA", TODAY)?.tba).toBe(true);
    expect(findDate("Students may submit twice", TODAY)).toBe(null);
  });
  it("finds rooms without mistaking course codes or day letters for them", () => {
    expect(findLocation("Room KHW 071", "CPS 109")).toBe("KHW 071");
    expect(findLocation("LEC MWF 09:10-10:00 VIC 507", "CPS 109")).toBe("VIC 507");
    expect(findLocation("CPS 109 lecture", "CPS 109")).toBe(null);
    expect(findLocation("room for 30 students", null)).toBe(null);
  });
});

describe("parseOutline on a TMU-style outline", () => {
  const out = parseOutline(TMU_OUTLINE, { today: TODAY });

  it("finds course details and term dates", () => {
    expect(out.course.code).toBe("CPS 109");
    expect(out.course.name).toBe("Computer Science I");
    expect(out.instructors.map((i) => i.name)).toEqual(["Jane Okafor"]);
    expect(out.course.term).toBe("Fall 2026");
    expect(out.termStart).toBe("2026-09-08");
    expect(out.termEnd).toBe("2026-12-07");
  });

  it("finds lectures and the lab, but not office hours", () => {
    const simple = out.meetings.map(({ daysOfWeek, startTime, endTime, kind, location }) => ({ daysOfWeek, startTime, endTime, kind, location }));
    expect(simple).toEqual([
      { daysOfWeek: ["MO", "WE"], startTime: "10:00", endTime: "11:50", kind: "lecture", location: "KHW 071" },
      { daysOfWeek: ["FR"], startTime: "14:00", endTime: "15:50", kind: "lab", location: "ENG 203" },
    ]);
    expect(out.meetings[0]!.rrule).toBe("FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261207T235959");
  });

  it("finds graded work, merges the midterm, expands labs, and skips the late policy", () => {
    const byTitle = new Map(out.assessments.map((a) => [a.title, a]));
    expect(byTitle.get("Assignment 1 (Python basics)")?.date).toBe("2026-10-03");
    expect(byTitle.get("Assignment 1 (Python basics)")?.weight).toBe(10);
    expect(byTitle.get("Assignment 2")?.date).toBe("2026-11-07");
    const midterm = byTitle.get("Midterm Exam")!;
    expect(midterm.kind).toBe("midterm");
    expect(midterm.weight).toBe(25);
    expect(midterm.date).toBe("2026-10-20");
    const final = byTitle.get("Final Exam")!;
    expect(final.kind).toBe("exam");
    expect(final.weight).toBe(45);
    expect(final.flags).toContain("tba");
    expect(final.date).toBe(null);
    expect(out.assessments.filter((a) => a.title.startsWith("Lab "))).toHaveLength(10);
    expect(out.assessments.some((a) => /late/i.test(a.source))).toBe(false);
    const total = out.assessments.reduce((s, a) => s + (a.weight ?? 0), 0);
    expect(total).toBe(100);
  });

  it("warns about the TBA final but not about weights", () => {
    expect(out.warnings.some((w) => w.includes("TBA"))).toBe(true);
    expect(out.weightCheck.status).toBe("exact");
    expect(out.warnings.some((w) => w.includes("over 100") || w.includes("short of 100"))).toBe(false);
  });
});

describe("parseOutline edge cases", () => {
  it("reads table cells split onto separate lines (DOCX tables)", () => {
    const out = parseOutline("MTH 207 Calculus II\nMidterm\n30%\nOct 22\nQuiz 1\n5%", { today: TODAY });
    const midterm = out.assessments.find((a) => a.kind === "midterm")!;
    expect(midterm.weight).toBe(30);
    expect(midterm.date).toBe("2026-10-22");
    expect(out.assessments.find((a) => a.title === "Quiz 1")?.weight).toBe(5);
  });

  it("places week-numbered items once a term start is known", () => {
    const out = parseOutline("CPS 209\nProject proposal Week 4 (Friday) 10%", { today: TODAY });
    const item = out.assessments[0]!;
    expect(item.week).toBe(4);
    expect(item.weekday).toBe(5);
    expect(resolveAssessmentDate(item, null)).toBe(null);
    expect(resolveAssessmentDate(item, "2026-09-08")).toBe("2026-10-02");
    expect(out.warnings.some((w) => w.includes("week number"))).toBe(true);
  });

  it("reads due times and quiz dates in prose", () => {
    const out = parseOutline("Quiz 3 on Tuesday, Oct 14 at 7:00pm (5%)", { today: TODAY });
    const q = out.assessments[0]!;
    expect(q.title).toBe("Quiz 3 on Tuesday");
    expect(q.date).toBe("2026-10-14");
    expect(q.time).toBe("19:00");
    expect(q.weight).toBe(5);
  });

  it("merges meeting days written on separate lines", () => {
    const out = parseOutline("Monday 9:10-10:00 LEC\nWednesday 9:10-10:00 LEC", { today: TODAY });
    expect(out.meetings).toHaveLength(1);
    expect(out.meetings[0]!.daysOfWeek).toEqual(["MO", "WE"]);
  });

  it("returns nothing, with warnings, for text that isn't an outline", () => {
    const out = parseOutline("Dear students, welcome! Please read the chapter.", { today: TODAY });
    expect(out.meetings).toHaveLength(0);
    expect(out.assessments).toHaveLength(0);
    expect(out.warnings.length).toBeGreaterThanOrEqual(2);
  });
});

describe("outline reading pipeline", () => {
  it("rebuilds PDF table rows from positioned text runs", () => {
    const run = (str: string, x: number, y: number, width = str.length * 5) => ({ str, transform: [1, 0, 0, 1, x, y], width });
    const text = linesFromTextItems([
      run("Final Exam", 72, 500),
      run("CPS 109", 72, 700),
      run("45%", 400, 500.8),
      run("Mid", 72, 600),
      run("term", 87, 600),
      run("25%", 400, 600),
      { type: "beginMarkedContent" },
    ]);
    expect(text).toBe("CPS 109\nMidterm 25%\nFinal Exam 45%");
  });

  it("returns only structured data, never the document's text", async () => {
    const secret = "Personal note: my student number is 501234567 and I live at 12 Example St.";
    const file = new File([`CPS 109: Computer Science I\n${secret}\nMidterm Oct 20 25%\n`], "outline.txt", { type: "text/plain" });
    const outline = await readOutline(file, { today: TODAY });
    const serialized = JSON.stringify(outline);
    expect(serialized.includes("501234567")).toBe(false);
    expect(serialized.includes("Example St")).toBe(false);
    expect(outline.assessments[0]?.weight).toBe(25);
  });

  it("rejects unsupported, empty, and oversized files with a helpful message", async () => {
    const attempt = async (file: File) => {
      try {
        await readOutline(file, { today: TODAY });
        return "no error";
      } catch (err) {
        return err instanceof OutlineReadError ? err.message : `unexpected: ${String(err)}`;
      }
    };
    expect((await attempt(new File(["x"], "old.doc"))).includes(".docx")).toBe(true);
    expect((await attempt(new File([""], "empty.txt", { type: "text/plain" })))).toBe("That file is empty.");
    expect((await attempt(new File(["hello"], "short.txt", { type: "text/plain" }))).includes("enough text")).toBe(true);
    const big = new File([new Uint8Array(MAX_OUTLINE_BYTES + 1)], "big.pdf", { type: "application/pdf" });
    expect((await attempt(big)).includes("20 MB")).toBe(true);
  });
});

/* ------------------------------------------------ parser v2: reported bugs */

const MULTI = `
PSY 102: Introduction to Psychology II - Winter 2027
Instructors: Dr. Jane Okafor (Section 011) and Prof. Ahmed Khan (Section 021)
Lab Coordinator: Maria Lopez
Teaching Assistants: Sam Lee, Priya Patel
Office Hours:
Tuesday 2:00-3:00 pm, JOR 1102
Lectures: Tues/Thurs 10:00-11:20, Room KHW 071
Tutorial: Mon-Fri sections, 9:10-10:00am
Required Textbook: Myers, Psychology (13th ed.), Chapter 3, 2019 edition

Evaluation
Assignment 1   Feb 3   10%
Assignment 2   Mar 10  10%
Midterm Exam   Feb 24  30%
Final Exam     TBA     50%
Bonus quiz     Mar 20  2%
Total 100%

Weekly Schedule
Jan 12 Lecture 1: Intro 10:00-11:20
Jan 14 Lecture 2: Methods 10:00-11:20
Jan 19 Lecture 3: Brain 10:00-11:20
Apr 1 Review session 2:00-4:00pm
Mar 3 Assignment 2 (10%) handed out in class

Missed Term Work
Students who miss the midterm (30%) must submit documentation within 3 days.
Last year's class average on the final exam: 68%.
`;

describe("bug 1: multiple instructors", () => {
  const out = parseOutline(MULTI, { today: "2027-01-05" });
  it("lists every person with their role and section, lecturers first", () => {
    expect(out.instructors.map((i) => [i.name, i.role, i.section])).toEqual([
      ["Jane Okafor", "instructor", "011"],
      ["Ahmed Khan", "instructor", "021"],
      ["Maria Lopez", "lab", null],
      ["Sam Lee", "ta", null],
      ["Priya Patel", "ta", null],
    ]);
    expect(out.warnings.some((w) => w.includes("Choose your instructor"))).toBe(true);
  });
  it("reads names listed under a label, and ignores prose", () => {
    const listed = parseOutline("CPS 109\nInstructors:\nDr. Wei Chen\nProf. Lina Haddad\nEvaluation\nMidterm Oct 20 30%", { today: TODAY });
    expect(listed.instructors.map((i) => i.name)).toEqual(["Wei Chen", "Lina Haddad"]);
    const prose = parseOutline("CPS 109\nInstructors may grant extensions.\nMidterm Oct 20 30%", { today: TODAY });
    expect(prose.instructors).toHaveLength(0);
  });
});

describe("bug 2: recurring class schedules", () => {
  const out = parseOutline(MULTI, { today: "2027-01-05" });
  it("keeps Tue/Thu as one weekly rule and folds the dated schedule into it", () => {
    const lecture = out.meetings.find((m) => m.kind === "lecture" && !m.oneOff)!;
    expect(lecture.daysOfWeek).toEqual(["TU", "TH"]);
    expect([lecture.startTime, lecture.endTime]).toEqual(["10:00", "11:20"]);
    expect(lecture.startDate).toBe("2027-01-12");
    // Three listed weeks don't end the term: no UNTIL until a term end is known.
    expect(lecture.rrule).toBe("FREQ=WEEKLY;BYDAY=TU,TH");
    expect(out.meetings.filter((m) => m.kind === "lecture" && !m.oneOff)).toHaveLength(1);
  });
  it("expands day ranges across the whole week", () => {
    const tut = out.meetings.find((m) => m.kind === "tutorial")!;
    expect(tut.daysOfWeek).toEqual(["MO", "TU", "WE", "TH", "FR"]);
    const weekend = parseOutline("Studio: Sat & Sun 1-3pm\nSeminar: Fri-Mon 6-7pm", { today: TODAY });
    expect(weekend.meetings.map((m) => m.daysOfWeek)).toEqual([["SA", "SU"], ["MO", "FR", "SA", "SU"]]);
  });
  it("builds a weekly pattern from a dated-only schedule, and flags single dates", () => {
    const dated = parseOutline(
      "Schedule\nSep 9 Lecture 10:00-11:20\nSep 11 Lecture 10:00-11:20\nSep 16 Lecture 10:00-11:20\nDec 2 Lecture 10:00-11:20\nDec 3 Review session 2-4pm",
      { today: "2026-09-01" },
    );
    const weekly = dated.meetings.find((m) => !m.oneOff)!;
    expect(weekly.daysOfWeek).toEqual(["WE", "FR"]);
    expect(weekly.rrule).toBe("FREQ=WEEKLY;BYDAY=WE,FR;UNTIL=20261202T235959");
    expect(dated.termStart).toBe("2026-09-09");
    const review = dated.meetings.find((m) => m.oneOff)!;
    expect(review.rrule).toBe("FREQ=WEEKLY;COUNT=1;BYDAY=TH");
  });
  it("normalises any day spelling", () => {
    expect(normalizeDays(["Thursday", "tu", "R", 2, "SU", "bogus"])).toEqual(["TU", "TH", "SU"]);
    expect(normalizeDays("Mon, Wed and Fri")).toEqual(["MO", "WE", "FR"]);
    expect(describeDays(["MO", "TU", "WE", "TH", "FR"])).toBe("Every weekday");
    expect(describeDays(["TU", "TH"])).toBe("Every Tue & Thu");
  });
  it("rejects unusable rules", () => {
    expect(validateRecurrence({ daysOfWeek: [], startTime: "10:00", endTime: "11:00", startDate: null, endDate: null })).toHaveLength(1);
    expect(validateRecurrence({ daysOfWeek: ["MO"], startTime: "11:00", endTime: "10:00", startDate: null, endDate: null })).toHaveLength(1);
    expect(validateRecurrence({ daysOfWeek: ["MO"], startTime: "10:00", endTime: "11:00", startDate: "2026-12-01", endDate: "2026-09-01" })).toHaveLength(1);
  });
});

describe("bug 3: weights beyond 100%", () => {
  const out = parseOutline(MULTI, { today: "2027-01-05" });
  it("counts only the grading section, excluding bonus work", () => {
    expect(out.gradingSectionFound).toBe(true);
    expect(out.weightCheck).toEqual({ total: 100, declaredTotal: 100, status: "exact", difference: 0 });
    const bonus = out.assessments.find((a) => a.title === "Bonus quiz")!;
    expect(bonus.optional).toBe(true);
    expect(bonus.weight).toBe(2);
  });
  it("doesn't double-count a weight mentioned again in the schedule", () => {
    const a2 = out.assessments.find((a) => a.title === "Assignment 2")!;
    expect(a2.weight).toBe(10);
    expect(out.assessments.filter((a) => a.title.startsWith("Assignment 2"))).toHaveLength(1);
  });
  it("keeps a weight found only outside the grading section visible but uncounted", () => {
    const o = parseOutline("CPS 109\nEvaluation\nMidterm Oct 20 40%\nFinal Exam Dec 10 60%\nSchedule\nOct 3 Lab report 5%", { today: TODAY });
    const lab = o.assessments.find((a) => a.title.startsWith("Lab report"))!;
    expect(lab.weight).toBe(null);
    expect(lab.mentionedWeight).toBe(5);
    expect(lab.flags).toContain("outside-grading");
    expect(o.weightCheck.status).toBe("exact");
  });
  it("marks 'best 8 of 10' drops as uncounted", () => {
    const o = parseOutline("MTH 207\nEvaluation\nQuizzes (10 x 2%), best 8 of 10 count\nMidterm Oct 22 34%\nFinal Exam Dec 12 50%", { today: TODAY });
    expect(o.assessments.filter((a) => a.flags.includes("dropped")).map((a) => a.title)).toEqual(["Quiz 9", "Quiz 10"]);
    expect(o.weightCheck.total).toBe(100);
  });
  it("flags totals over 100% for confirmation", () => {
    const o = parseOutline("ECN 104\nGrading Scheme\nMidterm Oct 22 40%\nFinal Exam Dec 12 50%\nProject Nov 20 20%", { today: TODAY });
    expect(o.weightCheck).toEqual({ total: 110, declaredTotal: null, status: "over", difference: 10 });
    expect(o.warnings.some((w) => w.includes("10% over 100%"))).toBe(true);
  });
  it("re-checks live selections", () => {
    const items = [
      { weight: 60, optional: false, flags: [] },
      { weight: 45, optional: false, flags: [] },
      { weight: 5, optional: true, flags: ["optional"] as const },
    ];
    expect(checkWeights(items).status).toBe("over");
    expect(checkWeights([items[0]!, { ...items[1]!, weight: 40 }, items[2]!]).status).toBe("exact");
  });
});

describe("bug 4: boilerplate noise", () => {
  const out = parseOutline(MULTI, { today: "2027-01-05" });
  it("never turns office hours into a class, even on the line after the label", () => {
    expect(out.meetings.some((m) => m.source.includes("JOR 1102"))).toBe(false);
  });
  it("ignores textbooks, policies, and historical averages", () => {
    const sources = out.assessments.map((a) => a.source).join("\n");
    expect(sources.includes("Textbook")).toBe(false);
    expect(sources.includes("documentation")).toBe(false);
    expect(sources.includes("class average")).toBe(false);
    expect(out.assessments.find((a) => a.title === "Final Exam")!.weight).toBe(50);
  });
});

describe("sanitizeOutline (gate for any extractor, e.g. model JSON)", () => {
  it("normalises loose values and recomputes derived fields", () => {
    const o = sanitizeOutline({
      course: { code: "CPS 109", name: "", term: 42 },
      instructors: [{ name: "Dr Jane Okafor", role: "boss" }, { name: "" }],
      termEnd: "2026-12-07",
      meetings: [
        { daysOfWeek: ["Tues", "thursday"], startTime: "10am", endTime: "11:20 am", kind: "lecture" },
        { daysOfWeek: ["Mon"], startTime: "3pm", endTime: "1pm" },
      ],
      assessments: [
        { title: "Midterm", kind: "midterm", date: "2026-10-20", weight: "30%" },
        { title: "Final", kind: "final", date: "not a date", weight: 80 },
        { title: "", weight: 10 },
      ],
      weightCheck: { total: 999, status: "exact", declaredTotal: "100%" },
    });
    expect(o.course).toEqual({ code: "CPS 109", name: null, term: null });
    expect(o.instructors.map((i) => [i.name, i.role])).toEqual([["Dr Jane Okafor", "other"]]);
    expect(o.meetings).toHaveLength(1);
    expect(o.meetings[0]!.daysOfWeek).toEqual(["TU", "TH"]);
    expect(o.meetings[0]!.rrule).toBe("FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261207T235959");
    expect(o.assessments.map((a) => [a.kind, a.date, a.weight])).toEqual([["midterm", "2026-10-20", 30], ["task", null, 80]]);
    expect(o.weightCheck).toEqual({ total: 110, declaredTotal: 100, status: "over", difference: 10 });
  });
  it("reads times in any common form", () => {
    expect(["10:00", "9:05", "10am", "10:30 pm", "1030", "22:15", "10", "25:00", "13pm"].map(normalizeTime)).toEqual([
      "10:00", "09:05", "10:00", "22:30", "10:30", "22:15", null, null, null,
    ]);
  });
});
