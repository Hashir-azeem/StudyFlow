import { Check, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { normalizeHex } from "../../core/colors";
import { weekdayShort } from "../../core/dates";
import { blankCourse, blankSlot } from "../../core/templates";
import { SESSION_KINDS, type CourseDraft, type FieldErrors, type ScheduleSlot, type Weekday } from "../../core/types";
import { Button } from "../../components/ui/Button";
import { cx } from "../../components/ui/cx";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { useStore } from "../../state/store";
import { useResolvedTheme } from "../../theme/useResolvedTheme";

const DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export function ColorPicker({ value, onChange, error }: { value: string; onChange: (hex: string) => void; error?: string }) {
  const palette = useResolvedTheme().coursePalette;
  const current = normalizeHex(value) ?? "#64748b";
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">Color</legend>
      <div className="flex flex-wrap items-center gap-2">
        {palette.map((hex) => {
          const selected = hex.toLowerCase() === current;
          return (
            <button
              key={hex}
              type="button"
              aria-label={`Use color ${hex}`}
              aria-pressed={selected}
              onClick={() => onChange(hex)}
              style={{ backgroundColor: hex }}
              className={cx(
                "grid h-7 w-7 place-items-center rounded-full ring-offset-2 ring-offset-surface",
                selected && "ring-2 ring-text",
              )}
            >
              {selected ? <Check className="h-4 w-4 text-white mix-blend-difference" strokeWidth={3} /> : null}
            </button>
          );
        })}
        <label className="relative flex h-7 items-center gap-2 rounded-full border border-border px-2 text-xs text-muted hover:text-text">
          <span className="h-4 w-4 rounded-full" style={{ backgroundColor: current }} aria-hidden />
          Custom
          <input
            type="color"
            value={current}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Pick a custom color"
          />
        </label>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </fieldset>
  );
}

function SlotEditor({
  slots,
  errors,
  onChange,
}: {
  slots: ScheduleSlot[];
  errors: FieldErrors;
  onChange: (slots: ScheduleSlot[]) => void;
}) {
  const update = (id: string, patch: Partial<ScheduleSlot>) =>
    onChange(slots.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">Weekly schedule</legend>
      {slots.length === 0 ? (
        <p className="text-xs text-muted">No class times yet. Add one per meeting pattern, like Mon/Wed lectures and a Friday lab.</p>
      ) : null}
      {slots.map((slot, i) => {
        const slotError = ["days", "start", "end", "kind"].map((f) => errors[`schedule.${i}.${f}`]).find(Boolean);
        return (
          <div key={slot.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Days">
              {DAYS.map((d) => {
                const on = slot.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => update(slot.id, { days: on ? slot.days.filter((x) => x !== d) : [...slot.days, d] })}
                    className={cx(
                      "h-8 min-w-11 rounded-md px-2 text-xs font-medium",
                      on ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted hover:text-text",
                    )}
                  >
                    {weekdayShort(d)}
                  </button>
                );
              })}
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remove this meeting"
                onClick={() => onChange(slots.filter((s) => s.id !== slot.id))}
                className="ml-auto"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Input
                type="time"
                aria-label="Start time"
                aria-invalid={Boolean(errors[`schedule.${i}.start`])}
                value={slot.start}
                onChange={(e) => update(slot.id, { start: e.target.value })}
              />
              <Input
                type="time"
                aria-label="End time"
                aria-invalid={Boolean(errors[`schedule.${i}.end`])}
                value={slot.end}
                onChange={(e) => update(slot.id, { end: e.target.value })}
              />
              <Select aria-label="Session type" value={slot.kind} onChange={(e) => update(slot.id, { kind: e.target.value as ScheduleSlot["kind"] })}>
                {SESSION_KINDS.map((k) => (
                  <option key={k} value={k}>{k[0]!.toUpperCase() + k.slice(1)}</option>
                ))}
              </Select>
              <Input
                placeholder="Room"
                aria-label="Room"
                value={slot.location ?? ""}
                onChange={(e) => update(slot.id, { location: e.target.value })}
              />
            </div>
            {slotError ? <p className="text-xs text-danger">{slotError}</p> : null}
          </div>
        );
      })}
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        onClick={() => onChange([...slots, slots.length === 0 ? blankSlot() : { ...blankSlot([5]), kind: "lab" }])}
      >
        <Plus className="h-4 w-4" /> Add meeting
      </Button>
    </fieldset>
  );
}

export function CourseDialog() {
  const dialog = useStore((s) => s.courseDialog);
  const courses = useStore((s) => s.courses);
  const openCourseDialog = useStore((s) => s.openCourseDialog);
  const createCourse = useStore((s) => s.createCourse);
  const updateCourse = useStore((s) => s.updateCourse);
  const setArchived = useStore((s) => s.setCourseArchived);
  const deleteCourse = useStore((s) => s.deleteCourse);
  const openOutlineImport = useStore((s) => s.openOutlineImport);

  const editing = dialog?.mode === "edit" ? courses.find((c) => c.id === dialog.id) ?? null : null;
  const [draft, setDraft] = useState<CourseDraft>(() => blankCourse(courses));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset the form whenever the dialog opens for a different target.
  const dialogKey = dialog ? (dialog.mode === "edit" ? dialog.id : "new") : null;
  useEffect(() => {
    if (!dialogKey) return;
    const source = editing;
    setDraft(
      source
        ? {
            name: source.name, code: source.code, instructor: source.instructor, color: source.color,
            schedule: source.schedule, termStart: source.termStart, termEnd: source.termEnd,
            skipDates: source.skipDates, archived: source.archived,
          }
        : blankCourse(courses),
    );
    setErrors({});
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when the target changes
  }, [dialogKey]);

  // Edited course was deleted elsewhere (undo, import): close instead of showing a ghost form.
  useEffect(() => {
    if (dialog?.mode === "edit" && !editing) openCourseDialog(null);
  }, [dialog, editing, openCourseDialog]);

  const close = () => openCourseDialog(null);
  const set = <K extends keyof CourseDraft>(key: K, value: CourseDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function save() {
    setSaving(true);
    try {
      const result = editing ? await updateCourse(editing.id, draft) : await createCourse(draft);
      if (result.ok) close();
      else setErrors(result.errors);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={dialog !== null}
      onOpenChange={(o) => !o && close()}
      title={editing ? `Edit ${editing.code}` : "New course"}
      wide
      footer={
        <>
          {editing ? (
            <div className="mr-auto flex gap-2">
              {confirmDelete ? (
                <Button
                  variant="danger"
                  onClick={async () => {
                    close();
                    await deleteCourse(editing.id);
                  }}
                >
                  Delete course and its assessments
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmDelete(true)}>Delete</Button>
              )}
              <Button
                variant="ghost"
                onClick={async () => {
                  close();
                  await setArchived(editing.id, !editing.archived);
                }}
              >
                {editing.archived ? "Restore" : "Archive"}
              </Button>
            </div>
          ) : null}
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            {editing ? "Save changes" : "Add course"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {errors.form ? <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{errors.form}</p> : null}
        {!editing ? (
          <button
            type="button"
            onClick={() => {
              close();
              openOutlineImport(true);
            }}
            className="self-start text-sm font-medium text-accent hover:underline"
          >
            Import classes and deadlines from a course outline instead
          </button>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
          <Field label="Code" error={errors.code}>
            {(p) => <Input {...p} autoFocus placeholder="CS 101" value={draft.code} onChange={(e) => set("code", e.target.value)} />}
          </Field>
          <Field label="Name" error={errors.name}>
            {(p) => <Input {...p} placeholder="Intro to Computer Science" value={draft.name} onChange={(e) => set("name", e.target.value)} />}
          </Field>
        </div>
        <Field label="Instructor" hint="Optional">
          {(p) => <Input {...p} value={draft.instructor ?? ""} onChange={(e) => set("instructor", e.target.value || null)} />}
        </Field>
        <ColorPicker value={draft.color} onChange={(hex) => set("color", hex)} error={errors.color} />
        <SlotEditor slots={draft.schedule} errors={errors} onChange={(schedule) => set("schedule", schedule)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Term starts" error={errors.termStart} hint="Classes show from this date">
            {(p) => <Input {...p} type="date" value={draft.termStart ?? ""} onChange={(e) => set("termStart", e.target.value || null)} />}
          </Field>
          <Field label="Term ends" error={errors.termEnd} hint="and stop after this one">
            {(p) => <Input {...p} type="date" value={draft.termEnd ?? ""} onChange={(e) => set("termEnd", e.target.value || null)} />}
          </Field>
        </div>
        {/* Lets Enter submit from any text field. */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
