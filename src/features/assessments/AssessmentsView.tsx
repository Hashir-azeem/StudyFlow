import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { weightSummary } from "../../core/assessments";
import { compareDateTime, formatDate } from "../../core/dates";
import type { Assessment, Course, ID, ISODate } from "../../core/types";
import { Button } from "../../components/ui/Button";
import { CourseDot } from "../../components/CourseBadge";
import { cx } from "../../components/ui/cx";
import { useActiveCourses } from "../../state/hooks";
import { useStore } from "../../state/store";
import { AssessmentRow } from "./AssessmentRow";

type StatusFilter = "open" | "done" | "all";

const STATUS_LABEL: Record<StatusFilter, string> = { open: "To do", done: "Done", all: "All" };

interface Group {
  key: string;
  label: string;
  tone?: "danger";
  items: Array<{ assessment: Assessment; course: Course }>;
}

/**
 * Every assessment in one list. Open work is grouped Overdue → by due date;
 * completed work is listed newest first, since that's what you look back for.
 */
export function AssessmentsView() {
  const assessments = useStore((s) => s.assessments);
  const today = useStore((s) => s.today);
  const openAssessmentDialog = useStore((s) => s.openAssessmentDialog);
  const courses = useActiveCourses();
  const [status, setStatus] = useState<StatusFilter>("open");
  const [courseFilter, setCourseFilter] = useState<ID | null>(null);

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  // A course filter pointing at a course that was archived or deleted falls back to "all".
  const activeFilter = courseFilter && courseMap.has(courseFilter) ? courseFilter : null;

  const groups = useMemo<Group[]>(() => {
    const rows = assessments
      .filter((a) => courseMap.has(a.courseId))
      .filter((a) => !activeFilter || a.courseId === activeFilter)
      .filter((a) => (status === "all" ? true : status === "done" ? a.status === "done" : a.status !== "done"))
      .map((a) => ({ assessment: a, course: courseMap.get(a.courseId)! }))
      .sort((x, y) =>
        compareDateTime(
          { date: x.assessment.dueDate, time: x.assessment.dueTime },
          { date: y.assessment.dueDate, time: y.assessment.dueTime },
        ),
      );
    if (status === "done") rows.reverse();

    const out: Group[] = [];
    const overdue = rows.filter((r) => r.assessment.status !== "done" && r.assessment.dueDate < today);
    if (overdue.length) out.push({ key: "overdue", label: "Overdue", tone: "danger", items: overdue });
    const byDate = new Map<ISODate, Group["items"]>();
    for (const r of rows) {
      if (overdue.includes(r)) continue;
      const list = byDate.get(r.assessment.dueDate) ?? [];
      list.push(r);
      byDate.set(r.assessment.dueDate, list);
    }
    for (const [date, items] of byDate) {
      out.push({ key: date, label: date === today ? "Today" : formatDate(date), items });
    }
    return out;
  }, [assessments, courseMap, activeFilter, status, today]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const selectedCourse = activeFilter ? courseMap.get(activeFilter) : undefined;
  const weights = selectedCourse ? weightSummary(selectedCourse.id, assessments) : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Assessments</h1>
        <Button
          variant="primary"
          onClick={() => openAssessmentDialog({ mode: "create", prefill: activeFilter ? { courseId: activeFilter } : {} })}
        >
          <Plus className="h-4 w-4" /> Add assessment
        </Button>
      </header>

      <div className="flex flex-col gap-3">
        <div role="radiogroup" aria-label="Show" className="flex w-fit rounded-lg bg-surface-2 p-0.5">
          {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={status === f}
              onClick={() => setStatus(f)}
              className={cx(
                "rounded-md px-3 py-1 text-sm font-medium",
                status === f ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
              )}
            >
              {STATUS_LABEL[f]}
            </button>
          ))}
        </div>

        {courses.length > 1 ? (
          <div role="radiogroup" aria-label="Course" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <button
              type="button"
              role="radio"
              aria-checked={!activeFilter}
              onClick={() => setCourseFilter(null)}
              className={cx(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
                !activeFilter ? "border-accent bg-accent/12 text-accent" : "border-border text-muted hover:text-text",
              )}
            >
              All courses
            </button>
            {courses.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={activeFilter === c.id}
                data-course={c.id}
                onClick={() => setCourseFilter(activeFilter === c.id ? null : c.id)}
                className={cx(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                  activeFilter === c.id ? "border-course bg-course-soft text-course-ink" : "border-border text-muted hover:text-text",
                )}
              >
                <CourseDot course={c} className="h-2 w-2" />
                {c.code}
              </button>
            ))}
          </div>
        ) : null}

        {weights ? (
          <p className="text-xs text-muted">
            {selectedCourse!.code}: {weights.total}% of the grade planned
            {weights.currentGrade !== null ? `, averaging ${weights.currentGrade}% on ${weights.graded}% graded` : ""}.
            {weights.overAllocated ? <span className="ml-1 font-medium text-danger">Weights add up to more than 100%.</span> : null}
          </p>
        ) : null}
      </div>

      {courses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted">
          Add a course first. Assessments always belong to one.
        </p>
      ) : total === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted">
          {status === "done"
            ? "Nothing marked done yet."
            : status === "open"
              ? `Nothing to do${selectedCourse ? ` for ${selectedCourse.code}` : ""}. Add an assessment, or press ⌘K / Ctrl K and type one.`
              : "No assessments yet."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <h2 className={cx("px-2 pb-1 text-xs font-semibold", g.tone === "danger" ? "text-danger" : "text-muted")}>
                {g.label}
                <span className="ml-1.5 font-normal tabular-nums">{g.items.length}</span>
              </h2>
              <ul className="flex flex-col">
                {g.items.map(({ assessment, course }) => (
                  <AssessmentRow
                    key={assessment.id}
                    assessment={assessment}
                    course={course}
                    urgency={g.tone === "danger" ? "overdue" : undefined}
                    showDate={g.key === "overdue"}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
