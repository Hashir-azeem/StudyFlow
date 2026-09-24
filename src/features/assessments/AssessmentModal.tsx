import { useEffect, useState } from "react";
import type {
  AssessmentDraft,
  AssessmentKind,
  Course,
  Priority,
} from "../../core/types";
import { localDate } from "../../core/clock";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { Input, Label } from "../../components/ui/input";

const KINDS: AssessmentKind[] = [
  "assignment",
  "quiz",
  "project",
  "midterm",
  "exam",
  "other",
];

const PRIORITIES: Priority[] = ["low", "medium", "high"];

export function AssessmentModal({
  open,
  onOpenChange,
  courses,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: Course[];
  onSave: (draft: AssessmentDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AssessmentDraft>({
    courseId: courses[0]?.id ?? "",
    title: "",
    kind: "assignment",
    dueOn: localDate(),
    priority: "medium",
    weightPercent: null,
  });

  useEffect(() => {
    if (!open) return;
    setDraft({
      courseId: courses[0]?.id ?? "",
      title: "",
      kind: "assignment",
      dueOn: localDate(),
      priority: "medium",
      weightPercent: null,
    });
  }, [open, courses]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New assessment">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave(draft).then(() => onOpenChange(false));
          }}
        >
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              required
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="course">Course</Label>
              <select
                id="course"
                required
                className="h-9 w-full rounded-lg border border-[var(--sf-border)] bg-[var(--sf-bg)] px-2 text-sm"
                value={draft.courseId}
                onChange={(e) =>
                  setDraft({ ...draft, courseId: e.target.value })
                }
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="kind">Type</Label>
              <select
                id="kind"
                className="h-9 w-full rounded-lg border border-[var(--sf-border)] bg-[var(--sf-bg)] px-2 text-sm"
                value={draft.kind}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    kind: e.target.value as AssessmentKind,
                  })
                }
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="due">Due</Label>
              <Input
                id="due"
                type="date"
                required
                value={draft.dueOn}
                onChange={(e) => setDraft({ ...draft, dueOn: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                className="h-9 w-full rounded-lg border border-[var(--sf-border)] bg-[var(--sf-bg)] px-2 text-sm"
                value={draft.priority}
                onChange={(e) =>
                  setDraft({ ...draft, priority: e.target.value as Priority })
                }
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="weight">Weight %</Label>
              <Input
                id="weight"
                type="number"
                min={0}
                max={100}
                value={draft.weightPercent ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    weightPercent: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!draft.courseId}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
