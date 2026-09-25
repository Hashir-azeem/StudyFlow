import { isHexColor, normalizeHex } from "../core/colors";
import { coerceAssessment, coerceCourse } from "../core/validation";
import { AMBIENT_EFFECTS, DEFAULT_SETTINGS, THEME_IDS, type AmbientSettings, type Settings, type Snapshot } from "../core/types";
import { StorageError } from "./repository";

function coerceAmbient(raw: unknown): AmbientSettings {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const intensity = Number(r.intensity);
  return {
    effect: AMBIENT_EFFECTS.includes(r.effect as never) ? (r.effect as AmbientSettings["effect"]) : "none",
    motion: r.motion === "on" || r.motion === "off" ? r.motion : "auto",
    intensity: Number.isInteger(intensity) && intensity >= 1 && intensity <= 5 ? (intensity as AmbientSettings["intensity"]) : 3,
  };
}

export function coerceSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const r = raw as Record<string, unknown>;
  const theme =
    r.theme === "system" || THEME_IDS.includes(r.theme as never)
      ? (r.theme as Settings["theme"])
      : DEFAULT_SETTINGS.theme;
  const lookahead = Number(r.lookaheadDays);
  return {
    theme,
    weekStartsOn: r.weekStartsOn === 0 ? 0 : 1,
    lookaheadDays: Number.isInteger(lookahead) && lookahead >= 1 && lookahead <= 60 ? lookahead : DEFAULT_SETTINGS.lookaheadDays,
    notifications: r.notifications === true,
    timeFormat: r.timeFormat === "12h" || r.timeFormat === "24h" ? r.timeFormat : "auto",
    accent: typeof r.accent === "string" && isHexColor(normalizeHex(r.accent)) ? normalizeHex(r.accent) : null,
    ambient: coerceAmbient(r.ambient),
  };
}

/**
 * Parse an imported file. Unrepairable rows are dropped and assessments whose
 * course is missing are discarded, so the result always satisfies the
 * "every assessment belongs to a course" invariant.
 */
export function parseSnapshot(raw: unknown): { snapshot: Snapshot; dropped: number } {
  if (!raw || typeof raw !== "object" || (raw as { version?: unknown }).version !== 1) {
    throw new StorageError("This file isn't a StudyFlow backup.", "import data");
  }
  const r = raw as Record<string, unknown>;
  const rawCourses = Array.isArray(r.courses) ? r.courses : [];
  const rawAssessments = Array.isArray(r.assessments) ? r.assessments : [];
  const courses = rawCourses.map(coerceCourse).filter((c) => c !== null);
  const ids = new Set(courses.map((c) => c.id));
  const assessments = rawAssessments
    .map(coerceAssessment)
    .filter((a) => a !== null && ids.has(a.courseId));
  return {
    snapshot: {
      version: 1,
      exportedAt: typeof r.exportedAt === "number" ? r.exportedAt : Date.now(),
      courses,
      assessments: assessments as Snapshot["assessments"],
      settings: coerceSettings(r.settings),
    },
    dropped: rawCourses.length - courses.length + rawAssessments.length - assessments.length,
  };
}
