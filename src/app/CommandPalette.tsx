import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { THEME_PRESETS } from "../core/theme/presets";
import { themeService } from "../core/services/themeService";
import { broadcastSettings } from "./ThemeProvider";

export function CommandPalette({
  onAddCourse,
  onAddAssessment,
}: {
  onAddCourse: () => void;
  onAddAssessment: () => void;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-start bg-black/40 pt-[15vh]">
      <Command
        className="mx-auto w-[min(560px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--sf-border)] bg-[var(--sf-surface)] shadow-2xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <Command.Input
          autoFocus
          placeholder="Add a course, jump to today, switch theme…"
          className="h-12 w-full border-b border-[var(--sf-border)] bg-transparent px-4 text-sm outline-none"
        />
        <Command.List className="max-h-80 overflow-auto p-2 text-sm">
          <Command.Empty className="px-2 py-6 text-center text-[var(--sf-text-muted)]">
            No matches
          </Command.Empty>
          <Command.Group heading="Navigate" className="mb-2">
            <Item onSelect={() => run(() => navigate("/"))}>Today</Item>
            <Item onSelect={() => run(() => navigate("/assessments"))}>
              Assessments
            </Item>
            <Item onSelect={() => run(() => navigate("/calendar"))}>
              Calendar
            </Item>
            <Item onSelect={() => run(() => navigate("/courses"))}>
              Courses
            </Item>
          </Command.Group>
          <Command.Group heading="Create" className="mb-2">
            <Item onSelect={() => run(onAddCourse)}>New course</Item>
            <Item onSelect={() => run(onAddAssessment)}>New assessment</Item>
          </Command.Group>
          <Command.Group heading="Themes">
            {THEME_PRESETS.map((p) => (
              <Item
                key={p.id}
                onSelect={() =>
                  run(() => {
                    void themeService.setPreset(p.id).then(broadcastSettings);
                  })
                }
              >
                Theme: {p.label}
              </Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <button
        type="button"
        className="absolute inset-0 -z-10"
        aria-label="Close palette"
        onClick={() => setOpen(false)}
      />
    </div>
  );
}

function Item({
  children,
  onSelect,
}: {
  children: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="cursor-pointer rounded-md px-2 py-2 aria-selected:bg-[var(--sf-bg-subtle)]"
    >
      {children}
    </Command.Item>
  );
}
