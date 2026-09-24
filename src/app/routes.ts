import { BookOpen, CalendarDays, ListChecks, Settings, Sun, type LucideIcon } from "lucide-react";

/**
 * Hash-based routes (#/calendar) work identically in `vite dev`, Tauri desktop,
 * and Tauri iOS/Android without any server-side fallback config, and still give
 * Android's hardware back button real history to walk.
 */
export const ROUTES = {
  today: "/",
  assessments: "/assessments",
  calendar: "/calendar",
  courses: "/courses",
  settings: "/settings",
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

export const NAV: Array<{ to: RoutePath; label: string; icon: LucideIcon }> = [
  { to: ROUTES.today, label: "Today", icon: Sun },
  { to: ROUTES.assessments, label: "Assessments", icon: ListChecks },
  { to: ROUTES.calendar, label: "Calendar", icon: CalendarDays },
  { to: ROUTES.courses, label: "Courses", icon: BookOpen },
  { to: ROUTES.settings, label: "Settings", icon: Settings },
];
