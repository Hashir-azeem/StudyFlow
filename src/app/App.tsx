import { useState, type ReactNode } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "../components/layout/AppShell";
import { TodayView } from "../features/dashboard/TodayView";
import { AssessmentList } from "../features/assessments/AssessmentList";
import { AssessmentModal } from "../features/assessments/AssessmentModal";
import { CalendarView } from "../features/calendar/CalendarView";
import { CourseList } from "../features/courses/CourseList";
import { CourseModal } from "../features/courses/CourseModal";
import { ThemeSwitcher } from "../features/settings/ThemeSwitcher";
import { CommandPalette } from "./CommandPalette";
import { courseService } from "../core/services/courseService";
import { assessmentService } from "../core/services/assessmentService";
import { db } from "../core/storage";
import type { Course, CourseDraft, SlotDraft } from "../core/types";

export default function App() {
  const [courseOpen, setCourseOpen] = useState(false);
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const courses = useLiveQuery(() =>
    db.courses.where("status").equals("active").toArray(),
  );
  const editSlots = useLiveQuery(
    () => (editing ? db.classSlots.where("courseId").equals(editing.id).toArray() : []),
    [editing?.id],
  );
  const location = useLocation();

  const openNewCourse = () => {
    setEditing(null);
    setCourseOpen(true);
  };

  const saveCourse = async (draft: CourseDraft) => {
    if (editing) await courseService.update(editing.id, draft);
    else await courseService.create(draft);
    setEditing(null);
  };

  return (
    <>
      <Routes>
        <Route
          element={
            <AppShell
              onAddCourse={openNewCourse}
              onAddAssessment={() => setAssessmentOpen(true)}
            />
          }
        >
          <Route
            path="/"
            element={
              <PageWithTheme>
                <TodayView />
              </PageWithTheme>
            }
          />
          <Route
            path="/assessments"
            element={
              <PageWithTheme>
                <AssessmentList />
              </PageWithTheme>
            }
          />
          <Route
            path="/calendar"
            element={
              <PageWithTheme>
                <CalendarView />
              </PageWithTheme>
            }
          />
          <Route
            path="/courses"
            element={
              <PageWithTheme>
                <CourseList
                  onAdd={openNewCourse}
                  onEdit={(c) => {
                    setEditing(c);
                    setCourseOpen(true);
                  }}
                />
              </PageWithTheme>
            }
          />
        </Route>
      </Routes>
      <CourseModal
        open={courseOpen}
        onOpenChange={(o) => {
          setCourseOpen(o);
          if (!o) setEditing(null);
        }}
        course={editing}
        slots={editSlots as SlotDraft[] | undefined}
        onSave={saveCourse}
      />
      <AssessmentModal
        open={assessmentOpen}
        onOpenChange={setAssessmentOpen}
        courses={courses ?? []}
        onSave={(draft) => assessmentService.create(draft).then(() => undefined)}
      />
      <CommandPalette
        key={location.pathname}
        onAddCourse={openNewCourse}
        onAddAssessment={() => setAssessmentOpen(true)}
      />
    </>
  );
}

function PageWithTheme({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <ThemeSwitcher />
      {children}
    </div>
  );
}
