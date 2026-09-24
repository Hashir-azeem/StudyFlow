import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { indexByDate, KIND_LABEL, MAJOR_KINDS } from "../../core/assessments";
import {
  addDays,
  addMonths,
  formatDate,
  formatMonth,
  fromISODate,
  isSameMonth,
  monthGrid,
  rangeOfDays,
  startOfWeek,
} from "../../core/dates";
import { classesOn } from "../../core/schedule";
import type { Assessment, Course, ISODate } from "../../core/types";
import { Button } from "../../components/ui/Button";
import { cx } from "../../components/ui/cx";
import { useFormatTime } from "../../state/hooks";
import { useStore } from "../../state/store";

type DayItems = Array<{ assessment: Assessment; course: Course }>;

function AssessmentChip({ assessment: a, course }: { assessment: Assessment; course: Course }) {
  const open = useStore((s) => s.openAssessmentDialog);
  const formatTime = useFormatTime();
  const done = a.status === "done";
  const major = MAJOR_KINDS.has(a.kind);
  return (
    <button
      type="button"
      data-course={course.id}
      onClick={(e) => {
        e.stopPropagation();
        open({ mode: "edit", id: a.id });
      }}
      title={`${course.code}: ${a.title} (${KIND_LABEL[a.kind]})`}
      className={cx(
        "w-full truncate rounded-md px-1.5 py-0.5 text-left text-xs font-medium",
        major ? "bg-course text-course-on" : "bg-course-soft text-course-ink",
        done && "line-through opacity-50",
      )}
    >
      {a.dueTime ? <span className="mr-1 tabular-nums opacity-80">{formatTime(a.dueTime)}</span> : null}
      {a.title}
    </button>
  );
}

function Toolbar({ label }: { label: string }) {
  const mode = useStore((s) => s.calendarMode);
  const anchor = useStore((s) => s.calendarAnchor);
  const today = useStore((s) => s.today);
  const setMode = useStore((s) => s.setCalendarMode);
  const setAnchor = useStore((s) => s.setCalendarAnchor);
  const step = (dir: 1 | -1) => setAnchor(mode === "week" ? addDays(anchor, 7 * dir) : addMonths(anchor, dir));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => step(-1)} aria-label={`Previous ${mode}`}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => step(1)} aria-label={`Next ${mode}`}>
          <ChevronRight className="h-5 w-5" />
        </Button>
        <h1 className="ml-1 text-xl font-semibold">{label}</h1>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setAnchor(today)}>Today</Button>
        <div className="flex rounded-lg bg-surface-2 p-0.5" role="radiogroup" aria-label="Calendar range">
          {(["week", "month"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cx(
                "rounded-md px-3 py-1 text-sm font-medium capitalize",
                mode === m ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekView({ days, index }: { days: ISODate[]; index: Map<ISODate, DayItems> }) {
  const formatTime = useFormatTime();
  const today = useStore((s) => s.today);
  const courses = useStore((s) => s.courses);
  const openAssessmentDialog = useStore((s) => s.openAssessmentDialog);

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {days.map((day) => {
        const classes = classesOn(day, courses);
        const items = index.get(day) ?? [];
        const d = fromISODate(day);
        const isToday = day === today;
        return (
          <section
            key={day}
            aria-label={formatDate(day)}
            className={cx(
              "group flex min-h-40 flex-col gap-2 rounded-xl border bg-surface p-2",
              isToday ? "border-accent" : "border-border",
            )}
          >
            <header className="flex items-baseline justify-between">
              <span className="text-xs text-muted">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
              <span className={cx("text-lg font-semibold tabular-nums", isToday && "text-accent")}>{d.getDate()}</span>
            </header>

            {classes.length > 0 ? (
              <ul className="flex flex-col gap-1" aria-label="Classes">
                {classes.map(({ course, slot }) => (
                  <li key={`${course.id}-${slot.id}`} data-course={course.id} className="flex items-center gap-1.5 text-xs text-muted">
                    <span className="h-3 w-0.5 shrink-0 rounded bg-course" aria-hidden />
                    <span className="tabular-nums">{formatTime(slot.start)}</span>
                    <span className="truncate font-medium text-course-ink">{course.code}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-col gap-1">
              {items.map(({ assessment, course }) => (
                <AssessmentChip key={assessment.id} assessment={assessment} course={course} />
              ))}
            </div>

            <button
              type="button"
              onClick={() => openAssessmentDialog({ mode: "create", prefill: { dueDate: day } })}
              className="mt-auto rounded-md py-1 text-xs text-muted hover:bg-surface-2 hover:text-text focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            >
              + Add
            </button>
          </section>
        );
      })}
    </div>
  );
}

function MonthView({ days, index }: { days: ISODate[]; index: Map<ISODate, DayItems> }) {
  const today = useStore((s) => s.today);
  const anchor = useStore((s) => s.calendarAnchor);
  const setAnchor = useStore((s) => s.setCalendarAnchor);
  const setMode = useStore((s) => s.setCalendarMode);
  const openAssessmentDialog = useStore((s) => s.openAssessmentDialog);
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const MAX_CHIPS = 3;

  const headers = rangeOfDays(startOfWeek(today, weekStartsOn), 7).map((d) =>
    fromISODate(d).toLocaleDateString(undefined, { weekday: "short" }),
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-border">
      <div className="grid grid-cols-7 gap-px">
        {headers.map((h) => (
          <div key={h} className="bg-surface-2 px-2 py-1.5 text-center text-xs font-medium text-muted">{h}</div>
        ))}
        {days.map((day) => {
          const items = index.get(day) ?? [];
          const inMonth = isSameMonth(day, anchor);
          const isToday = day === today;
          return (
            <div
              key={day}
              className={cx("flex min-h-16 flex-col gap-1 p-1 sm:min-h-28 sm:p-1.5", inMonth ? "bg-surface" : "bg-surface-2/60")}
            >
              <button
                type="button"
                onClick={() => openAssessmentDialog({ mode: "create", prefill: { dueDate: day } })}
                aria-label={`Add assessment on ${formatDate(day)}`}
                className={cx(
                  "self-end rounded-full px-1.5 text-xs tabular-nums hover:bg-surface-2",
                  isToday ? "bg-accent font-semibold text-accent-fg hover:bg-accent" : inMonth ? "text-text" : "text-muted",
                )}
              >
                {fromISODate(day).getDate()}
              </button>

              {/* Phones: dots only. Larger screens: titled chips. */}
              <div className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                {items.map(({ assessment, course }) => (
                  <span key={assessment.id} data-course={course.id} className="h-1.5 w-1.5 rounded-full bg-course" />
                ))}
              </div>
              <div className="hidden flex-col gap-0.5 sm:flex">
                {items.slice(0, MAX_CHIPS).map(({ assessment, course }) => (
                  <AssessmentChip key={assessment.id} assessment={assessment} course={course} />
                ))}
                {items.length > MAX_CHIPS ? (
                  <button
                    type="button"
                    className="text-left text-xs font-medium text-muted hover:text-text"
                    onClick={() => {
                      setAnchor(day);
                      setMode("week");
                    }}
                  >
                    +{items.length - MAX_CHIPS} more
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarView() {
  const mode = useStore((s) => s.calendarMode);
  const anchor = useStore((s) => s.calendarAnchor);
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const courses = useStore((s) => s.courses);
  const assessments = useStore((s) => s.assessments);

  const index = useMemo(() => indexByDate(assessments, courses), [assessments, courses]);
  const days = useMemo(
    () => (mode === "week" ? rangeOfDays(startOfWeek(anchor, weekStartsOn), 7) : monthGrid(anchor, weekStartsOn)),
    [mode, anchor, weekStartsOn],
  );
  const label =
    mode === "month" ? formatMonth(anchor) : `${formatDate(days[0]!)} – ${formatDate(days[days.length - 1]!)}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Toolbar label={label} />
      {mode === "week" ? <WeekView days={days} index={index} /> : <MonthView days={days} index={index} />}
    </div>
  );
}
