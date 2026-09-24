import { useEffect, useMemo, useState } from "react";
import { KIND_LABEL, weightSummary } from "../../core/assessments";
import { blankAssessment, KIND_DEFAULTS } from "../../core/templates";
import {
  ASSESSMENT_KINDS,
  PRIORITIES,
  type AssessmentDraft,
  type AssessmentKind,
  type FieldErrors,
} from "../../core/types";
import { Button } from "../../components/ui/Button";
import { cx } from "../../components/ui/cx";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { useActiveCourses } from "../../state/hooks";
import { useStore } from "../../state/store";

/** Parse a numeric field: blank → null, otherwise a finite number or NaN (caught by validation). */
function parseNumber(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

export function AssessmentDialog() {
  const dialog = useStore((s) => s.assessmentDialog);
  const assessments = useStore((s) => s.assessments);
  const allCourses = useStore((s) => s.courses);
  const today = useStore((s) => s.today);
  const open = useStore((s) => s.openAssessmentDialog);
  const openCourseDialog = useStore((s) => s.openCourseDialog);
  const createAssessment = useStore((s) => s.createAssessment);
  const updateAssessment = useStore((s) => s.updateAssessment);
  const deleteAssessment = useStore((s) => s.deleteAssessment);
  const activeCourses = useActiveCourses();

  const editing = dialog?.mode === "edit" ? assessments.find((a) => a.id === dialog.id) ?? null : null;
  const [draft, setDraft] = useState<AssessmentDraft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  /** Once the user touches priority/weight, changing the kind stops overwriting them. */
  const [touched, setTouched] = useState({ priority: false, weight: false });

  const dialogKey = dialog ? (dialog.mode === "edit" ? `e:${dialog.id}` : `c:${JSON.stringify(dialog.prefill ?? {})}`) : null;
  useEffect(() => {
    if (!dialog) return;
    if (dialog.mode === "edit") {
      if (!editing) return;
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = editing;
      setDraft(rest);
      setTouched({ priority: true, weight: true });
    } else {
      const prefill = dialog.prefill ?? {};
      const courseId = prefill.courseId ?? activeCourses[0]?.id ?? "";
      setDraft({ ...blankAssessment(courseId, today, prefill.kind), ...prefill, courseId });
      setTouched({ priority: prefill.priority !== undefined, weight: prefill.weight !== undefined });
    }
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the target changes
  }, [dialogKey]);

  useEffect(() => {
    if (dialog?.mode === "edit" && !editing) open(null);
  }, [dialog, editing, open]);

  // The course list for the select: active courses, plus the current one if it has since been archived.
  const courseOptions = useMemo(() => {
    const current = draft ? allCourses.find((c) => c.id === draft.courseId) : undefined;
    return current && current.archived ? [...activeCourses, current] : activeCourses;
  }, [activeCourses, allCourses, draft]);

  const weightWarning = useMemo(() => {
    if (!draft || draft.weight === null || !Number.isFinite(draft.weight)) return null;
    const others = assessments.filter((a) => a.id !== editing?.id);
    const total = weightSummary(draft.courseId, [...others, { ...draft, id: "draft", createdAt: 0, updatedAt: 0 }]).total;
    return total > 100 ? `This brings the course to ${total}% total weight.` : null;
  }, [draft, assessments, editing]);

  const close = () => open(null);

  if (dialog && activeCourses.length === 0 && !editing) {
    return (
      <Dialog open onOpenChange={(o) => !o && close()} title="Add a course first" description="Assessments belong to a course, so you'll need at least one.">
        <Button variant="primary" onClick={() => { close(); openCourseDialog({ mode: "create" }); }}>
          Add course
        </Button>
      </Dialog>
    );
  }

  const update = <K extends keyof AssessmentDraft>(key: K, value: AssessmentDraft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  function changeKind(kind: AssessmentKind) {
    setDraft((d) =>
      d
        ? {
            ...d,
            kind,
            priority: touched.priority ? d.priority : KIND_DEFAULTS[kind].priority,
            weight: touched.weight ? d.weight : KIND_DEFAULTS[kind].weight,
          }
        : d,
    );
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const result = editing ? await updateAssessment(editing.id, draft) : await createAssessment(draft);
      if (result.ok) close();
      else setErrors(result.errors);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={dialog !== null && draft !== null}
      onOpenChange={(o) => !o && close()}
      title={editing ? "Edit assessment" : "New assessment"}
      footer={
        <>
          {editing ? (
            <Button variant="ghost" className="mr-auto text-danger" onClick={async () => { close(); await deleteAssessment(editing.id); }}>
              Delete
            </Button>
          ) : null}
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>
            {editing ? "Save changes" : "Add assessment"}
          </Button>
        </>
      }
    >
      {draft ? (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {errors.form ? <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{errors.form}</p> : null}
          <Field label="Title" error={errors.title}>
            {(p) => <Input {...p} autoFocus placeholder="Midterm 1" value={draft.title} onChange={(e) => update("title", e.target.value)} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Course" error={errors.courseId}>
              {(p) => (
                <Select {...p} value={draft.courseId} onChange={(e) => update("courseId", e.target.value)}>
                  {courseOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.code}: {c.name}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Type" error={errors.kind}>
              {(p) => (
                <Select {...p} value={draft.kind} onChange={(e) => changeKind(e.target.value as AssessmentKind)}>
                  {ASSESSMENT_KINDS.map((k) => (
                    <option key={k} value={k}>{KIND_LABEL[k]}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Due date" error={errors.dueDate}>
              {(p) => <Input {...p} type="date" required value={draft.dueDate} onChange={(e) => update("dueDate", e.target.value)} />}
            </Field>
            <Field label="Time" error={errors.dueTime} hint="Leave blank if it's due any time that day">
              {(p) => <Input {...p} type="time" value={draft.dueTime ?? ""} onChange={(e) => update("dueTime", e.target.value || null)} />}
            </Field>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Priority</legend>
            <div className="flex rounded-lg bg-surface-2 p-0.5" role="radiogroup" aria-label="Priority">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={draft.priority === p}
                  onClick={() => { setTouched((t) => ({ ...t, priority: true })); update("priority", p); }}
                  className={cx(
                    "flex-1 rounded-md py-1.5 text-sm font-medium capitalize",
                    draft.priority === p ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
                    draft.priority === p && p === "high" && "text-danger",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Weight (%)" error={errors.weight ?? weightWarning ?? undefined} hint="Share of your final grade">
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="0.5"
                  value={draft.weight ?? ""}
                  onChange={(e) => { setTouched((t) => ({ ...t, weight: true })); update("weight", parseNumber(e.target.value)); }}
                />
              )}
            </Field>
            {editing || draft.status === "done" ? (
              <Field label="Grade (%)" error={errors.grade} hint="Once it's marked">
                {(p) => (
                  <Input {...p} type="number" inputMode="decimal" min={0} step="0.1" value={draft.grade ?? ""} onChange={(e) => update("grade", parseNumber(e.target.value))} />
                )}
              </Field>
            ) : null}
          </div>

          <Field label="Status">
            {(p) => (
              <Select {...p} value={draft.status} onChange={(e) => update("status", e.target.value as AssessmentDraft["status"])}>
                <option value="todo">Not started</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </Select>
            )}
          </Field>
          <Field label="Notes">
            {(p) => <Textarea {...p} placeholder="Topics, room, allowed materials…" value={draft.notes} onChange={(e) => update("notes", e.target.value)} />}
          </Field>
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      ) : null}
    </Dialog>
  );
}
