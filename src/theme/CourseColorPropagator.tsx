import { useMemo } from "react";
import { deriveCourseColors } from "../core/colors";
import type { Course, Theme } from "../core/types";
import { useStore } from "../state/store";

function escapeAttr(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

export function buildCourseCss(courses: Course[], theme: Theme): string {
  return courses
    .map((course) => {
      const v = deriveCourseColors(course.color, theme.tokens.bg, theme.mode);
      return `[data-course="${escapeAttr(course.id)}"]{--course:${v.base};--course-on:${v.onBase};--course-soft:${v.soft};--course-ink:${v.ink};}`;
    })
    .join("\n");
}

/**
 * Course Color Propagator.
 *
 * Emits one CSS rule per course that defines --course, --course-on,
 * --course-soft and --course-ink for any element carrying
 * data-course="<id>". Components never compute colors themselves; they
 * set the attribute and use the Tailwind utilities bg-course, text-course-ink,
 * border-course, bg-course-soft, etc.
 *
 * Result: changing a course's color, or switching theme, recolors every
 * calendar chip, card, badge, and exam indicator in a single style update,
 * with no component re-rendering, and ink colors always meet WCAG AA contrast.
 */
export function CourseColorPropagator({ theme }: { theme: Theme }) {
  const courses = useStore((s) => s.courses);
  const css = useMemo(() => buildCourseCss(courses, theme), [courses, theme]);
  return <style data-course-colors="">{css}</style>;
}
