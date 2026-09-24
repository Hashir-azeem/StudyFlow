import { Search } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { cx } from "../components/ui/cx";
import { useTracker } from "../state/hooks";
import { useStore } from "../state/store";
import { PALETTE_SHORTCUT } from "../features/command-palette/hotkey";
import { NAV, ROUTES } from "./routes";

function PaletteButton({ compact }: { compact?: boolean }) {
  const setOpen = useStore((s) => s.setPaletteOpen);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cx(
        "flex items-center gap-2 rounded-lg border border-border bg-surface text-sm text-muted hover:text-text",
        compact ? "h-9 w-9 justify-center" : "h-9 w-full px-3",
      )}
      aria-label="Open command palette"
    >
      <Search className="h-4 w-4" />
      {compact ? null : (
        <>
          <span className="flex-1 text-left">Search or add</span>
          <kbd className="rounded border border-border px-1 text-[11px]">{PALETTE_SHORTCUT}</kbd>
        </>
      )}
    </button>
  );
}

/**
 * Responsive shell: sidebar on tablets and desktops, bottom tab bar on phones
 * (the layout the Tauri iOS/Android build will use).
 */
export function Shell() {
  const degraded = useStore((s) => s.degraded);
  const { overdue, dueToday } = useTracker();
  const todayCount = overdue.length + dueToday.length;

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 flex-col gap-4 border-r border-border bg-surface p-4 md:flex">
        <div className="px-2 text-lg font-bold tracking-tight">StudyFlow</div>
        <PaletteButton />
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === ROUTES.today}
              className={({ isActive }) =>
                cx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                  isActive ? "bg-accent/12 text-accent" : "text-muted hover:bg-surface-2 hover:text-text",
                )
              }
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1 text-left">{label}</span>
              {to === ROUTES.today && todayCount > 0 ? (
                <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-fg tabular-nums">{todayCount}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {degraded ? (
          <div role="alert" className="bg-warning/15 px-4 py-2 text-center text-sm text-warning">
            Your saved data couldn't be opened. Changes this session won't be kept.
          </div>
        ) : null}
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-2 md:hidden">
          <span className="text-base font-bold tracking-tight">StudyFlow</span>
          <PaletteButton compact />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 pb-24 md:px-8 md:pb-8">
          <Outlet />
        </main>
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === ROUTES.today}
              className={({ isActive }) =>
                cx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium", isActive ? "text-accent" : "text-muted")
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
