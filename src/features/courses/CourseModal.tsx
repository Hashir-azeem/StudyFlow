import { useEffect, useState } from "react";
import { COURSE_PALETTE, type Course, type CourseDraft, type HexColor, type SlotDraft, type Weekday } from "../../core/types";
import { weekdayLabel } from "../../core/format";
import { Button } from "../ui/button";
import { Dialog, DialogContent } from "../ui/dialog";
import { Input, Label } from "../ui/input";

const DAYS: Weekday[] = [1, 2, 3, 4, 5];

function emptySlot(): SlotDraft {
  return {
    kind: "weekly",
    days: [1, 3],
    time: { startMin: 10 * 60, endMin: 11 * 60 + 15 },
    location: "",
    startsOn: new Date().toISOString().slice(0, 10),
    cancelledDates: [],
    extraDates: [],
  };
}

function toDraft(course: Course, slots: SlotDraft[]): CourseDraft {
  return {
    name: course.name,
    code: course.code,
    instructor: course.instructor,
    color: course.color,
    notes: course.notes,
    termId: course.termId,
    slots,
  };
}

function minToInput(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function inputToMin(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function CourseModal({
  open,
  onOpenChange,
  course,
  slots,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course?: Course | null;
  slots?: SlotDraft[];
  onSave: (draft: CourseDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<CourseDraft>({
    name: "",
    code: "",
    instructor: "",
    color: COURSE_PALETTE[0],
    slots: [emptySlot()],
  });

  useEffect(() => {
    if (!open) return;
    if (course) {
      setDraft(toDraft(course, slots?.length ? slots : [emptySlot()]));
    } else {
      setDraft({
        name: "",
        code: "",
        instructor: "",
        color: COURSE_PALETTE[0],
        slots: [emptySlot()],
      });
    }
  }, [open, course, slots]);

  const setSlot = (i: number, patch: Partial<SlotDraft>) => {
    setDraft((d) => ({
      ...d,
      slots: d.slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={course ? "Edit course" : "New course"}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave(draft).then(() => onOpenChange(false));
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                required
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="instructor">Instructor</Label>
            <Input
              id="instructor"
              value={draft.instructor}
              onChange={(e) =>
                setDraft({ ...draft, instructor: e.target.value })
              }
            />
          </div>
          <div>
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COURSE_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  className="h-6 w-6 rounded-full ring-offset-2 ring-offset-[var(--sf-surface)]"
                  style={{
                    background: c,
                    boxShadow:
                      draft.color === c ? `0 0 0 2px ${c}` : undefined,
                  }}
                  onClick={() => setDraft({ ...draft, color: c as HexColor })}
                />
              ))}
            </div>
          </div>
          {draft.slots.map((slot, i) => (
            <div
              key={i}
              className="rounded-lg border border-[var(--sf-border)] p-3"
            >
              <Label>Meeting {i + 1}</Label>
              <div className="mb-2 flex flex-wrap gap-1">
                {DAYS.map((d) => {
                  const on = slot.days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      className="rounded-md px-2 py-1 text-xs"
                      style={{
                        background: on
                          ? "var(--sf-accent)"
                          : "var(--sf-bg-subtle)",
                        color: on
                          ? "var(--sf-accent-fg)"
                          : "var(--sf-text-muted)",
                      }}
                      onClick={() =>
                        setSlot(i, {
                          days: on
                            ? slot.days.filter((x) => x !== d)
                            : [...slot.days, d].sort(),
                        })
                      }
                    >
                      {weekdayLabel(d)}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  type="time"
                  value={minToInput(slot.time.startMin)}
                  onChange={(e) =>
                    setSlot(i, {
                      time: { ...slot.time, startMin: inputToMin(e.target.value) },
                    })
                  }
                />
                <Input
                  type="time"
                  value={minToInput(slot.time.endMin)}
                  onChange={(e) =>
                    setSlot(i, {
                      time: { ...slot.time, endMin: inputToMin(e.target.value) },
                    })
                  }
                />
                <Input
                  placeholder="Room"
                  value={slot.location ?? ""}
                  onChange={(e) => setSlot(i, { location: e.target.value })}
                />
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setDraft((d) => ({ ...d, slots: [...d.slots, emptySlot()] }))
            }
          >
            Add meeting
          </Button>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
