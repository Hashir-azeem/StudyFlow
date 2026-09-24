import { useLiveQuery } from "dexie-react-hooks";
import { assessmentService } from "../../core/services/assessmentService";
import { db } from "../../core/storage";
import { CourseBadge } from "../../components/shared/CourseBadge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";

export function AssessmentList() {
  const rows = useLiveQuery(async () => {
    const [assessments, courses] = await Promise.all([
      db.assessments.orderBy("dueOn").toArray(),
      db.courses.toArray(),
    ]);
    return { assessments, courses };
  });

  if (!rows) return null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-2xl font-medium tracking-tight">Assessments</h1>
      <div className="flex flex-col gap-2">
        {rows.assessments.map((a) => {
          const course = rows.courses.find((c) => c.id === a.courseId);
          const done = a.status === "done";
          return (
            <Card
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className={done ? "truncate line-through opacity-50" : "truncate font-medium"}>
                  {a.title}
                </p>
                <p className="text-xs text-[var(--sf-text-muted)]">
                  {a.kind} · due {a.dueOn}
                  {a.weightPercent != null ? ` · ${a.weightPercent}%` : ""} ·{" "}
                  {a.priority}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {course && (
                  <CourseBadge code={course.code} color={course.color} />
                )}
                <Button
                  size="sm"
                  variant={done ? "outline" : "ghost"}
                  onClick={() =>
                    void assessmentService.setStatus(
                      a.id,
                      done ? "todo" : "done",
                    )
                  }
                >
                  {done ? "Undo" : "Done"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
