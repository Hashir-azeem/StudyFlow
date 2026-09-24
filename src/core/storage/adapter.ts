import type {
  Assessment,
  AssessmentDraft,
  Course,
  CourseDraft,
  CourseStatus,
} from "../types";
import type { ClassSlot, SlotDraft, Term } from "../types/schedule";
import type { AppSettings } from "../types/settings";
import type { ID, ISODate } from "../types/ids";

export interface StorageAdapter {
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;

  listCourses(status?: CourseStatus): Promise<Course[]>;
  getCourse(id: ID): Promise<Course | null>;
  createCourse(draft: CourseDraft): Promise<Course>;
  updateCourse(id: ID, patch: Partial<CourseDraft>): Promise<Course>;
  setCourseStatus(id: ID, status: CourseStatus): Promise<void>;

  listSlots(courseId?: ID): Promise<ClassSlot[]>;
  replaceSlots(courseId: ID, slots: SlotDraft[]): Promise<ClassSlot[]>;

  listTerms(): Promise<Term[]>;
  upsertTerm(term: Term): Promise<Term>;

  listAssessments(filter?: {
    courseId?: ID;
    from?: ISODate;
    to?: ISODate;
  }): Promise<Assessment[]>;
  getAssessment(id: ID): Promise<Assessment | null>;
  createAssessment(draft: AssessmentDraft): Promise<Assessment>;
  updateAssessment(
    id: ID,
    patch: Partial<AssessmentDraft>,
  ): Promise<Assessment>;
  setAssessmentStatus(id: ID, status: Assessment["status"]): Promise<void>;
}
