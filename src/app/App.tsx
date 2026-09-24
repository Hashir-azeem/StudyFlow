import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { ToastHost } from "../components/ui/Toast";
import { AssessmentDialog } from "../features/assessments/AssessmentDialog";
import { AssessmentsView } from "../features/assessments/AssessmentsView";
import { CalendarView } from "../features/calendar/CalendarView";
import { CommandPalette } from "../features/command-palette/CommandPalette";
import { usePaletteHotkey } from "../features/command-palette/hotkey";
import { CourseDialog } from "../features/courses/CourseDialog";
import { CoursesView } from "../features/courses/CoursesView";
import { SettingsView } from "../features/settings/SettingsView";
import { TodayView } from "../features/today/TodayView";
import { useClock } from "../state/hooks";
import { useStore } from "../state/store";
import { useReminders } from "../state/useReminders";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ROUTES } from "./routes";
import { Shell } from "./Shell";

export function App() {
  const status = useStore((s) => s.status);
  const loadError = useStore((s) => s.loadError);
  const init = useStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);
  useClock();
  usePaletteHotkey();
  useReminders();

  return (
    <ThemeProvider>
      {status === "loading" ? (
        <div className="grid h-full place-items-center text-sm text-muted" aria-busy="true">Loading your schedule…</div>
      ) : status === "error" ? (
        <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-xl font-semibold">StudyFlow couldn't start</h1>
          <p className="text-sm text-muted">{loadError}</p>
          <Button variant="primary" onClick={() => void init()}>Try again</Button>
        </div>
      ) : (
        <HashRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route path={ROUTES.today} element={<TodayView />} />
              <Route path={ROUTES.assessments} element={<AssessmentsView />} />
              <Route path={ROUTES.calendar} element={<CalendarView />} />
              <Route path={ROUTES.courses} element={<CoursesView />} />
              <Route path={ROUTES.settings} element={<SettingsView />} />
              <Route path="*" element={<Navigate to={ROUTES.today} replace />} />
            </Route>
          </Routes>
          <CommandPalette />
          <CourseDialog />
          <AssessmentDialog />
          <ToastHost />
        </HashRouter>
      )}
    </ThemeProvider>
  );
}
