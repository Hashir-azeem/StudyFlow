import { newId } from "../validation";
import type { OutlineLine } from "./sections";
import type { InstructorCandidate, InstructorRole } from "./types";

/**
 * Everyone named with a teaching role, so the student can pick their own
 * lecturer instead of the parser guessing. Most specific labels are tried first
 * ("Lab Instructor" is a lab role, not a course instructor).
 */
const ROLE_LABELS: Array<[RegExp, InstructorRole]> = [
  [/\blab(?:oratory)?\s+(?:instructors?|coordinators?|demonstrators?|supervisors?|leads?)\b/i, "lab"],
  [/\btutorial\s+(?:leaders?|instructors?|facilitators?|assistants?)\b/i, "tutorial"],
  [/\b(?:teaching|graduate)\s+assistants?\b/i, "ta"],
  // Case-sensitive on purpose: "TA" the role, not "ta" in a word.
  [/\b(?:TAs?|GAs?)\b/, "ta"],
  [/\bcourse\s+(?:directors?|coordinators?|leads?)\b/i, "coordinator"],
  [/\b(?:co-?)?instructors?\b|\bprofessors?\b|\blecturers?\b|\bfaculty\b|\btaught\s+by\b/i, "instructor"],
];

const RANK: Record<InstructorRole, number> = { instructor: 0, coordinator: 1, other: 2, lab: 3, tutorial: 4, ta: 5 };

/** Words that look like capitalised names in outlines but aren't people. */
const NOT_NAME = new Set(
  "office hours room email phone section course lecture lectures lab labs tutorial tutorials tba tbd monday tuesday wednesday thursday friday saturday sunday department university faculty school zoom online contact information instructor instructors professor ta tas assistant assistants coordinator the and or for of to by via see d2l brightspace".split(" "),
);

function cleanPerson(raw: string): string | null {
  const s = raw
    .replace(/\S+@\S+/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(?:dr|prof|professor|mr|ms|mrs|mx)\.?\s+/gi, "")
    .replace(/\b(?:ph\.?d|m\.?sc|b\.?sc|m\.?a)\.?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const m = /^([A-Z][A-Za-z'’-]+(?:\s+(?:[A-Z]\.|[A-Z][A-Za-z'’-]+)){0,3})/.exec(s);
  if (!m) return null;
  const words = m[1]!.split(/\s+/);
  if (words.some((w) => NOT_NAME.has(w.toLowerCase().replace(/\.$/, "")))) return null;
  return m[1]!.length >= 3 ? m[1]! : null;
}

/** "Dr. A (Section 011) and Prof. B (Section 021)" → two people with sections. */
function splitPeople(text: string): Array<{ name: string; section: string | null }> {
  const cutAt = text.search(/\b(?:office|email|e-mail|phone|tel|ext\.?)\b\s*[:\d]/i);
  const body = cutAt >= 0 ? text.slice(0, cutAt) : text;
  const parts = body.split(/\s*(?:;|\/|&|\band\b|,(?!\s*(?:jr|sr|ph\.?d)\b))\s*/i);
  const people: Array<{ name: string; section: string | null }> = [];
  for (const part of parts) {
    const name = cleanPerson(part);
    if (!name) continue;
    const section = /\b(?:section|sec\.?)\s*(\d{1,3}[A-Z]?)\b/i.exec(part)?.[1] ?? null;
    people.push({ name, section });
  }
  return people;
}

export function findInstructors(lines: OutlineLine[]): InstructorCandidate[] {
  const found: InstructorCandidate[] = [];
  const add = (name: string, role: InstructorRole, section: string | null, source: string) =>
    found.push({ id: newId(), name, role, section, source });

  lines.forEach((line, i) => {
    if (line.section === "policy" || line.section === "materials" || line.block) return;
    const hit = ROLE_LABELS.map(([re, role]) => ({ role, m: re.exec(line.text) })).find((h) => h.m);

    if (hit?.m) {
      // What follows the label decides how to read it:
      //   "Instructors: Dr. A and Prof. B"  → a list
      //   "Instructor | Dr. A" (table row)   → a list
      //   "Taught by Dr. A"                  → a list
      //   "Instructors:" alone               → names on the next lines
      //   "Instructors may grant extensions" → prose, ignored
      const after = line.text.slice(hit.m.index + hit.m[0].length);
      const labelled = /^\s*(?:\(s\))?\s*(?:names?\s*)?[:|–-]\s*/.exec(after);
      let rest: string;
      if (labelled) rest = after.slice(labelled[0].length);
      else if (/^\s*$/.test(after)) rest = "";
      else if (/^\s+(?:dr|prof)\.?\s/i.test(after)) rest = after;
      else return;
      const sectionOnLine = /\b(?:section|sec\.?)\s*(\d{1,3}[A-Z]?)\b/i.exec(line.text.slice(0, hit.m.index))?.[1] ?? null;
      const people = splitPeople(rest);
      // Label on its own line; names follow on the next lines.
      if (people.length === 0 && rest.trim() === "") {
        for (let j = i + 1; j <= i + 4 && j < lines.length; j++) {
          const next = lines[j]!;
          if (next.heading || ROLE_LABELS.some(([re]) => re.test(next.text)) || /^[A-Za-z ]{2,30}:/.test(next.text)) break;
          const more = splitPeople(next.text);
          if (more.length === 0) break;
          more.forEach((p) => add(p.name, hit.role, p.section ?? sectionOnLine, next.text));
        }
        return;
      }
      people.forEach((p) => add(p.name, hit.role, p.section ?? sectionOnLine, line.text));
      return;
    }

    // Unlabelled "Dr. Name" / "Prof. Name" near the top or in the contact section.
    if (line.section === "header" || line.section === "contact") {
      for (const m of line.text.matchAll(/\b(?:Dr|Prof)\.?\s+([A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,2})/g)) {
        const name = cleanPerson(m[1]!);
        if (name) add(name, "other", /\bsection\s*(\d{1,3}[A-Z]?)\b/i.exec(line.text)?.[1] ?? null, line.text);
      }
    }
  });

  // Same person listed twice (title block and contact table): keep the most specific role.
  const byName = new Map<string, InstructorCandidate>();
  for (const c of found) {
    const key = c.name.toLowerCase();
    const prev = byName.get(key);
    if (!prev) byName.set(key, c);
    else {
      if (prev.role === "other" && c.role !== "other") prev.role = c.role;
      prev.section ??= c.section;
    }
  }
  return [...byName.values()].sort((a, b) => RANK[a.role] - RANK[b.role]);
}
