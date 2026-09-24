import { NavLink, Outlet } from "react-router-dom";
import {
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  ListChecks,
  Plus,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { cn } from "../lib/cn";

const links = [
  { to: "/", label: "Today", icon: LayoutDashboard, end: true },
  { to: "/assessments", label: "Assessments", icon: ListChecks },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/courses", label: "Courses", icon: BookOpen },
];

export function AppShell({
  onAddCourse,
  onAddAssessment,
}: {
  onAddCourse: () => void;
  onAddAssessment: () => void;
}) {
  return (
    <div className="flex min-h-svh bg-[var(--sf-bg)] text-[var(--sf-text)]">
      <aside className="hidden w-56 shrink-0 border-r border-[var(--sf-border)] bg-[var(--sf-bg-subtle)] p-4 md:flex md:flex-col">
        <div className="mb-6 px-2 text-sm font-semibold tracking-tight">
          studyflow
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-lg px-2 py-2 text-sm",
                  isActive
                    ? "bg-[var(--sf-surface)] text-[var(--sf-text)] shadow-sm"
                    : "text-[var(--sf-text-muted)] hover:bg-[var(--sf-surface)]/60",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <Button size="sm" variant="outline" onClick={onAddCourse}>
            <Plus className="h-3.5 w-3.5" />
            Course
          </Button>
          <Button size="sm" onClick={onAddAssessment}>
            <Plus className="h-3.5 w-3.5" />
            Assessment
          </Button>
          <p className="px-1 text-[10px] text-[var(--sf-text-muted)]">
            ⌘K / Ctrl+K command palette
          </p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--sf-border)] px-4 py-3 md:hidden">
          <span className="text-sm font-semibold">studyflow</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onAddCourse}>
              Course
            </Button>
            <Button size="sm" onClick={onAddAssessment}>
              Task
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
