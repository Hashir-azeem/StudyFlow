import { newId } from "../validation";
import type { AssessmentKind, ISODate } from "../types";
import type { OutlineLine } from "./sections";
import { findCountEach, findDate, findDays, findTime, findTimeRange, findWeight, isOnlyWeight, type DateMatch } from "./text";
import type { AssessmentFlag, ParsedAssessment } from "./types";

/** Policy sentences mention "10%" and "assignment" without being assessments. */
const POLICY =
  /\b(?:late|penalt\w*|deduct\w*|per day|loses?|lost|reduced|miss(?:ed|ing)?|make-?up|accommodat\w*|polic(?:y|ies)|integrity|plagiari\w*|re-?grade|appeal\w*|excus\w*|grading scheme|letter grade|extensions?|resubmi\w*|re-?weight\w*)\b/i;
/** Historical breakdowns: "last year's class average on the final: 68%". */
const HISTORICAL = /\b(?:class\s+average|averages?|median|mean|last\s+(?:year|term|semester)|previous\s+(?:year|term|offering)|historical(?:ly)?|distribution\s+of\s+grades|pass\s+rate)\b/i;
const OPTIONAL = /\b(?:bonus|extra[\s-]+credit|optional)\b/i;
const BEST_OF = /\bbest\s+(\d{1,2})\s+(?:of|out\s+of)\s+(\d{1,2})\b/i;
const DROP_LOWEST = /\bdrop(?:s|ped|ping)?\s+(?:the\s+)?(?:lowest|worst)(?:\s+(\d{1,2}|one|two))?\b/i;
const TOTAL_ROW = /^(?:total|sum|overall)\b[^%]*?(\d{2,3}(?:\.\d+)?)\s*%/i;

const KINDS: Array<{ re: RegExp; kind: AssessmentKind; label: string }> = [
  { re: /\bfinal\s+(?:exam(?:ination)?|test|assessment)\b/i, kind: "exam", label: "Final exam" },
  { re: /\bmid-?\s?terms?(?:\s+(?:exam(?:ination)?|test))?\b/i, kind: "midterm", label: "Midterm" },
  { re: /\bterm\s+tests?\b/i, kind: "midterm", label: "Term test" },
  { re: /\bexam(?:ination)?s?\b/i, kind: "exam", label: "Exam" },
  { re: /\bquiz(?:zes)?\b/i, kind: "quiz", label: "Quiz" },
  { re: /\btests?\b/i, kind: "quiz", label: "Test" },
  { re: /\b(?:final\s+)?projects?\b/i, kind: "project", label: "Project" },
  { re: /\bpresentations?\b/i, kind: "project", label: "Presentation" },
  { re: /\b(?:assignments?|homework|problem\s+sets?)\b/i, kind: "assignment", label: "Assignment" },
  { re: /\blab(?:oratory)?\s+reports?\b/i, kind: "assignment", label: "Lab report" },
  { re: /\blabs?\b/i, kind: "assignment", label: "Lab" },
  { re: /\b(?:essays?|papers?|reports?|reflections?|proposals?|case stud(?:y|ies))\b/i, kind: "assignment", label: "Paper" },
  { re: /\b(?:participation|attendance|engagement)\b/i, kind: "task", label: "Participation" },
];
const EXAM_LIKE = new Set<AssessmentKind>(["exam", "midterm", "quiz"]);

interface Candidate extends ParsedAssessment {
  key: string;
  fromGrading: boolean;
}

function titleFrom(line: string, start: number, cuts: Array<number | undefined>, fallback: string): string {
  const end = Math.min(line.length, ...cuts.filter((i): i is number => i !== undefined && i > start));
  let t = line.slice(start, end).replace(/[\s:,;|(-]+$/, "").trim();
  if ((t.match(/\(/g)?.length ?? 0) > (t.match(/\)/g)?.length ?? 0)) t = t.replace(/\s*\([^)]*$/, "");
  if (!t || t.length > 70) t = fallback;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export interface AssessmentScan {
  assessments: ParsedAssessment[];
  declaredTotal: number | null;
  gradingSectionFound: boolean;
}

export function findAssessments(lines: OutlineLine[], anchor: ISODate): AssessmentScan {
  const gradingSectionFound = lines.some((l) => l.section === "grading" && l.heading);
  let declaredTotal: number | null = null;
  const candidates: Candidate[] = [];

  lines.forEach((line, i) => {
    const text = line.text;
    if (line.heading || line.block || text.length > 220) return;
    if (line.section === "policy" || line.section === "materials" || line.section === "contact") return;
    if (POLICY.test(text) || HISTORICAL.test(text)) return;

    const inGrading = line.section === "grading";
    const total = inGrading ? TOTAL_ROW.exec(text) : null;
    if (total) {
      declaredTotal = Number(total[1]);
      return;
    }

    const hit = KINDS.map((k) => ({ ...k, m: k.re.exec(text) })).find((k) => k.m);
    if (!hit?.m) return;
    const range = findTimeRange(text);
    if (range && findDays(text).length > 0 && !EXAM_LIKE.has(hit.kind)) return; // a lab meeting line

    const each = findCountEach(text);
    let weight = each ? { weight: each.count * each.each, index: each.index } : findWeight(text);
    let date: DateMatch | null = findDate(text, anchor);
    for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
      const next = lines[j]!;
      if (next.heading || next.section !== line.section || KINDS.some((k) => k.re.test(next.text))) break;
      if (!weight && isOnlyWeight(next.text)) weight = { weight: Number(/[\d.]+/.exec(next.text)![0]), index: Infinity };
      else if (!date && next.text.length <= 32) {
        const d = findDate(next.text, anchor);
        if (d) date = { ...d, index: Infinity };
      }
    }
    if (!weight && !date) return;

    const after = text.slice(hit.m.index + hit.m[0].length);
    const number = /^\s*#?\s*(\d{1,2})\b/.exec(after)?.[1] ?? null;
    const time = EXAM_LIKE.has(hit.kind) || /\bdue\b|\bby\b/i.test(text) ? findTime(text) : null;
    const days = findDays(text);
    const kind: AssessmentKind = hit.label === "Test" && (weight?.weight ?? 0) >= 15 ? "midterm" : hit.kind;
    const optional = OPTIONAL.test(text);

    // With a grading section, only its weights count; others are shown, not summed.
    const trusted = !gradingSectionFound || inGrading;
    const flags: AssessmentFlag[] = [];
    if (optional) flags.push("optional");
    if (weight && !trusted) flags.push("outside-grading");

    const base = {
      kind,
      date: date?.date ?? null,
      week: date?.week ?? null,
      weekday: days.length === 1 ? days[0]! : null,
      time: time?.time ?? null,
      optional,
      source: text,
      fromGrading: inGrading,
    };
    // Keep a short leading qualifier: "Bonus quiz", "Optional essay", "Group project".
    const prefix = text.slice(0, hit.m.index).trim();
    const titleStart = prefix && prefix.length <= 20 && /^[A-Za-z][A-Za-z -]*$/.test(prefix) && !/\b(?:due|submit|week)\b/i.test(prefix) ? 0 : hit.m.index;
    const title = titleFrom(
      text,
      titleStart,
      [weight?.index, date?.index, each?.index, range?.index, time?.index, /\bdue\b/i.exec(text)?.index, text.indexOf(" | ")],
      `${hit.label}${number ? ` ${number}` : ""}`,
    );

    if (each && !number) {
      // "Quizzes (10 x 2%), best 8 of 10 count" → Quiz 1…10; 9 and 10 marked dropped.
      const best = BEST_OF.exec(text);
      const lowest = DROP_LOWEST.exec(text);
      const dropCount = best ? Math.max(0, Number(best[2]) - Number(best[1])) : lowest ? ({ one: 1, two: 2 } as Record<string, number>)[lowest[1] ?? ""] ?? Number(lowest[1] ?? 1) : 0;
      for (let n = 1; n <= each.count; n++) {
        const dropped = n > each.count - dropCount;
        candidates.push({
          ...base,
          id: newId(),
          title: `${hit.label} ${n}`,
          date: null,
          week: null,
          weight: trusted ? each.each : null,
          mentionedWeight: trusted ? null : each.each,
          flags: dropped ? [...flags, "dropped"] : [...flags],
          key: `${hit.label.toLowerCase()}|${n}`,
        });
      }
      return;
    }

    candidates.push({
      ...base,
      id: newId(),
      title,
      weight: trusted ? weight?.weight ?? null : null,
      mentionedWeight: trusted ? null : weight?.weight ?? null,
      flags,
      key: `${hit.label.toLowerCase()}|${number ?? ""}${optional ? "|optional" : ""}`,
    });
  });

  // One item per key: grading section supplies the weight, the schedule supplies dates.
  const merged = new Map<string, Candidate>();
  for (const c of candidates) {
    const e = merged.get(c.key);
    if (!e) {
      merged.set(c.key, { ...c, flags: [...c.flags] });
      continue;
    }
    e.date ??= c.date;
    e.week ??= c.week;
    e.weekday ??= c.weekday;
    e.time ??= c.time;
    if (e.weight === null && c.weight !== null) e.weight = c.weight;
    e.mentionedWeight ??= c.mentionedWeight;
    if (c.fromGrading && !e.fromGrading) {
      e.title = c.title;
      e.fromGrading = true;
    }
    for (const f of c.flags) if (!e.flags.includes(f)) e.flags.push(f);
  }

  const assessments = [...merged.values()].map(({ key: _k, fromGrading: _g, ...a }) => {
    // A counted weight makes an "outside-grading" note moot.
    const flags = a.flags.filter((f) => !(f === "outside-grading" && a.weight !== null));
    if (!a.date && a.week) flags.push("week-only");
    if (!a.date && !a.week && /\b(?:tba|tbd|to be (?:announced|determined|confirmed)|exam(?:ination)? period)\b/i.test(a.source)) flags.push("tba");
    return { ...a, flags };
  });
  assessments.sort((a, b) =>
    (a.date ?? "9999") < (b.date ?? "9999") ? -1 : (a.date ?? "9999") > (b.date ?? "9999") ? 1 : (b.weight ?? 0) - (a.weight ?? 0),
  );
  return { assessments, declaredTotal, gradingSectionFound };
}
