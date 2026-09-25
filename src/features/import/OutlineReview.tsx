import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { KIND_LABEL } from "../../core/assessments";
import { formatDate, weekdayShort } from "../../core/dates";
import { resolveAssessmentDate } from "../../core/outline/parseOutline";
import type { ParsedAssessment, ParsedMeeting, ParsedOutline } from "../../core/outline/types";
import { blankCourse } from "../../core/templates";
import {
  ASSESSMENT_KINDS,
  SESSION_KINDS,
  type AssessmentKind,
  type FieldErrors,
  type ID,
  type ISODate,
  type SessionKind,
  type Weekday,
} from "../../core/types";
import { newId, normalizeCode } from "../../core/validation";
import { Button } from "../../components/ui/Button";
import { cx } from "../../components/ui/cx";
import { Field, Input, Select } from "../../components/ui/Field";
import { useActiveCourses, useFormatTime } from "../../state/hooks";
import { useStore } from "../../state/store";
import { ColorPicker } from "../courses/CourseDialog";

const DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

interface ReviewMeeting extends ParsedMeeting {
  include: boolean;
}

interface ReviewAssessment extends ParsedAssessment {
  include: boolean;
  /** Date the student typed; wins over the parsed or week-derived date. */
  picked: ISODate | null;
}

function SourceLine({ text }: { text: string }) {
  return (
    <p className="mt-1 truncate text-[11px] text-muted" title={text}>
      From the outline: “{text}”
    </p>
  );
}

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

  const matching = outline.course.code
    ? courses.find((c) => normalizeCode(c.code) === normalizeCode(outline.course.code!))
    : undefined;

  const [target, setTarget] = useState<"new" | ID>(matching?.id ?? "new");
  const [code, setCode] = useState(outline.course.code ?? "");
  const [name, setName] = useState(outline.course.name ?? "");
  const [instructor, setInstructor] = useState(outline.course.instructor ?? "");
  const [color, setColor] = useState(() => blankCourse(allCourses).color);
  const [termStart, setTermStart] = useState<ISODate | "">(outline.termStart ?? "");
  const [termEnd, setTermEnd] = useState<ISODate | "">(outline.termEnd ?? "");
  const [meetings, setMeetings] = useState<ReviewMeeting[]>(() => outline.meetings.map((m) => ({ ...m, include: true })));
  const [items, setItems] = useState<ReviewAssessment[]>(() =>
    outline.assessments.map((a) => ({
      ...a,
      picked: null,
      include: Boolean(resolveAssessmentDate(a, outline.termStart)),
    })),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const dateOf = (a: ReviewAssessment) => a.picked ?? resolveAssessmentDate(a, termStart || null);
  const updateMeeting = (id: string, patch: Partial<ReviewMeeting>) => setMeetings((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const updateItem = (id: string, patch: Partial<ReviewAssessment>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const chosenMeetings = meetings.filter((m) => m.include);
  const chosenItems = items.filter((a) => a.include);
  const weightTotal = useMemo(() => chosenItems.reduce((sum, a) => sum + (a.weight ?? 0), 0), [chosenItems]);
  const needsDate = chosenItems.filter((a) => !dateOf(a)).length;
  const nothingChosen = chosenMeetings.length === 0 && chosenItems.length === 0 && target !== "new";

  async function importNow() {
    setSaving(true);
    setErrors({});
    try {
      const plan = {
        target:
          target === "new"
            ? {
                mode: "new" as const,
                course: {
                  ...blankCourse(allCourses),
                  code,
                  name,
                  instructor: instructor || null,
                  color,
                  termStart: termStart || null,
                  termEnd: termEnd || null,
                },
              }
            : { mode: "existing" as const, courseId: target },
        meetings: chosenMeetings.map((m) => ({ id: newId(), days: m.days, start: m.start, end: m.end, kind: m.kind, location: m.location })),
        assessments: chosenItems.map((a) => ({
          title: a.title,
          kind: a.kind,
          dueDate: dateOf(a) ?? "",
          dueTime: a.time,
          priority: a.kind === "exam" || a.kind === "midterm" ? ("high" as const) : ("medium" as const),
          weight: a.weight,
          status: "todo" as const,
          grade: null,
          // Source lines stay out of saved notes: only the approved fields are kept.
          notes: "",
        })),
      };
      const result = await applyOutlineImport(plan);
      if (result.ok) onImported();
      else setErrors(result.errors);
    } finally {
      setSaving(false);
    }
  }

  // Map store error keys ("assessments.3.dueDate") back to the visible rows.
  const itemError = (row: ReviewAssessment) => {
    const index = chosenItems.indexOf(row);
    if (index < 0) return undefined;
    return Object.entries(errors).find(([k]) => k.startsWith(`assessments.${index}.`))?.[1];
  };
  const scheduleError = Object.entries(errors).find(([k]) => k.startsWith("schedule."))?.[1];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
        <p>
          Read on this device from <span className="font-medium">{fileName}</span>. The file wasn't uploaded or saved, and
          its text has been discarded. Only the items you approve below are kept.
        </p>
      </div>

      {outline.warnings.length ? (
        <ul className="flex flex-col gap-1 rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">
          {outline.warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      {errors.form ? <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{errors.form}</p> : null}

      {/* ---------------------------------------------------------- course */}
      <section aria-labelledby="import-course" className="flex flex-col gap-3">
        <h3 id="import-course" className="text-sm font-semibold">Course</h3>
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
            <Field label="Instructor" hint="Optional">
              {(p) => <Input {...p} value={instructor} onChange={(e) => setInstructor(e.target.value)} />}
            </Field>
            <ColorPicker value={color} onChange={setColor} error={errors.color} />
          </>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Term starts" hint="Places “Week 7” items on the calendar" error={target === "new" ? errors.termStart : undefined}>
            {(p) => <Input {...p} type="date" value={termStart} onChange={(e) => setTermStart(e.target.value)} />}
          </Field>
          <Field label="Term ends" hint="Optional" error={target === "new" ? errors.termEnd : undefined}>
            {(p) => <Input {...p} type="date" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} />}
          </Field>
        </div>
      </section>

      {/* -------------------------------------------------------- meetings */}
      <section aria-labelledby="import-meetings" className="flex flex-col gap-2">
        <h3 id="import-meetings" className="text-sm font-semibold">
          Weekly classes <span className="font-normal text-muted">{chosenMeetings.length} of {meetings.length} selected</span>
        </h3>
        {scheduleError ? <p className="text-xs text-danger">{scheduleError}</p> : null}
        {meetings.length === 0 ? <p className="text-sm text-muted">None found.</p> : null}
        {meetings.map((m) => (
          <div key={m.id} className={cx("rounded-xl border p-3", m.include ? "border-border" : "border-dashed border-border opacity-60")}>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="checkbox"
                checked={m.include}
                onChange={(e) => updateMeeting(m.id, { include: e.target.checked })}
                aria-label={`Include ${m.kind} ${m.days.map(weekdayShort).join("/")} ${formatTime(m.start)}`}
                className="h-4 w-4 accent-[rgb(var(--c-accent))]"
              />
              <div className="flex flex-wrap gap-1" role="group" aria-label="Days">
                {DAYS.map((d) => {
                  const on = m.days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => updateMeeting(m.id, { days: on ? m.days.filter((x) => x !== d) : [...m.days, d].sort((a, b) => a - b) })}
                      className={cx("h-7 min-w-10 rounded-md px-1.5 text-xs font-medium", on ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted")}
                    >
                      {weekdayShort(d)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Input type="time" aria-label="Start" value={m.start} onChange={(e) => updateMeeting(m.id, { start: e.target.value })} />
              <Input type="time" aria-label="End" value={m.end} onChange={(e) => updateMeeting(m.id, { end: e.target.value })} />
              <Select aria-label="Type" value={m.kind} onChange={(e) => updateMeeting(m.id, { kind: e.target.value as SessionKind })}>
                {SESSION_KINDS.map((k) => (
                  <option key={k} value={k}>{k[0]!.toUpperCase() + k.slice(1)}</option>
                ))}
              </Select>
              <Input aria-label="Room" placeholder="Room" value={m.location ?? ""} onChange={(e) => updateMeeting(m.id, { location: e.target.value || null })} />
            </div>
            <SourceLine text={m.source} />
          </div>
        ))}
      </section>

      {/* ----------------------------------------------------- assessments */}
      <section aria-labelledby="import-assessments" className="flex flex-col gap-2">
        <h3 id="import-assessments" className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold">
          <span>
            Assessments <span className="font-normal text-muted">{chosenItems.length} of {items.length} selected</span>
          </span>
          {weightTotal > 0 ? (
            <span className={cx("text-xs font-medium tabular-nums", Math.abs(weightTotal - 100) < 0.01 ? "text-success" : "text-muted")}>
              {Math.round(weightTotal * 100) / 100}% of the grade
            </span>
          ) : null}
        </h3>
        {items.length === 0 ? <p className="text-sm text-muted">None found.</p> : null}
        {items.map((a) => {
          const date = dateOf(a);
          const err = itemError(a);
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
                <Input aria-label="Title" value={a.title} onChange={(e) => updateItem(a.id, { title: e.target.value })} className="font-medium" />
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
              <p className={cx("mt-1 text-xs", err || (a.include && !date) ? "text-danger" : "text-muted")}>
                {err ??
                  (date
                    ? `${formatDate(date)}${!a.date && !a.picked && a.week ? ` (week ${a.week})` : ""}`
                    : a.tba
                      ? "Date to be announced: pick one when it's set, or leave unticked."
                      : a.week
                        ? `Week ${a.week}: enter the term start above to place it.`
                        : "Pick a date to include this.")}
              </p>
              <SourceLine text={a.source} />
            </div>
          );
        })}
      </section>

      <div className="sticky bottom-0 -mx-5 -mb-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-5 py-3">
        {needsDate > 0 ? (
          <span className="mr-auto text-xs text-danger">
            {needsDate} selected {needsDate === 1 ? "item needs" : "items need"} a date.
          </span>
        ) : null}
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" disabled={saving || needsDate > 0 || nothingChosen} onClick={() => void importNow()}>
          {target === "new" ? "Create course" : "Add to course"}
          {chosenItems.length + chosenMeetings.length > 0 ? ` (${chosenItems.length + chosenMeetings.length})` : ""}
        </Button>
      </div>
    </div>
  );
}
