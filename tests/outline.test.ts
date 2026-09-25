import { describe, expect, it } from "vitest";
import { parseOutline, resolveAssessmentDate } from "../src/core/outline/parseOutline";
import { findDate, findDays, findLocation, findTimeRange, normalizeLines } from "../src/core/outline/text";
import { linesFromTextItems, MAX_OUTLINE_BYTES, OutlineReadError, readOutline } from "../src/platform/outlineReader";

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
    expect(out.course.instructor).toBe("Jane Okafor");
    expect(out.course.term).toBe("Fall 2026");
    expect(out.termStart).toBe("2026-09-08");
    expect(out.termEnd).toBe("2026-12-07");
  });

  it("finds lectures and the lab, but not office hours", () => {
    const simple = out.meetings.map(({ days, start, end, kind, location }) => ({ days, start, end, kind, location }));
    expect(simple).toEqual([
      { days: [1, 3], start: "10:00", end: "11:50", kind: "lecture", location: "KHW 071" },
      { days: [5], start: "14:00", end: "15:50", kind: "lab", location: "ENG 203" },
    ]);
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
    expect(final.tba).toBe(true);
    expect(final.date).toBe(null);
    expect(out.assessments.filter((a) => a.title.startsWith("Lab "))).toHaveLength(10);
    expect(out.assessments.some((a) => /late/i.test(a.source))).toBe(false);
    const total = out.assessments.reduce((s, a) => s + (a.weight ?? 0), 0);
    expect(total).toBe(100);
  });

  it("warns about the TBA final but not about weights", () => {
    expect(out.warnings.some((w) => w.includes("TBA"))).toBe(true);
    expect(out.warnings.some((w) => w.includes("add up"))).toBe(false);
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
    expect(out.meetings[0]!.days).toEqual([1, 3]);
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
