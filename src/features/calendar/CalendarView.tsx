import { useLiveQuery } from "dexie-react-hooks";
import { addDays, localDate } from "../../core/clock";
import { db } from "../../core/storage";
import { Card } from "../../components/ui/card";
import { CourseBadge } from "../../components/shared/CourseBadge";

export function CalendarView() {
  const today = localDate();
  const data = useLiveQuery(async () => {
    const [assessments, courses] = await Promise.all([
      db.assessments.toArray(),
      db.courses.toArray(),
    ]);
    return { assessments, courses };
  });

  const start = monthStart(today);
  const days = gridDays(start);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-2xl font-medium tracking-tight">Calendar</h1>
      <div className="grid grid-cols-7 gap-2 text-center text-xs text-[var(--sf-text-muted)]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((date) => {
          const items =
            data?.assessments.filter((a) => a.dueOn === date && a.status !== "cancelled") ??
            [];
          return (
            <Card
              key={date}
              className="min-h-24 p-2 text-left"
              style={
                date === today
                  ? { boxShadow: "inset 0 0 0 1px var(--sf-accent)" }
                  : undefined
              }
            >
              <div className="mb-1 text-xs text-[var(--sf-text-muted)]">
                {date.slice(8)}
              </div>
              <div className="flex flex-col gap-1">
                {items.slice(0, 3).map((a) => {
                  const course = data?.courses.find((c) => c.id === a.courseId);
                  return (
                    <div key={a.id} className="truncate text-[11px]">
                      {course && (
                        <CourseBadge
                          code={course.code}
                          color={course.color}
                          className="mb-0.5"
                        />
                      )}
                      <span className="block truncate">{a.title}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function gridDays(start: string): string[] {
  const [y, m] = start.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const weekday = (first.getDay() + 6) % 7;
  const origin = addDays(start, -weekday);
  return Array.from({ length: 42 }, (_, i) => addDays(origin, i));
}
