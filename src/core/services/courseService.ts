import type { Course, CourseDraft, CourseStatus } from "../types/course";
import type { ClassSlot } from "../types/schedule";
import type { ID } from "../types/ids";
import { adapter } from "../storage";

export const courseService = {
  list(status?: CourseStatus) {
    return adapter.listCourses(status);
  },
  get(id: ID) {
    return adapter.getCourse(id);
  },
  create(draft: CourseDraft) {
    return adapter.createCourse(draft);
  },
  update(id: ID, patch: Partial<CourseDraft>) {
    return adapter.updateCourse(id, patch);
  },
  archive(id: ID) {
    return adapter.setCourseStatus(id, "archived");
  },
  restore(id: ID) {
    return adapter.setCourseStatus(id, "active");
  },
  slots(courseId?: ID) {
    return adapter.listSlots(courseId);
  },
};

export async function coursesWithSlots(): Promise<
  Array<Course & { slots: ClassSlot[] }>
> {
  const [courses, slots] = await Promise.all([
    adapter.listCourses("active"),
    adapter.listSlots(),
  ]);
  return courses.map((c) => ({
    ...c,
    slots: slots.filter((s) => s.courseId === c.id),
  }));
}
