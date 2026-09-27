import { AlertTriangle, Check, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { KIND_LABEL } from "../../core/assessments";
import { formatDate } from "../../core/dates";
import { resolveAssessmentDate } from "../../core/outline/parseOutline";
import { codeToWeekday, describeDays, meetingRRule, normalizeDays, validateRecurrence } from "../../core/outline/recurrence";
import {
  DAY_CODES,
  type DayCode,
  type InstructorRole,
  type ParsedAssessment,
  type ParsedOutline,
  type RecurringMeeting,
} from "../../core/outline/types";
import { checkWeights, countsTowardTotal } from "../../core/outline/weights";
import { blankCourse } from "../../core/templates";
import { ASSESSMENT_KINDS, SESSION_KINDS, type AssessmentKind, type FieldErrors, type ID, type ISODate, type SessionKind } from "../../core/types";
import { newId, normalizeCode } from "../../core/validation";
import { Button } from "../../components/ui/Button";
import { cx } from "../../components/ui/cx";
import { Field, Input, Select } from "../../components/ui/Field";
import { useActiveCourses, useFormatTime } from "../../state/hooks";
import { useStore } from "../../state/store";
import { ColorPicker } from "../courses/CourseDialog";

/* ------------------------------------------------------------------ model */

interface ReviewMeeting extends RecurringMeeting {
  include: boolean;
}

interface ReviewAssessment extends ParsedAssessment {
  include: boolean;
  /** Date the student typed; wins over the parsed or week-derived date. */
  picked: ISODate | null;
}

type InstructorChoice = { kind: "candidate"; id: ID } | { kind: "custom"; name: string } | { kind: "none" };

const STEPS = ["Course & instructor", "Class schedule", "Assessment scheme", "Confirm"] as const;
type Step = 0 | 1 | 2 | 3;

const ROLE_LABEL: Record<InstructorRole, string> = {
  instructor: "Lecturer",
  coordinator: "Course coordinator",
  lab: "Lab",
  tutorial: "Tutorial",
  ta: "Teaching assistant",
  other: "Listed",
};

const DAY_SHORT: Record<DayCode, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };

/* ------------------------------------------------------------ small parts */

function SourceLine({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="mt-1 truncate text-[11px] text-muted" title={text}>
      From the outline: “{text}”
    </p>
  );
}

function Badge({ tone = "neutral", children }: { tone?: "neutral" | "warn" | "info"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "rounded px-1.5 py-0.5 text-[11px] font-medium",
        tone === "warn" ? "bg-warning/15 text-warning" : tone === "info" ? "bg-accent/12 text-accent" : "bg-surface-2 text-muted",
      )}
    >
      {children}
    </span>
  );
}

function SectionCard({ title, count, children }: { title: string; count?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">
        {title} {count ? <span className="font-normal text-muted">{count}</span> : null}
      </h3>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------- main view */

/**
 * Pre-import confirmation. Nothing is saved until the last step. The three
 * sections map one-to-one to what the parser found: who teaches (pick one),
 * when the class meets (weekly rules), and how it's graded (verified against
 * 100%). Everything can be edited or switched off.
 */
export function OutlineReview({
  outline,
  fileName,
  onCancel,
  onImported,
}: {
  outline: ParsedOutline;
  fileName: string;
  onCancel: () => void;
  onImported: () => void;
}) {
  const allCourses = useStore((s) => s.courses);
  const applyOutlineImport = useStore((s) => s.applyOutlineImport);
  const courses = useActiveCourses();
  const formatTime = useFormatTime();

  const matching = outline.course.code ? courses.find((c) => normalizeCode(c.code) === normalizeCode(outline.course.code!)) : undefined;

  const [step, setStep] = useState<Step>(0);
  const [target, setTarget] = useState<"new" | ID>(matching?.id ?? "new");
  const [code, setCode] = useState(outline.course.code ?? "");
  const [name, setName] = useState(outline.course.name ?? "");
  const [color, setColor] = useState(() => blankCourse(allCourses).color);
  const [instructor, setInstructor] = useState<InstructorChoice>(() => {
    const primary = outline.instructors.find((i) => i.role === "instructor" || i.role === "coordinator" || i.role === "other");
    return primary ? { kind: "candidate", id: primary.id } : { kind: "none" };
  });
  const [termStart, setTermStart] = useState<ISODate | "">(outline.termStart ?? "");
  const [termEnd, setTermEnd] = useState<ISODate | "">(outline.termEnd ?? "");
  const [meetings, setMeetings] = useState<ReviewMeeting[]>(() => outline.meetings.map((m) => ({ ...m, include: !m.oneOff })));
  const [items, setItems] = useState<ReviewAssessment[]>(() =>
    outline.assessments.map((a) => ({
      ...a,
      picked: null,
      include: Boolean(resolveAssessmentDate(a, outline.termStart)) && !a.flags.includes("dropped"),
    })),
  );
  const [weightsConfirmed, setWeightsConfirmed] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const dateOf = (a: ReviewAssessment) => a.picked ?? resolveAssessmentDate(a, termStart || null);
  const updateMeeting = (id: string, patch: Partial<ReviewMeeting>) => setMeetings((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const updateItem = (id: string, patch: Partial<ReviewAssessment>) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    // Any change to weights or selection needs a fresh confirmation.
    if ("weight" in patch || "include" in patch || "optional" in patch) setWeightsConfirmed(false);
  };

  /* --------------------------------------------------------- derived state */

  const chosenMeetings = meetings.filter((m) => m.include);
  const chosenItems = items.filter((a) => a.include);
  const weight = useMemo(() => checkWeights(chosenItems, outline.weightCheck.declaredTotal), [chosenItems, outline.weightCheck.declaredTotal]);
  const meetingProblems = new Map(
    chosenMeetings.map((m) => [m.id, validateRecurrence({ ...m, startDate: termStart || null, endDate: termEnd || null })] as const),
  );
  const undated = chosenItems.filter((a) => !dateOf(a));
  const instructorName =
    instructor.kind === "candidate" ? outline.instructors.find((i) => i.id === instructor.id)?.name ?? null : instructor.kind === "custom" ? instructor.name.trim() || null : null;

  const blockers: Array<{ step: Step; text: string }> = [];
  if (target === "new" && !code.trim()) blockers.push({ step: 0, text: "Enter a course code." });
  if (target === "new" && !name.trim()) blockers.push({ step: 0, text: "Enter a course name." });
  if (instructor.kind === "custom" && !instructor.name.trim()) blockers.push({ step: 0, text: "Type the instructor's name, or choose another option." });
  if (termStart && termEnd && termEnd < termStart) blockers.push({ step: 1, text: "The term has to end after it starts." });
  if ([...meetingProblems.values()].some((p) => p.length)) blockers.push({ step: 1, text: "Fix the highlighted class times." });
  if (undated.length) blockers.push({ step: 2, text: `${undated.length} selected ${undated.length === 1 ? "assessment needs" : "assessments need"} a date.` });
  if (weight.status === "over" && !weightsConfirmed) blockers.push({ step: 2, text: `Weights add up to ${weight.total}%. Adjust them or confirm they're right.` });
  if (target !== "new" && chosenMeetings.length === 0 && chosenItems.length === 0) blockers.push({ step: 1, text: "Select at least one class time or assessment to add." });

  const stepIssues = (s: Step) => blockers.filter((b) => b.step === s).length + (s === 0 && errors.code ? 1 : 0);

  /* ------------------------------------------------------------------ save */

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      const result = await applyOutlineImport({
        target:
          target === "new"
            ? {
                mode: "new",
                course: { ...blankCourse(allCourses), code, name, instructor: instructorName, color, termStart: termStart || null, termEnd: termEnd || null },
              }
            : { mode: "existing", courseId: target },
        meetings: chosenMeetings.map((m) => ({
          id: newId(),
          days: normalizeDays(m.daysOfWeek).map(codeToWeekday),
          start: m.startTime,
          end: m.endTime,
          kind: m.kind,
          location: m.location,
        })),
        assessments: chosenItems.map((a) => {
          const counted = countsTowardTotal(a);
          return {
            // Bonus and dropped items are saved without a weight, so the
            // course's grade total stays at 100%; the title keeps the context.
            title: counted || /\b(bonus|optional|extra)\b/i.test(a.title) ? a.title : `${a.title} (${a.optional ? "bonus" : "not counted"})`,
            kind: a.kind,
            dueDate: dateOf(a) ?? "",
            dueTime: a.time,
            priority: a.kind === "exam" || a.kind === "midterm" ? ("high" as const) : ("medium" as const),
            weight: counted ? a.weight : null,
            status: "todo" as const,
            grade: null,
            notes: "",
          };
        }),
      });
      if (result.ok) onImported();
      else {
        setErrors(result.errors);
        const keys = Object.keys(result.errors);
        setStep(keys.some((k) => k.startsWith("assessments.")) ? 2 : keys.some((k) => k.startsWith("schedule.")) ? 1 : 0);
      }
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------------------------------------ view */

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
        <p>
          Read on this device from <span className="font-medium">{fileName}</span>. The file wasn't uploaded or saved, and its text has
          been discarded. Nothing is added to your calendar until you confirm.
        </p>
      </div>

      <ol className="grid grid-cols-4 gap-1" aria-label="Import steps">
        {STEPS.map((label, i) => {
          const s = i as Step;
          const issues = s < 3 ? stepIssues(s) : 0;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => setStep(s)}
                aria-current={step === s ? "step" : undefined}
                className={cx(
                  "flex w-full flex-col items-start gap-1 rounded-lg border-t-2 px-1 pt-2 text-left text-xs",
                  step === s ? "border-accent text-text" : "border-border text-muted hover:text-text",
                )}
              >
                <span className="flex items-center gap-1 font-semibold">
                  {issues > 0 ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-label={`${issues} to fix`} />
                  ) : s < step ? (
                    <Check className="h-3.5 w-3.5 text-success" aria-hidden />
                  ) : (
                    <span className="tabular-nums">{i + 1}.</span>
                  )}
                  <span className="hidden sm:inline">{label}</span>
                </span>
                <span className="sm:hidden">{label.split(" ")[0]}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {errors.form ? <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{errors.form}</p> : null}

      {step === 0 ? (
        <>
          <SectionCard title="Course">
            <Field label="Add to">
              {(p) => (
                <Select {...p} value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="new">A new course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}: {c.name}
                      {c.id === matching?.id ? " (matches this outline)" : ""}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {target === "new" ? (
              <>
                <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                  <Field label="Code" error={errors.code}>
                    {(p) => <Input {...p} value={code} onChange={(e) => setCode(e.target.value)} placeholder="CPS 109" />}
                  </Field>
                  <Field label="Name" error={errors.name}>
                    {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Computer Science I" />}
                  </Field>
                </div>
                <ColorPicker value={color} onChange={setColor} error={errors.color} />
              </>
            ) : null}
          </SectionCard>

          <SectionCard title="Your instructor" count={outline.instructors.length > 1 ? `${outline.instructors.length} people found` : undefined}>
            {target !== "new" ? (
              <p className="text-sm text-muted">The existing course keeps its instructor. Pick “A new course” above to set one.</p>
            ) : (
              <div role="radiogroup" aria-label="Instructor" className="flex flex-col gap-2">
                {outline.instructors.map((c) => {
                  const on = instructor.kind === "candidate" && instructor.id === c.id;
                  return (
                    <label key={c.id} className={cx("flex cursor-pointer items-start gap-3 rounded-xl border p-3", on ? "border-accent bg-accent/5" : "border-border hover:border-muted")}>
                      <input
                        type="radio"
                        name="instructor"
                        checked={on}
                        onChange={() => setInstructor({ kind: "candidate", id: c.id })}
                        className="mt-1 h-4 w-4 accent-[rgb(var(--c-accent))]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{c.name}</span>
                          <Badge tone={c.role === "instructor" || c.role === "coordinator" ? "info" : "neutral"}>{ROLE_LABEL[c.role]}</Badge>
                          {c.section ? <Badge>Section {c.section}</Badge> : null}
                        </span>
                        <SourceLine text={c.source} />
                      </span>
                    </label>
                  );
                })}
                <label className={cx("flex cursor-pointer items-center gap-3 rounded-xl border p-3", instructor.kind === "custom" ? "border-accent bg-accent/5" : "border-border hover:border-muted")}>
                  <input
                    type="radio"
                    name="instructor"
                    checked={instructor.kind === "custom"}
                    onChange={() => setInstructor({ kind: "custom", name: instructor.kind === "custom" ? instructor.name : "" })}
                    className="h-4 w-4 accent-[rgb(var(--c-accent))]"
                  />
                  <span className="text-sm">Someone else</span>
                  {instructor.kind === "custom" ? (
                    <Input autoFocus aria-label="Instructor name" value={instructor.name} onChange={(e) => setInstructor({ kind: "custom", name: e.target.value })} className="flex-1" />
                  ) : null}
                </label>
                <label className={cx("flex cursor-pointer items-center gap-3 rounded-xl border p-3", instructor.kind === "none" ? "border-accent bg-accent/5" : "border-border hover:border-muted")}>
                  <input type="radio" name="instructor" checked={instructor.kind === "none"} onChange={() => setInstructor({ kind: "none" })} className="h-4 w-4 accent-[rgb(var(--c-accent))]" />
                  <span className="text-sm">Leave blank</span>
                </label>
              </div>
            )}
          </SectionCard>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <SectionCard title="Term">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First day of classes" hint="Also places “Week 7” assessments">
                {(p) => <Input {...p} type="date" value={termStart} onChange={(e) => setTermStart(e.target.value)} />}
              </Field>
              <Field label="Last day of classes" hint="Weekly classes stop after this">
                {(p) => <Input {...p} type="date" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} />}
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Weekly classes" count={`${chosenMeetings.length} of ${meetings.length} selected`}>
            {meetings.length === 0 ? <p className="text-sm text-muted">No class times were found. You can add them to the course afterwards.</p> : null}
            {meetings.map((m) => {
              const problems = m.include ? meetingProblems.get(m.id) ?? [] : [];
              const rrule = meetingRRule(m, termEnd || null);
              return (
                <div key={m.id} className={cx("rounded-xl border p-3", !m.include ? "border-dashed border-border opacity-60" : problems.length ? "border-danger" : "border-border")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      checked={m.include}
                      onChange={(e) => updateMeeting(m.id, { include: e.target.checked })}
                      aria-label={`Include ${m.kind}, ${describeDays(m.daysOfWeek)}`}
                      className="h-4 w-4 accent-[rgb(var(--c-accent))]"
                    />
                    <span className="text-sm font-medium">
                      {describeDays(m.daysOfWeek)}, {formatTime(m.startTime)}–{formatTime(m.endTime)}
                    </span>
                    {m.oneOff ? <Badge tone="warn">Only on {m.startDate ? formatDate(m.startDate) : "one date"}</Badge> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Repeats on">
                    {DAY_CODES.map((d) => {
                      const on = m.daysOfWeek.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          onClick={() => updateMeeting(m.id, { daysOfWeek: normalizeDays(on ? m.daysOfWeek.filter((x) => x !== d) : [...m.daysOfWeek, d]) })}
                          className={cx("h-7 min-w-10 rounded-md px-1.5 text-xs font-medium", on ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted")}
                        >
                          {DAY_SHORT[d]}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Input type="time" aria-label="Start" value={m.startTime} onChange={(e) => updateMeeting(m.id, { startTime: e.target.value })} />
                    <Input type="time" aria-label="End" value={m.endTime} onChange={(e) => updateMeeting(m.id, { endTime: e.target.value })} />
                    <Select aria-label="Type" value={m.kind} onChange={(e) => updateMeeting(m.id, { kind: e.target.value as SessionKind })}>
                      {SESSION_KINDS.map((k) => (
                        <option key={k} value={k}>{k[0]!.toUpperCase() + k.slice(1)}</option>
                      ))}
                    </Select>
                    <Input aria-label="Room" placeholder="Room" value={m.location ?? ""} onChange={(e) => updateMeeting(m.id, { location: e.target.value || null })} />
                  </div>
                  {problems.length ? <p className="mt-1 text-xs text-danger">{problems[0]}</p> : null}
                  <p className="mt-1 font-mono text-[11px] text-muted" title="iCalendar recurrence rule">{rrule}</p>
                  <SourceLine text={m.source} />
                </div>
              );
            })}
          </SectionCard>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <WeightPanel
            check={weight}
            gradingSectionFound={outline.gradingSectionFound}
            confirmed={weightsConfirmed}
            onConfirm={setWeightsConfirmed}
            excluded={chosenItems.filter((a) => !countsTowardTotal(a)).length}
          />
          <SectionCard title="Assessments" count={`${chosenItems.length} of ${items.length} selected`}>
            {items.length === 0 ? <p className="text-sm text-muted">No graded work was found.</p> : null}
            {items.map((a, idx) => {
              const date = dateOf(a);
              const serverError = Object.entries(errors).find(([k]) => k.startsWith(`assessments.${chosenItems.indexOf(a)}.`))?.[1];
              return (
                <div key={a.id} className={cx("rounded-xl border p-3", a.include ? "border-border" : "border-dashed border-border opacity-60")}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={a.include}
                      onChange={(e) => updateItem(a.id, { include: e.target.checked })}
                      aria-label={`Include ${a.title}`}
                      className="h-4 w-4 shrink-0 accent-[rgb(var(--c-accent))]"
                    />
                    <Input aria-label={`Title of item ${idx + 1}`} value={a.title} onChange={(e) => updateItem(a.id, { title: e.target.value })} className="font-medium" />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.optional ? <Badge tone="info">Bonus / optional</Badge> : null}
                    {a.flags.includes("dropped") ? <Badge>Dropped (best-of)</Badge> : null}
                    {a.flags.includes("tba") ? <Badge tone="warn">Date TBA</Badge> : null}
                    {a.week && !a.date ? <Badge>Week {a.week}</Badge> : null}
                    {a.mentionedWeight !== null ? <Badge tone="warn">{a.mentionedWeight}% mentioned outside the grading table, not counted</Badge> : null}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Select aria-label="Type" value={a.kind} onChange={(e) => updateItem(a.id, { kind: e.target.value as AssessmentKind })}>
                      {ASSESSMENT_KINDS.map((k) => (
                        <option key={k} value={k}>{KIND_LABEL[k]}</option>
                      ))}
                    </Select>
                    <Input
                      type="date"
                      aria-label="Due date"
                      aria-invalid={a.include && !date}
                      value={date ?? ""}
                      onChange={(e) => updateItem(a.id, { picked: e.target.value || null, include: a.include || Boolean(e.target.value) })}
                    />
                    <Input type="time" aria-label="Time" value={a.time ?? ""} onChange={(e) => updateItem(a.id, { time: e.target.value || null })} />
                    <div className="relative">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step="0.5"
                        aria-label="Weight percent"
                        value={a.weight ?? ""}
                        onChange={(e) => updateItem(a.id, { weight: e.target.value === "" ? null : Number(e.target.value) })}
                        className="pr-7"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
                    </div>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={!a.optional}
                      onChange={(e) =>
                        updateItem(a.id, {
                          optional: !e.target.checked,
                          flags: e.target.checked ? a.flags.filter((f) => f !== "optional" && f !== "dropped") : [...a.flags.filter((f) => f !== "optional"), "optional"],
                        })
                      }
                      className="h-3.5 w-3.5 accent-[rgb(var(--c-accent))]"
                    />
                    Counts toward the 100%
                  </label>
                  <p className={cx("mt-1 text-xs", serverError || (a.include && !date) ? "text-danger" : "text-muted")}>
                    {serverError ??
                      (date
                        ? `${formatDate(date)}${!a.date && !a.picked && a.week ? ` (week ${a.week})` : ""}`
                        : a.flags.includes("tba")
                          ? "Date to be announced: pick one when it's set, or leave unticked."
                          : a.week
                            ? `Week ${a.week}: set the first day of classes in step 2 to place it.`
                            : "Pick a date to include this.")}
                  </p>
                  <SourceLine text={a.source} />
                </div>
              );
            })}
          </SectionCard>
        </>
      ) : null}

      {step === 3 ? (
        <Summary
          courseLabel={target === "new" ? `${code || "New course"}${name ? `: ${name}` : ""}` : courses.find((c) => c.id === target)?.code ?? ""}
          isNew={target === "new"}
          instructor={instructorName}
          meetings={chosenMeetings.map((m) => `${describeDays(m.daysOfWeek)}, ${formatTime(m.startTime)}–${formatTime(m.endTime)} (${m.kind}${m.location ? `, ${m.location}` : ""})`)}
          term={termStart || termEnd ? `${termStart ? formatDate(termStart) : "?"} to ${termEnd ? formatDate(termEnd) : "end of term not set"}` : null}
          assessments={chosenItems.length}
          weight={weight}
          blockers={blockers}
          onGoTo={setStep}
          outlineWarnings={outline.warnings}
        />
      ) : null}

      <div className="sticky bottom-0 -mx-5 -mb-4 flex items-center justify-between gap-2 border-t border-border bg-surface px-5 py-3">
        <Button variant="ghost" onClick={step === 0 ? onCancel : () => setStep((step - 1) as Step)}>
          {step === 0 ? "Cancel" : (<><ChevronLeft className="h-4 w-4" /> Back</>)}
        </Button>
        {step < 3 ? (
          <Button variant="primary" onClick={() => setStep((step + 1) as Step)}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="primary" disabled={saving || blockers.length > 0} onClick={() => void save()}>
            {target === "new" ? "Create course" : "Add to course"}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- weight check */

function WeightPanel({
  check,
  gradingSectionFound,
  confirmed,
  onConfirm,
  excluded,
}: {
  check: ReturnType<typeof checkWeights>;
  gradingSectionFound: boolean;
  confirmed: boolean;
  onConfirm: (v: boolean) => void;
  excluded: number;
}) {
  const tone = check.status === "exact" ? "success" : check.status === "over" ? "danger" : "warning";
  // Full class names, so Tailwind's scanner can see them.
  const TEXT = { success: "text-success", danger: "text-danger", warning: "text-warning" } as const;
  const BAR = { success: "bg-success", danger: "bg-danger", warning: "bg-warning" } as const;
  const pct = Math.min(100, check.total);
  return (
    <section aria-label="Weight check" className={cx("rounded-xl border p-4", tone === "success" ? "border-success/40 bg-success/5" : tone === "danger" ? "border-danger/40 bg-danger/5" : "border-warning/40 bg-warning/5")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Grade weights</h3>
        <span className={cx("text-lg font-semibold tabular-nums", TEXT[tone])}>{check.total}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={check.total} aria-label="Total weight">
        <div className={cx("h-full rounded-full", BAR[tone])} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm">
        {check.status === "exact"
          ? "Adds up to exactly 100%."
          : check.status === "over"
            ? `${check.difference}% over 100%. Untick duplicates, mark bonus work as not counting, or correct a weight.`
            : check.status === "under"
              ? `${-check.difference}% short of 100%. Something from the grading table may be missing; you can still save.`
              : "No weights selected."}
        {check.declaredTotal !== null && Math.abs(check.declaredTotal - check.total) > 0.01 ? ` The outline's own total row says ${check.declaredTotal}%.` : ""}
      </p>
      <p className="mt-1 text-xs text-muted">
        {gradingSectionFound ? "Weights come from the outline's Evaluation / Grading section." : "No grading section was recognised; weights were collected from the whole outline."}
        {excluded ? ` ${excluded} selected ${excluded === 1 ? "item doesn't" : "items don't"} count toward the total and will be saved without a weight.` : ""}
      </p>
      {check.status === "over" ? (
        <label className="mt-3 flex items-start gap-2 text-sm font-medium">
          <input type="checkbox" checked={confirmed} onChange={(e) => onConfirm(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-danger))]" />
          I've checked these weights against the outline. Save them anyway.
        </label>
      ) : null}
    </section>
  );
}

/* --------------------------------------------------------------- summary */

function Summary(props: {
  courseLabel: string;
  isNew: boolean;
  instructor: string | null;
  meetings: string[];
  term: string | null;
  assessments: number;
  weight: ReturnType<typeof checkWeights>;
  blockers: Array<{ step: Step; text: string }>;
  onGoTo: (s: Step) => void;
  outlineWarnings: string[];
}) {
  const row = (label: string, value: ReactNode, s: Step) => (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-0">
      <dt className="w-32 shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm">{value}</dd>
      <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => props.onGoTo(s)}>Edit</button>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      {props.blockers.length ? (
        <div role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          <p className="font-medium">Before saving:</p>
          <ul className="mt-1 flex flex-col gap-1">
            {props.blockers.map((b) => (
              <li key={b.text}>
                <button type="button" className="text-left underline" onClick={() => props.onGoTo(b.step)}>
                  {b.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-xl bg-success/10 px-4 py-3 text-sm">Everything checks out. You can undo the import right after saving.</p>
      )}
      <dl className="rounded-xl border border-border px-4">
        {row(props.isNew ? "New course" : "Adding to", props.courseLabel, 0)}
        {props.isNew ? row("Instructor", props.instructor ?? <span className="text-muted">Not set</span>, 0) : null}
        {row("Term", props.term ?? <span className="text-muted">Not set</span>, 1)}
        {row(
          "Weekly classes",
          props.meetings.length ? (
            <ul className="flex flex-col gap-0.5">{props.meetings.map((m) => <li key={m}>{m}</li>)}</ul>
          ) : (
            <span className="text-muted">None</span>
          ),
          1,
        )}
        {row(
          "Assessments",
          <>
            {props.assessments} {props.assessments === 1 ? "item" : "items"}
            {props.weight.total > 0 ? (
              <span className={cx("ml-2 tabular-nums", props.weight.status === "exact" ? "text-success" : props.weight.status === "over" ? "text-danger" : "text-warning")}>
                {props.weight.total}% of the grade
              </span>
            ) : null}
          </>,
          2,
        )}
      </dl>
      {props.outlineWarnings.length ? (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">What the parser flagged ({props.outlineWarnings.length})</summary>
          <ul className="mt-1 list-disc pl-5">{props.outlineWarnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}
