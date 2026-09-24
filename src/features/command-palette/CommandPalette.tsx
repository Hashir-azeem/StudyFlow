import { Command } from "cmdk";
import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  Check,
  Download,
  ListChecks,
  Monitor,
  Palette,
  Plus,
  Settings,
  Sparkles,
  Sun,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../app/routes";
import { PALETTE_SHORTCUT } from "./hotkey";
import { KIND_LABEL } from "../../core/assessments";
import { formatDate } from "../../core/dates";
import { parseQuickAdd, quickAddToDraft } from "../../core/quickAdd";
import type { ThemePreference } from "../../core/types";
import { CourseBadge } from "../../components/CourseBadge";
import { cx } from "../../components/ui/cx";
import { saveBackupFile } from "../../platform/backupFile";
import { useActiveCourses, useCourseMap, useFormatTime } from "../../state/hooks";
import { useStore } from "../../state/store";
import { THEME_LIST } from "../../theme/themes";

const itemClass =
  "flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2 text-sm text-text " +
  "data-[selected=true]:bg-accent/12 data-[selected=true]:text-text data-[disabled=true]:opacity-50";

function Item({
  value,
  keywords,
  onSelect,
  icon,
  children,
  trailing,
  forceMount,
}: {
  value: string;
  keywords?: string[];
  onSelect: () => void;
  icon?: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  forceMount?: boolean;
}) {
  return (
    <Command.Item value={value} keywords={keywords} onSelect={onSelect} className={itemClass} forceMount={forceMount}>
      <span className="grid h-5 w-5 shrink-0 place-items-center text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing ? <span className="shrink-0 text-xs text-muted">{trailing}</span> : null}
    </Command.Item>
  );
}

const groupClass =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 " +
  "[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted";

export function CommandPalette() {
  const formatTime = useFormatTime();
  const open = useStore((s) => s.paletteOpen);
  const setOpen = useStore((s) => s.setPaletteOpen);
  const today = useStore((s) => s.today);
  const themePref = useStore((s) => s.settings.theme);
  const assessments = useStore((s) => s.assessments);
  const navigate = useNavigate();
  const setCalendarMode = useStore((s) => s.setCalendarMode);
  const setTheme = useStore((s) => s.setTheme);
  const openCourseDialog = useStore((s) => s.openCourseDialog);
  const openAssessmentDialog = useStore((s) => s.openAssessmentDialog);
  const createAssessment = useStore((s) => s.createAssessment);
  const exportData = useStore((s) => s.exportData);
  const showMessage = useStore((s) => s.showMessage);
  const courses = useActiveCourses();
  const courseMap = useCourseMap();
  const [query, setQuery] = useState("");

  // Start clean each time the palette opens.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const parse = useMemo(
    () => (query.trim().length >= 2 ? parseQuickAdd(query, courses, today) : null),
    [query, courses, today],
  );
  // Offer quick add only when the text looks like a new assessment. A bare course
  // code ("cs101") or a word like "calendar" is treated as a search instead.
  const looksLikeQuickAdd = Boolean(parse && (parse.kind || parse.dueDate || parse.weight !== null));
  const quick = parse && looksLikeQuickAdd ? quickAddToDraft(parse, today) : null;

  const run = (fn: () => void | Promise<unknown>) => () => {
    setOpen(false);
    void fn();
  };

  const searchable = useMemo(
    () =>
      assessments
        .filter((a) => courseMap.get(a.courseId) && !courseMap.get(a.courseId)!.archived)
        .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)),
    [assessments, courseMap],
  );

  const themeOptions: Array<{ id: ThemePreference; name: string }> = [
    { id: "system", name: "Match system" },
    ...THEME_LIST.map((t) => ({ id: t.id, name: t.name })),
  ];

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      loop
      overlayClassName="fixed inset-0 z-40 bg-black/40"
      contentClassName={cx(
        "fixed left-1/2 top-[12vh] z-50 w-[min(94vw,620px)] -translate-x-1/2 overflow-hidden",
        "rounded-2xl border border-border bg-surface shadow-2xl",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Sparkles className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder='Search, or type "midterm cs101 oct 14 3pm 20%"'
          className="h-12 w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
        />
        <kbd className="hidden shrink-0 rounded border border-border px-1.5 text-[11px] text-muted sm:block">Esc</kbd>
      </div>

      <Command.List className="max-h-[min(60vh,440px)] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-8 text-center text-sm text-muted">
          No matches. Try a course code, a view, or a theme.
        </Command.Empty>

        {parse && looksLikeQuickAdd ? (
          <Command.Group heading="Quick add" className={groupClass} forceMount>
            {quick?.ok ? (
              <Item
                value={`__quick__ ${query}`}
                forceMount
                icon={<Plus className="h-4 w-4 text-accent" />}
                onSelect={run(async () => {
                  const result = await createAssessment(quick.draft);
                  if (!result.ok) openAssessmentDialog({ mode: "create", prefill: quick.draft });
                })}
                trailing="Enter to add"
              >
                <span className="font-medium">{quick.draft.title}</span>
                <span className="ml-2 inline-flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  {parse.course ? <CourseBadge course={parse.course} /> : null}
                  <span>{KIND_LABEL[quick.draft.kind]}</span>
                  <span>{formatDate(quick.draft.dueDate)}</span>
                  {quick.draft.dueTime ? <span>{formatTime(quick.draft.dueTime)}</span> : null}
                  {quick.draft.weight !== null ? <span>{quick.draft.weight}%</span> : null}
                  {quick.draft.priority === "high" ? <span className="text-danger">High</span> : null}
                </span>
              </Item>
            ) : (
              <Item
                value={`__quick-incomplete__ ${query}`}
                forceMount
                icon={<Plus className="h-4 w-4" />}
                onSelect={run(() =>
                  openAssessmentDialog({
                    mode: "create",
                    prefill: {
                      title: parse.title,
                      ...(parse.course ? { courseId: parse.course.id } : {}),
                      ...(parse.kind ? { kind: parse.kind } : {}),
                      ...(parse.dueDate ? { dueDate: parse.dueDate } : {}),
                      dueTime: parse.dueTime,
                      ...(parse.weight !== null ? { weight: parse.weight } : {}),
                      ...(parse.priority ? { priority: parse.priority } : {}),
                    },
                  }),
                )}
                trailing="Finish in form"
              >
                {courses.length === 0
                  ? "Add a course first, then quick add works with its code"
                  : quick && !quick.ok && quick.missing.includes("course")
                    ? `Add "${parse.title || "assessment"}", then pick a course`
                    : "Add an assessment, then give it a title"}
              </Item>
            )}
          </Command.Group>
        ) : null}

        <Command.Group heading="Go to" className={groupClass}>
          <Item value="Today" keywords={["home", "dashboard"]} icon={<Sun className="h-4 w-4" />} onSelect={run(() => navigate(ROUTES.today))}>
            Today
          </Item>
          <Item value="Calendar week" keywords={["schedule", "week"]} icon={<CalendarDays className="h-4 w-4" />} onSelect={run(() => { navigate(ROUTES.calendar); setCalendarMode("week"); })}>
            Calendar: week
          </Item>
          <Item value="Calendar month" keywords={["schedule", "month"]} icon={<CalendarRange className="h-4 w-4" />} onSelect={run(() => { navigate(ROUTES.calendar); setCalendarMode("month"); })}>
            Calendar: month
          </Item>
          <Item value="Assessments" keywords={["tasks", "deadlines", "list", "all"]} icon={<ListChecks className="h-4 w-4" />} onSelect={run(() => navigate(ROUTES.assessments))}>
            Assessments
          </Item>
          <Item value="Courses" keywords={["classes", "subjects"]} icon={<BookOpen className="h-4 w-4" />} onSelect={run(() => navigate(ROUTES.courses))}>
            Courses
          </Item>
          <Item value="Settings" keywords={["preferences", "reminders", "notifications", "week"]} icon={<Settings className="h-4 w-4" />} onSelect={run(() => navigate(ROUTES.settings))}>
            Settings
          </Item>
        </Command.Group>

        <Command.Group heading="Create" className={groupClass}>
          <Item value="New assessment" keywords={["add", "task", "assignment", "deadline"]} icon={<Plus className="h-4 w-4" />} onSelect={run(() => openAssessmentDialog({ mode: "create" }))}>
            New assessment
          </Item>
          <Item value="New midterm" keywords={["add", "test"]} icon={<Plus className="h-4 w-4" />} onSelect={run(() => openAssessmentDialog({ mode: "create", prefill: { kind: "midterm" } }))}>
            New midterm
          </Item>
          <Item value="New exam" keywords={["add", "final"]} icon={<Plus className="h-4 w-4" />} onSelect={run(() => openAssessmentDialog({ mode: "create", prefill: { kind: "exam" } }))}>
            New exam
          </Item>
          <Item value="New course" keywords={["add", "class", "subject"]} icon={<Plus className="h-4 w-4" />} onSelect={run(() => openCourseDialog({ mode: "create" }))}>
            New course
          </Item>
        </Command.Group>

        <Command.Group heading="Data" className={groupClass}>
          <Item value="Save backup" keywords={["export", "download", "backup"]} icon={<Download className="h-4 w-4" />} onSelect={run(async () => {
              try {
                if (await saveBackupFile(await exportData())) showMessage("info", "Backup saved.");
              } catch (err) {
                showMessage("error", `Backup wasn't saved: ${err instanceof Error ? err.message : String(err)}`);
              }
            })}>
            Save backup
          </Item>
          <Item value="Restore from backup" keywords={["import", "restore", "backup"]} icon={<Upload className="h-4 w-4" />} onSelect={run(() => navigate(ROUTES.settings))} trailing="Opens Settings">
            Restore from backup
          </Item>
        </Command.Group>

        <Command.Group heading="Theme" className={groupClass}>
          {themeOptions.map((t) => (
            <Item
              key={t.id}
              value={`Theme ${t.name}`}
              keywords={["theme", "color", "appearance", t.id]}
              icon={t.id === "system" ? <Monitor className="h-4 w-4" /> : <Palette className="h-4 w-4" />}
              onSelect={run(() => setTheme(t.id))}
              trailing={themePref === t.id ? <Check className="h-4 w-4 text-accent" aria-label="Current theme" /> : undefined}
            >
              {t.name}
            </Item>
          ))}
        </Command.Group>

        {query.trim() ? (
          <>
            <Command.Group heading="Courses" className={groupClass}>
              {courses.map((c) => (
                <Item
                  key={c.id}
                  value={`course ${c.code} ${c.name}`}
                  keywords={[c.instructor ?? ""]}
                  icon={<span data-course={c.id} className="h-2.5 w-2.5 rounded-full bg-course" />}
                  onSelect={run(() => openCourseDialog({ mode: "edit", id: c.id }))}
                  trailing="Edit"
                >
                  {c.code}: {c.name}
                </Item>
              ))}
            </Command.Group>
            <Command.Group heading="Assessments" className={groupClass}>
              {searchable.map((a) => {
                const c = courseMap.get(a.courseId)!;
                return (
                  <Item
                    key={a.id}
                    value={`assessment ${a.title} ${c.code} ${a.id}`}
                    keywords={[KIND_LABEL[a.kind], c.name]}
                    icon={<span data-course={c.id} className="h-2.5 w-2.5 rounded-full bg-course" />}
                    onSelect={run(() => openAssessmentDialog({ mode: "edit", id: a.id }))}
                    trailing={formatDate(a.dueDate)}
                  >
                    <span className={cx(a.status === "done" && "text-muted line-through")}>{a.title}</span>
                    <span className="ml-2 text-xs text-muted">{c.code}</span>
                  </Item>
                );
              })}
            </Command.Group>
          </>
        ) : null}
      </Command.List>

      <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted">
        <span>↑↓ to move, Enter to run</span>
        <span>{PALETTE_SHORTCUT} to toggle</span>
      </div>
    </Command.Dialog>
  );
}
