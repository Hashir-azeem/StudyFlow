import { normalizeLines } from "./text";

/**
 * Section-aware view of an outline. Outlines are documents with structure:
 * a grading table, a weekly schedule, policies, a textbook list. Knowing which
 * one a line sits in is what separates "Midterm 30%" in the Evaluation table
 * from "missed midterms (30%) need documentation" in the policies.
 */
export type SectionKind = "header" | "grading" | "schedule" | "policy" | "materials" | "contact" | "other";
/** Short labelled blocks that swallow the next few lines, e.g. "Office Hours:" then the times. */
export type BlockKind = "office-hours" | "materials" | null;

export interface OutlineLine {
  text: string;
  section: SectionKind;
  block: BlockKind;
  /** True for a heading line itself. */
  heading: boolean;
}

const NUMBERING = /^(?:(?:section|part|unit)\s+)?(?:\d+(?:\.\d+)*|[ivx]+|[a-h])[.)]?\s+/i;

const SECTION_HEADINGS: Array<[RegExp, SectionKind]> = [
  [/^(?:course\s+)?(?:evaluation|grading|assessments?|marking)(?:\s+(?:scheme|criteria|breakdown|methods?|components?|summary|and\s+grading|weights?|policy))?$/i, "grading"],
  [/^(?:grade\s+(?:breakdown|distribution|composition)|methods?\s+of\s+(?:evaluation|assessment)|course\s+requirements\s+and\s+evaluation|how\s+you\s+will\s+be\s+(?:graded|assessed|evaluated))$/i, "grading"],
  [/^(?:(?:weekly|course|tentative|class|lecture|topic)\s+)*(?:schedule|calendar|timeline|topics|outline\s+of\s+topics|course\s+outline|important\s+dates)$/i, "schedule"],
  [/^(?:required|recommended|optional|course)?\s*(?:text\s*books?|texts?|readings?|materials?|resources|software)(?:\s+and\s+\w+)?$/i, "materials"],
  [/^(?:(?:course|university|academic|departmental|faculty)\s+)?(?:polic(?:y|ies)|academic\s+(?:integrity|consideration|accommodation)|accommodations?|accessibility|missed\s+(?:work|term\s+work|assessments?|exams?)|late\s+(?:work|submissions?|policy)|attendance(?:\s+policy)?|email\s+policy|student\s+conduct|plagiarism|important\s+notes?|regrades?|grade\s+appeals?|religious\s+observance|student\s+support.*)$/i, "policy"],
  [/^(?:contact(?:\s+information)?|instructors?(?:\s+information)?|teaching\s+team|course\s+(?:staff|team)|office\s+hours|student\s+hours|who\s+to\s+contact)$/i, "contact"],
];

const OFFICE_HOURS = /\b(?:office|student|consultation|drop-?in)\s+hours?\b|\boffice\s*hrs?\b|\bOH\s*:/i;
const MATERIALS_LABEL = /^(?:required|recommended|optional)?\s*(?:text\s*books?|readings?|course\s+materials?)\s*:/i;
/** Another "Label:" line ends a block. */
const LABEL_LINE = /^[A-Za-z][A-Za-z /&()-]{1,40}:\s*\S?/;

function classifyHeading(text: string): SectionKind | null {
  const bare = text.replace(NUMBERING, "").replace(/[:.]\s*$/, "").trim();
  if (!bare || bare.length > 60 || /\d/.test(bare) || /%/.test(text)) return null;
  for (const [re, kind] of SECTION_HEADINGS) if (re.test(bare)) return kind;
  // Unknown headings still end the current section, but only unmistakable ones:
  // numbered ("5. Course Description"), ALL CAPS, or a label on its own line.
  const numbered = NUMBERING.test(text);
  const allCaps = bare.length >= 4 && bare === bare.toUpperCase() && /[A-Z]{3}/.test(bare);
  const colonOnly = /:\s*$/.test(text) && bare.split(/\s+/).length <= 5;
  return numbered || allCaps || colonOnly ? "other" : null;
}

export function segmentOutline(raw: string): OutlineLine[] {
  const out: OutlineLine[] = [];
  let section: SectionKind = "header";
  let block: BlockKind = null;
  let blockLeft = 0;

  for (const text of normalizeLines(raw)) {
    const kind = classifyHeading(text);
    if (kind) {
      section = kind;
      block = kind === "contact" && OFFICE_HOURS.test(text) ? "office-hours" : null;
      blockLeft = block ? 4 : 0;
      out.push({ text, section, block, heading: true });
      continue;
    }

    if (OFFICE_HOURS.test(text)) {
      block = "office-hours";
      // The label line plus up to three continuation lines ("Tue 2-3pm, JOR 1102").
      blockLeft = 4;
    } else if (MATERIALS_LABEL.test(text)) {
      block = "materials";
      blockLeft = 4;
    } else if (block && (LABEL_LINE.test(text) || blockLeft <= 0)) {
      block = null;
    }

    out.push({ text, section, block, heading: false });
    if (block) blockLeft -= 1;
    if (blockLeft <= 0) block = null;
  }
  return out;
}
