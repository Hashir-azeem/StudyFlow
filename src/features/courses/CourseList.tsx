import { useLiveQuery } from "dexie-react-hooks";
import { courseService } from "../../core/services/courseService";
import { db } from "../../core/storage";
import { CourseBadge } from "../../components/shared/CourseBadge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import type { Course } from "../../core/types";

export function CourseList({
  onEdit,
  onAdd,
}: {
  onEdit: (course: Course) => void;
  onAdd: () => void;
}) {
  const courses = useLiveQuery(() => db.courses.orderBy("code").toArray());

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight">Courses</h1>
        <Button size="sm" onClick={onAdd}>
          Add
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {(courses ?? []).map((c) => (
          <Card key={c.id} className="flex flex-col gap-2">
            <div className="flex items-start justify-between">
              <div>
                <CourseBadge code={c.code} color={c.color} />
                <p className="mt-2 font-medium">{c.name}</p>
                <p className="text-sm text-[var(--sf-text-muted)]">
                  {c.instructor || "No instructor"}
                </p>
              </div>
              <span
                className="text-xs text-[var(--sf-text-muted)]"
              >
                {c.status}
              </span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onEdit(c)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void (c.status === "archived"
                    ? courseService.restore(c.id)
                    : courseService.archive(c.id))
                }
              >
                {c.status === "archived" ? "Restore" : "Archive"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
