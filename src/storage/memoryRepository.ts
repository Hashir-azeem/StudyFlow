import type { Assessment, Course, ID, Settings, Snapshot } from "../core/types";
import { DEFAULT_SETTINGS } from "../core/types";
import type { Repository } from "./repository";
import { parseSnapshot } from "./snapshot";

/** In-memory backend for unit tests, Storybook, and last-resort fallback. */
export class MemoryRepository implements Repository {
  readonly backend = "memory" as const;
  private courses = new Map<ID, Course>();
  private assessments = new Map<ID, Assessment>();
  private settings: Settings = { ...DEFAULT_SETTINGS };

  async init(): Promise<void> {}

  async listCourses(): Promise<Course[]> {
    return [...this.courses.values()].map((c) => structuredClone(c));
  }
  async upsertCourse(course: Course): Promise<void> {
    this.courses.set(course.id, structuredClone(course));
  }
  async deleteCourse(id: ID): Promise<void> {
    for (const [aid, a] of this.assessments) if (a.courseId === id) this.assessments.delete(aid);
    this.courses.delete(id);
  }
  async listAssessments(): Promise<Assessment[]> {
    return [...this.assessments.values()].map((a) => structuredClone(a));
  }
  async upsertAssessment(assessment: Assessment): Promise<void> {
    this.assessments.set(assessment.id, structuredClone(assessment));
  }
  async deleteAssessment(id: ID): Promise<void> {
    this.assessments.delete(id);
  }
  async getSettings(): Promise<Settings> {
    return { ...this.settings };
  }
  async saveSettings(settings: Settings): Promise<void> {
    this.settings = { ...settings };
  }
  async exportSnapshot(): Promise<Snapshot> {
    return {
      version: 1,
      exportedAt: Date.now(),
      courses: await this.listCourses(),
      assessments: await this.listAssessments(),
      settings: await this.getSettings(),
    };
  }
  async importSnapshot(raw: Snapshot): Promise<void> {
    const { snapshot } = parseSnapshot(raw);
    this.courses = new Map(snapshot.courses.map((c) => [c.id, c]));
    this.assessments = new Map(snapshot.assessments.map((a) => [a.id, a]));
    this.settings = snapshot.settings;
  }
}
