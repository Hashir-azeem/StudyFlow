import { MapPin, Plus } from "lucide-react";
import { formatDate } from "../../core/dates";
import type { ClassStatus } from "../../core/schedule";
import { Button } from "../../components/ui/Button";
import { CourseBadge } from "../../components/CourseBadge";
import { cx } from "../../components/ui/cx";
import { useActiveCourses, useTodayClasses, useTracker, useFormatTime } from "../../state/hooks";
import { useStore } from "../../state/store";
import { AssessmentRow } from "../assessments/AssessmentRow";
import { UpcomingTracker } from "./UpcomingTracker";

const STATUS_LABEL: Record<ClassStatus, string | null> = {
  done: null,
  live: "Now",
  next: "Next",
  later: null,
};

function greeting(now: string): string {
  const h = Number(now.slice(0, 2));
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function TodayView() {
  const formatTime = useFormatTime();
  const today = useStore((s) => s.today);
  const now = useStore((s) => s.now);
  const days = useStore((s) => s.settings.lookaheadDays);
  const openCourseDialog = useStore((s) => s.openCourseDialog);
  const openAssessmentDialog = useStore((s) => s.openAssessmentDialog);
  const loadSampleData = useStore((s) => s.loadSampleData);
  const courses = useActiveCourses();
  const classes = useTodayClasses();
  const tracker = useTracker();

  if (courses.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Add your first course</h1>
        <p className="text-sm text-muted">
          Enter the course code, when it meets, and a color. Your classes, deadlines, and exams will fill this page.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={() => openCourseDialog({ mode: "create" })}>
            <Plus className="h-4 w-4" /> Add course
          </Button>
          <Button variant="ghost" onClick={() => void loadSampleData()}>
            Try with sample courses
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{formatDate(today)}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{greeting(now)}</h1>
        </div>
        <Button variant="primary" onClick={() => openAssessmentDialog({ mode: "create", prefill: { dueDate: today } })}>
          <Plus className="h-4 w-4" /> Add assessment
        </Button>
      </header>

      {tracker.overdue.length > 0 ? (
        <section aria-labelledby="overdue-heading" className="rounded-2xl border border-danger/30 bg-danger/5 p-4">
          <h2 id="overdue-heading" className="mb-2 text-base font-semibold text-danger">
            Overdue ({tracker.overdue.length})
          </h2>
          <ul className="flex flex-col">
            {tracker.overdue.map((t) => (
              <AssessmentRow key={t.assessment.id} assessment={t.assessment} course={t.course} urgency={t.urgency} />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="classes-heading" className="rounded-2xl border border-border bg-surface p-4">
            <h2 id="classes-heading" className="mb-3 text-base font-semibold">Classes today</h2>
            {classes.length === 0 ? (
              <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">No classes today.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {classes.map(({ course, slot, status }) => (
                  <li
                    key={`${course.id}-${slot.id}`}
                    data-course={course.id}
                    className={cx(
                      "flex items-stretch gap-3 rounded-xl p-2",
                      status === "live" && "bg-course-soft",
                      status === "done" && "opacity-55",
                    )}
                  >
                    <span className="w-1 shrink-0 rounded-full bg-course" aria-hidden />
                    <div className="w-20 shrink-0 text-sm tabular-nums">
                      <div className="font-semibold">{formatTime(slot.start)}</div>
                      <div className="text-xs text-muted">{formatTime(slot.end)}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{course.name}</span>
                        {STATUS_LABEL[status] ? (
                          <span className="rounded bg-course px-1.5 text-[11px] font-semibold text-course-on">
                            {STATUS_LABEL[status]}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <CourseBadge course={course} />
                        <span className="capitalize">{slot.kind}</span>
                        {slot.location ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" aria-hidden /> {slot.location}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section aria-labelledby="due-heading" className="rounded-2xl border border-border bg-surface p-4">
            <h2 id="due-heading" className="mb-2 text-base font-semibold">Due today</h2>
            {tracker.dueToday.length === 0 ? (
              <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">Nothing due today.</p>
            ) : (
              <ul className="flex flex-col">
                {tracker.dueToday.map((t) => (
                  <AssessmentRow key={t.assessment.id} assessment={t.assessment} course={t.course} urgency={t.urgency} showDate={false} />
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <UpcomingTracker
            items={tracker.majors}
            title={`Midterms and exams, next ${days} days`}
            emptyText={`No midterms or exams in the next ${days} days.`}
          />
          <UpcomingTracker
            items={tracker.week}
            title={`Everything due, next ${days} days`}
            emptyText="Nothing due this week."
          />
        </div>
      </div>
    </div>
  );
}
