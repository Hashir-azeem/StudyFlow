import { FileUp, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { trackAll, weightSummary } from "../../core/assessments";
import { formatRelative, weekdayShort } from "../../core/dates";
import type { Assessment, Course, TimeOfDay } from "../../core/types";
import { Button } from "../../components/ui/Button";
import { cx } from "../../components/ui/cx";
import { useFormatTime } from "../../state/hooks";
import { useStore } from "../../state/store";

/** "Mon/Wed 10:00 AM–11:15 AM, Fri 2:00 PM–3:00 PM" */
function scheduleSummary(course: Course, formatTime: (t: TimeOfDay) => string): string {
  if (course.schedule.length === 0) return "No class times";
  const mondayFirst = (d: number) => (d + 6) % 7;
  return [...course.schedule]
    .sort((a, b) => mondayFirst(a.days[0] ?? 0) - mondayFirst(b.days[0] ?? 0))
    .map((s) => {
      const days = [...s.days].sort((a, b) => mondayFirst(a) - mondayFirst(b)).map(weekdayShort).join("/");
      return `${days} ${formatTime(s.start)}–${formatTime(s.end)}`;
    })
    .join(", ");
}

function CourseCard({ course, assessments }: { course: Course; assessments: Assessment[] }) {
  const today = useStore((s) => s.today);
  const openCourseDialog = useStore((s) => s.openCourseDialog);
  const openAssessmentDialog = useStore((s) => s.openAssessmentDialog);
  const formatTime = useFormatTime();
  const weights = weightSummary(course.id, assessments);
  const next = useMemo(
    () => trackAll(assessments, [course], today).find((t) => t.daysUntil >= 0),
    [assessments, course, today],
  );

  return (
    <article data-course={course.id} className={cx("flex flex-col overflow-hidden rounded-2xl border border-border bg-surface", course.archived && "opacity-70")}>
      <div className="h-1.5 bg-course" aria-hidden />
      <button type="button" onClick={() => openCourseDialog({ mode: "edit", id: course.id })} className="flex flex-col gap-1 p-4 text-left hover:bg-surface-2/50">
        <span className="text-sm font-bold text-course-ink">{course.code}</span>
        <span className="text-base font-semibold leading-snug">{course.name}</span>
        {course.instructor ? <span className="text-sm text-muted">{course.instructor}</span> : null}
        <span className="mt-1 text-xs text-muted">{scheduleSummary(course, formatTime)}</span>
      </button>

      <div className="mt-auto flex flex-col gap-3 border-t border-border p-4 text-sm">
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Weight planned</span>
            <span className={cx("tabular-nums", weights.overAllocated && "font-semibold text-danger")}>
              {weights.total}%{weights.currentGrade !== null ? `, averaging ${weights.currentGrade}%` : ""}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={weights.total} aria-valuemin={0} aria-valuemax={100} aria-label="Grade weight planned">
            <div className={cx("h-full rounded-full", weights.overAllocated ? "bg-danger" : "bg-course")} style={{ width: `${Math.min(100, weights.total)}%` }} />
          </div>
          {weights.overAllocated ? <p className="mt-1 text-xs text-danger">Weights add up to more than 100%.</p> : null}
        </div>

        <div className="flex items-center justify-between gap-2">
          {next ? (
            <span className="min-w-0 truncate text-xs">
              <span className="text-muted">Next: </span>
              {next.assessment.title} <span className="text-muted">({formatRelative(next.assessment.dueDate, today).toLowerCase()})</span>
            </span>
          ) : (
            <span className="text-xs text-muted">Nothing upcoming</span>
          )}
          {!course.archived ? (
            <Button size="sm" variant="ghost" onClick={() => openAssessmentDialog({ mode: "create", prefill: { courseId: course.id } })}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function CoursesView() {
  const courses = useStore((s) => s.courses);
  const assessments = useStore((s) => s.assessments);
  const openCourseDialog = useStore((s) => s.openCourseDialog);
  const openOutlineImport = useStore((s) => s.openOutlineImport);
  const [showArchived, setShowArchived] = useState(false);

  const sorted = useMemo(() => [...courses].sort((a, b) => a.code.localeCompare(b.code)), [courses]);
  const active = sorted.filter((c) => !c.archived);
  const archived = sorted.filter((c) => c.archived);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Courses</h1>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => openOutlineImport(true)}>
            <FileUp className="h-4 w-4" /> Import outline
          </Button>
          <Button variant="primary" onClick={() => openCourseDialog({ mode: "create" })}>
            <Plus className="h-4 w-4" /> Add course
          </Button>
        </div>
      </header>

      {active.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted">
          No active courses. Add one to start tracking classes and deadlines.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((c) => (
            <CourseCard key={c.id} course={c} assessments={assessments} />
          ))}
        </div>
      )}

      {archived.length > 0 ? (
        <section>
          <button type="button" className="text-sm font-medium text-muted hover:text-text" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
            {showArchived ? "Hide" : "Show"} archived courses ({archived.length})
          </button>
          {showArchived ? (
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {archived.map((c) => (
                <CourseCard key={c.id} course={c} assessments={assessments} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
