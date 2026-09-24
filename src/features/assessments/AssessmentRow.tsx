import { Check } from "lucide-react";
import { KIND_LABEL, MAJOR_KINDS, type Urgency } from "../../core/assessments";
import { formatRelative } from "../../core/dates";
import type { Assessment, Course } from "../../core/types";
import { CourseBadge } from "../../components/CourseBadge";
import { cx } from "../../components/ui/cx";
import { useFormatTime } from "../../state/hooks";
import { useStore } from "../../state/store";

interface Props {
  assessment: Assessment;
  course: Course;
  urgency?: Urgency;
  /** Hide the relative date when the row already sits under a date heading. */
  showDate?: boolean;
}

const URGENCY_TEXT: Record<Urgency, string> = {
  overdue: "text-danger",
  today: "text-warning",
  soon: "text-text",
  upcoming: "text-muted",
};

export function AssessmentRow({ assessment: a, course, urgency, showDate = true }: Props) {
  const formatTime = useFormatTime();
  const today = useStore((s) => s.today);
  const toggleDone = useStore((s) => s.toggleDone);
  const openAssessmentDialog = useStore((s) => s.openAssessmentDialog);
  const done = a.status === "done";
  const major = MAJOR_KINDS.has(a.kind);

  return (
    <li
      data-course={course.id}
      className={cx(
        "group flex items-center gap-3 rounded-xl border border-transparent px-2 py-2 hover:border-border hover:bg-surface",
        major && !done && "border-l-4 border-l-course",
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark ${a.title} as not done` : `Mark ${a.title} as done`}
        onClick={() => void toggleDone(a.id)}
        className={cx(
          "grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors",
          done ? "border-course bg-course text-course-on" : "border-course/60 hover:bg-course-soft",
        )}
      >
        {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
      </button>

      <button
        type="button"
        onClick={() => openAssessmentDialog({ mode: "edit", id: a.id })}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
      >
        <span className={cx("truncate text-sm font-medium", done && "text-muted line-through")}>
          {a.title}
          {a.priority === "high" && !done ? (
            <span className="ml-2 text-xs font-semibold text-danger" aria-label="High priority">
              High
            </span>
          ) : null}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <CourseBadge course={course} />
          <span>{KIND_LABEL[a.kind]}</span>
          {a.weight !== null ? <span className="tabular-nums">{a.weight}%</span> : null}
          {a.dueTime ? <span className="tabular-nums">{formatTime(a.dueTime)}</span> : null}
        </span>
      </button>

      {showDate ? (
        <span className={cx("shrink-0 text-xs font-medium", urgency ? URGENCY_TEXT[urgency] : "text-muted")}>
          {formatRelative(a.dueDate, today)}
        </span>
      ) : null}
    </li>
  );
}
