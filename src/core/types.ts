/**
 * Core domain model. Framework-free: no React, Tauri, or storage imports,
 * so this layer ports unchanged to Tauri Mobile or React Native.
 *
 * Date/time conventions (deliberately timezone-free):
 *  - ISODate:   "YYYY-MM-DD" in the student's local calendar.
 *  - TimeOfDay: "HH:mm" 24h local wall-clock time.
 *  - Timestamp: epoch milliseconds, used only for audit fields.
 * Storing wall-clock values avoids the classic bug where a 23:59 deadline
 * shifts to the next day after a DST change or a trip across time zones.
 */

export type ID = string;
export type ISODate = string;
export type TimeOfDay = string;
export type Timestamp = number;
/** "#RRGGBB" */
export type HexColor = string;

/** 0 = Sunday … 6 = Saturday (matches Date#getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const SESSION_KINDS = ["lecture", "lab", "tutorial", "seminar"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export interface ScheduleSlot {
  id: ID;
  /** Every weekday this meeting repeats on, e.g. [1, 3] for Mon/Wed. Never empty. */
  days: Weekday[];
  start: TimeOfDay;
  /** Must be later than `start`; classes crossing midnight are rejected by validation. */
  end: TimeOfDay;
  kind: SessionKind;
  location: string | null;
}

export interface Course {
  id: ID;
  name: string;
  /** e.g. "CS 101". Unique among non-archived courses (case/space-insensitive). */
  code: string;
  instructor: string | null;
  color: HexColor;
  schedule: ScheduleSlot[];
  /** Classes are only shown between these dates when set (inclusive). */
  termStart: ISODate | null;
  termEnd: ISODate | null;
  /** Dates with no class (reading week, holidays). */
  skipDates: ISODate[];
  archived: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const ASSESSMENT_KINDS = [
  "exam",
  "midterm",
  "quiz",
  "project",
  "assignment",
  "task",
] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export const PRIORITIES = ["low", "medium", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ASSESSMENT_STATUSES = ["todo", "in_progress", "done"] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export interface Assessment {
  id: ID;
  /** Every assessment belongs to exactly one course. Deleting a course deletes its assessments. */
  courseId: ID;
  title: string;
  kind: AssessmentKind;
  dueDate: ISODate;
  /** null = due "sometime that day" (sorted after timed items). */
  dueTime: TimeOfDay | null;
  priority: Priority;
  /** Percent of final grade, 0–100, or null when ungraded / unknown. */
  weight: number | null;
  status: AssessmentStatus;
  /** Percent score once graded, 0–100+ (bonus marks allowed). */
  grade: number | null;
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Input shapes for create/update: audit fields and id are owned by the store. */
export type CourseDraft = Omit<Course, "id" | "createdAt" | "updatedAt">;
export type AssessmentDraft = Omit<Assessment, "id" | "createdAt" | "updatedAt">;

export const THEME_IDS = ["light", "dark", "pastel", "synthwave", "mono"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export type ThemePreference = ThemeId | "system";
export type ThemeMode = "light" | "dark";

/** Space-separated RGB channels, e.g. "24 24 27", so Tailwind can apply alpha. */
export type RGBChannels = string;

export interface ThemeTokens {
  bg: RGBChannels;
  surface: RGBChannels;
  surface2: RGBChannels;
  border: RGBChannels;
  text: RGBChannels;
  muted: RGBChannels;
  accent: RGBChannels;
  accentFg: RGBChannels;
  danger: RGBChannels;
  warning: RGBChannels;
  success: RGBChannels;
}

export interface Theme {
  id: ThemeId;
  name: string;
  mode: ThemeMode;
  tokens: ThemeTokens;
  /** Suggested course colors that read well on this theme. */
  coursePalette: HexColor[];
}

export interface Settings {
  theme: ThemePreference;
  weekStartsOn: 0 | 1;
  /** How many days ahead the upcoming tracker looks. */
  lookaheadDays: number;
  /** Deadline reminders via system notifications (needs OS permission). */
  notifications: boolean;
  /** "auto" follows the device locale. */
  timeFormat: TimeFormat;
  /** Overrides the theme's accent color; null uses the theme's own. */
  accent: HexColor | null;
}

export type TimeFormat = "auto" | "12h" | "24h";

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  weekStartsOn: 1,
  lookaheadDays: 7,
  notifications: false,
  timeFormat: "auto",
  accent: null,
};

/** Full export format; also the migration payload between storage backends. */
export interface Snapshot {
  version: 1;
  exportedAt: Timestamp;
  courses: Course[];
  assessments: Assessment[];
  settings: Settings;
}


export type Result<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };
export type FieldErrors = Record<string, string>;
