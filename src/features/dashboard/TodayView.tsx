import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { loadDashboard, type DashboardData } from "../../core/services/dashboardService";
import { db } from "../../core/storage";
import { formatRange } from "../../core/format";
import { CourseBadge } from "../../components/shared/CourseBadge";
import { Card } from "../../components/ui/card";

export function TodayView() {
  const tick = useLiveQuery(async () => {
    const [c, a, s] = await Promise.all([
      db.courses.count(),
      db.assessments.count(),
      db.classSlots.count(),
    ]);
    return `${c}:${a}:${s}`;
  });
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    void loadDashboard().then(setData);
  }, [tick]);

  if (!data) return null;
  const fmt = "12h" as const;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-[var(--sf-text-muted)]">
          Today
        </p>
        <h1 className="text-2xl font-medium tracking-tight">{data.today}</h1>
      </div>
      <section>
        <h2 className="mb-3 text-sm font-medium text-[var(--sf-text-muted)]">
          Classes
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {data.meetings.length === 0 && (
            <Card className="text-sm text-[var(--sf-text-muted)]">
              No classes today.
            </Card>
          )}
          {data.meetings.map(({ slot, course }) => (
            <Card key={slot.id} className="flex items-start justify-between">
              <div>
                <CourseBadge code={course.code} color={course.color} />
                <p className="mt-2 font-medium">{course.name}</p>
                <p className="text-sm text-[var(--sf-text-muted)]">
                  {formatRange(slot.time.startMin, slot.time.endMin, fmt)}
                  {slot.location ? ` · ${slot.location}` : ""}
                </p>
              </div>
              <span
                className="h-full w-1 rounded-full"
                style={{ background: course.color }}
              />
            </Card>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-medium text-[var(--sf-text-muted)]">
          Due today & overdue
        </h2>
        <TaskRows
          items={[...data.overdue, ...data.todayTasks]}
          courses={data.courses}
        />
      </section>
      <section>
        <h2 className="mb-3 text-sm font-medium text-[var(--sf-text-muted)]">
          Exams in 7 days
        </h2>
        <TaskRows items={data.examsIn7Days} courses={data.courses} />
      </section>
    </div>
  );
}

function TaskRows({
  items,
  courses,
}: {
  items: DashboardData["todayTasks"];
  courses: DashboardData["courses"];
}) {
  if (!items.length) {
    return (
      <Card className="text-sm text-[var(--sf-text-muted)]">Nothing here.</Card>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((a) => {
        const course = courses.find((c) => c.id === a.courseId);
        return (
          <Card key={a.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{a.title}</p>
              <p className="text-xs text-[var(--sf-text-muted)]">
                {a.kind} · {a.dueOn} · {a.priority}
              </p>
            </div>
            {course && <CourseBadge code={course.code} color={course.color} />}
          </Card>
        );
      })}
    </div>
  );
}
