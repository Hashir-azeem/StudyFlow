import { useId, useMemo, useState } from "react";
import { groupByDate, MAJOR_KINDS, type TrackedAssessment } from "../../core/assessments";
import { formatDate, fromISODate, rangeOfDays } from "../../core/dates";
import type { ISODate } from "../../core/types";
import { cx } from "../../components/ui/cx";
import { useStore } from "../../state/store";
import { AssessmentRow } from "../assessments/AssessmentRow";

interface Props {
  items: TrackedAssessment[];
  title: string;
  emptyText: string;
}

/**
 * The 7-day assessment tracker: a day ribbon showing load at a glance
 * (one dot per item, colored by course, ringed for exams and midterms),
 * with the list below filtered to the selected day.
 */
export function UpcomingTracker({ items, title, emptyText }: Props) {
  const today = useStore((s) => s.today);
  const days = useStore((s) => s.settings.lookaheadDays);
  const [selected, setSelected] = useState<ISODate | null>(null);
  const headingId = useId();

  const windowDays = useMemo(() => rangeOfDays(today, days), [today, days]);
  const byDay = useMemo(() => {
    const map = new Map<ISODate, TrackedAssessment[]>();
    for (const item of items) {
      const list = map.get(item.assessment.dueDate) ?? [];
      list.push(item);
      map.set(item.assessment.dueDate, list);
    }
    return map;
  }, [items]);

  // Selection that fell out of the window (day rolled over) resets to "all".
  const activeDay = selected && windowDays.includes(selected) ? selected : null;
  const groups = groupByDate(activeDay ? byDay.get(activeDay) ?? [] : items);

  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id={headingId} className="text-base font-semibold">{title}</h2>
        {activeDay ? (
          <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => setSelected(null)}>
            Show all {days} days
          </button>
        ) : (
          <span className="text-xs text-muted tabular-nums">{items.length} open</span>
        )}
      </div>

      <div className="-mx-1 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Pick a day">
        {windowDays.map((day, i) => {
          const dayItems = byDay.get(day) ?? [];
          const d = fromISODate(day);
          const isActive = activeDay === day;
          return (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`${formatDate(day)}: ${dayItems.length} due`}
              onClick={() => setSelected(isActive ? null : day)}
              className={cx(
                "flex min-w-12 flex-1 flex-col items-center gap-1.5 rounded-xl px-1 py-2 transition-colors",
                isActive ? "bg-accent/12 ring-1 ring-accent" : "hover:bg-surface-2",
              )}
            >
              <span className="text-[11px] text-muted">{i === 0 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" })}</span>
              <span className={cx("text-lg font-semibold tabular-nums leading-none", i === 0 && "text-accent")}>{d.getDate()}</span>
              <span className="flex h-3 max-w-full flex-wrap justify-center gap-0.5 overflow-hidden" aria-hidden>
                {dayItems.slice(0, 6).map((t) => (
                  <span
                    key={t.assessment.id}
                    data-course={t.course.id}
                    className={cx(
                      "h-2 w-2 rounded-full bg-course",
                      MAJOR_KINDS.has(t.assessment.kind) && "ring-2 ring-course/35",
                    )}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {groups.length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">
          {activeDay ? `Nothing due ${formatDate(activeDay)}.` : emptyText}
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {groups.map((g) => (
            <div key={g.date}>
              <h3 className="px-2 pb-1 text-xs font-semibold text-muted">
                {g.date === today ? "Today" : formatDate(g.date)}
              </h3>
              <ul className="flex flex-col">
                {g.items.map((t) => (
                  <AssessmentRow key={t.assessment.id} assessment={t.assessment} course={t.course} urgency={t.urgency} showDate={false} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
