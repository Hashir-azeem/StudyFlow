import type { Course } from "../core/types";
import { cx } from "./ui/cx";

/** Tinted pill with the course code. Colors come from the propagator via data-course. */
export function CourseBadge({ course, className }: { course: Course; className?: string }) {
  return (
    <span
      data-course={course.id}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md bg-course-soft px-1.5 py-0.5 text-xs font-semibold text-course-ink",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-course" aria-hidden />
      {course.code}
    </span>
  );
}

export function CourseDot({ course, className }: { course: Course; className?: string }) {
  return (
    <span
      data-course={course.id}
      className={cx("inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-course", className)}
      aria-hidden
    />
  );
}
