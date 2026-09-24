import { useCallback, useEffect, useMemo } from "react";
import {
  dueToday,
  MAJOR_KINDS,
  overdue,
  upcoming,
  type TrackedAssessment,
} from "../core/assessments";
import { formatTime } from "../core/dates";
import { classesOn, classStatuses } from "../core/schedule";
import type { Course, ID, TimeOfDay } from "../core/types";
import { useStore } from "./store";

export function useActiveCourses(): Course[] {
  const courses = useStore((s) => s.courses);
  return useMemo(
    () => courses.filter((c) => !c.archived).sort((a, b) => a.code.localeCompare(b.code)),
    [courses],
  );
}

export function useCourseMap(): Map<ID, Course> {
  const courses = useStore((s) => s.courses);
  return useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
}

export function useTodayClasses() {
  const courses = useStore((s) => s.courses);
  const today = useStore((s) => s.today);
  const now = useStore((s) => s.now);
  const occurrences = useMemo(() => classesOn(today, courses), [today, courses]);
  return useMemo(() => classStatuses(occurrences, now), [occurrences, now]);
}

export interface TrackerData {
  overdue: TrackedAssessment[];
  dueToday: TrackedAssessment[];
  /** All open work in the lookahead window (today included). */
  week: TrackedAssessment[];
  /** Midterms and exams only, in the lookahead window. */
  majors: TrackedAssessment[];
}

/** One pass of derived data for the Today view and the 7-day tracker. */
export function useTracker(): TrackerData {
  const courses = useStore((s) => s.courses);
  const assessments = useStore((s) => s.assessments);
  const today = useStore((s) => s.today);
  const days = useStore((s) => s.settings.lookaheadDays);
  return useMemo(
    () => ({
      overdue: overdue(assessments, courses, today),
      dueToday: dueToday(assessments, courses, today),
      week: upcoming(assessments, courses, today, { days }),
      majors: upcoming(assessments, courses, today, { days, kinds: MAJOR_KINDS }),
    }),
    [assessments, courses, today, days],
  );
}

/** Time formatter bound to the user's 12h/24h preference. */
export function useFormatTime(): (t: TimeOfDay) => string {
  const format = useStore((s) => s.settings.timeFormat);
  return useCallback((t: TimeOfDay) => formatTime(t, format), [format]);
}

/** Keeps `today`/`now` fresh: every 30s, and immediately when the window regains focus. */
export function useClock(): void {
  const tick = useStore((s) => s.tick);
  useEffect(() => {
    tick();
    const id = window.setInterval(() => tick(), 30_000);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [tick]);
}
