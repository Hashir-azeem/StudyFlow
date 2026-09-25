# StudyFlow

Tauri v2 + React 19 + TypeScript 6 (strict) + Tailwind v4 + Vite 8. Offline-first, and the same code runs on desktop and Tauri Mobile.

See **AUDIT.md** for what was wrong with the first Cursor-generated version and what was kept from it.

## First run

```bash
rm -rf node_modules && npm install     # node_modules from another OS won't work
npm test                               # unit tests (core, ambient, outline parser)
npm run dev                            # browser, IndexedDB storage
npx tauri icon src-tauri/app-icon.png  # generates src-tauri/icons/* (needed once)
npm run tauri dev                      # desktop app, SQLite storage
```

To install StudyFlow as a normal desktop app with automatic updates, follow **DESKTOP.md**.

Ambient particle backgrounds and course-outline import are described in **docs/ambient-and-outline-import.md**.

Mobile: `npx tauri android init` / `npx tauri ios init`, then `npm run tauri android dev`.

## Structure

```
src/
  core/            Pure TypeScript. No React, no Tauri. Ports anywhere.
    types.ts         Domain model (Course, Assessment, ScheduleSlot, Theme, Settings, Snapshot)
    dates.ts         Timezone-free date math on "YYYY-MM-DD" / "HH:mm"
    schedule.ts      Which classes happen on a date; live/next status; slot conflicts
    assessments.ts   7-day tracker, due today, overdue, grouping, weight/grade summary
    colors.ts        Course color derivation with WCAG contrast guarantees
    quickAdd.ts      Natural-language parser behind the command palette
    validation.ts    Form validation + defensive coercion of stored/imported rows
    templates.ts     Pre-filled defaults per assessment type
    sampleData.ts    Opt-in demo courses
    reminders.ts     Deadline reminder rules (pure, tested)
  storage/         Repository interface + three backends
    repository.ts    The contract every backend implements
    sqliteRepository.ts   Tauri desktop/iOS/Android (@tauri-apps/plugin-sql)
    dexieRepository.ts    Browser / `vite dev` (IndexedDB)
    memoryRepository.ts   Tests and last-resort fallback
    snapshot.ts      Import/export validation
    legacyMigration.ts  Converters from the original Cursor schema (tested)
    index.ts         Picks a backend at runtime (code-split)
  platform/
    updater.ts       Check, download, install, relaunch (desktop only)
    notify.ts        System notifications (Tauri plugin or Web Notification API)
    backupFile.ts    Native save/open dialogs in Tauri, download/file picker in browser
  state/
    store.ts         Zustand store: optimistic writes, rollback on failure, undo
    hooks.ts         Memoized selectors + midnight-rollover clock
    useReminders.ts  Sends due reminders, remembers what was sent
    updates.ts       Update status + background check every 6 hours
  theme/
    themes.ts        Daylight, Late night, Pastel, Synthwave, Monochrome
    ThemeProvider.tsx         Writes tokens to <html>, follows OS in "system" mode
    CourseColorPropagator.tsx One <style> rule per course → every course-colored element
  components/      UI primitives (Button, Dialog, Field, Toast) + CourseBadge
  features/        today/, assessments/, calendar/, courses/, command-palette/, settings/
  app/             App root, routes, responsive shell (sidebar ↔ bottom tabs)
  lib/cn.ts        clsx + tailwind-merge
src-tauri/
  src/lib.rs       Plugin registration + SQLite schema migrations
                   (desktop adds single-instance, window-state, updater, process)
  tauri.local.conf.json  Override for unsigned local installer builds
  src/main.rs, build.rs, Cargo.toml, tauri.conf.json
  capabilities/default.json
  app-icon.png     Source for `tauri icon`
tests/core.test.ts
.github/workflows/
  release.yml      Tag v* → signed Windows installer + latest.json on GitHub Releases
  ci.yml           Typecheck, test, and lint on every push
```

## How the key pieces work

**Course color propagation.** A course's color is stored once. `CourseColorPropagator` emits one CSS rule per course that sets `--course`, `--course-on`, `--course-soft` and `--course-ink` on any element with `data-course="<id>"`. Components use the Tailwind utilities `bg-course`, `bg-course-soft`, `text-course-ink`, `border-course`. Recoloring a course or switching themes restyles every chip, card and badge with a single style update. Ink colors are adjusted per theme so they always pass WCAG AA; the test suite checks every palette color against every theme.

**Command palette (⌘K / Ctrl K).** Navigation, create actions, theme switching, and search across courses and assessments. Typing something like `midterm cs101 oct 14 3pm 20% !!!` shows a live preview and creates the assessment on Enter. If a required part is missing, Enter opens the form pre-filled with everything that was understood.

**7-day tracker.** A day ribbon shows each day's load as course-colored dots (ringed for exams and midterms); tap a day to filter. The Today view shows two trackers (exams and midterms, and everything), plus overdue work, which a plain "next 7 days" filter would silently hide.

**Persistence.** Components never touch a database directly: everything goes through the store and the `Repository` interface. Every write updates the UI immediately, persists in the background, and rolls back with an error toast if the write fails. Deletes offer Undo. If storage can't open at all, the app still runs in memory and shows a banner saying changes won't be kept.

## Edge cases handled

- Deadlines are stored as wall-clock date + optional time, so they never shift across DST or time zones.
- The app rolls over at midnight and when the window regains focus after sleep.
- Untimed items sort after timed ones on the same day.
- Course codes are unique ignoring case and spacing; restoring an archived course checks for collisions.
- Classes that end before they start, have no days, or overlap on a shared day within a course are rejected.
- Term start/end and skip dates (reading week, holidays) hide classes.
- Weights over 100% per course are flagged, not blocked.
- Orphaned assessments (course missing) never crash the app and are dropped on import.
- Corrupt rows are repaired or skipped individually rather than failing the whole load.
- SQLite upserts use `ON CONFLICT DO UPDATE`, not `INSERT OR REPLACE`, which would cascade-delete a course's assessments.
- StrictMode double-mount doesn't open the database twice.
- A custom accent is adjusted to stay visible (3:1) with readable button text (4.5:1) on every theme.
- Existing IndexedDB data from the first version is migrated, not discarded.
- Theme is painted before React loads, so there's no white flash on launch in dark mode.

## Settings, backup, and reminders

**Settings** covers theme (each card previews itself in its own colors), week start, look-ahead days, reminders, and backup.

**Backup** saves a JSON file through the native save dialog in Tauri, or a download in the browser. Restoring shows what the file contains (counts, date, any damaged entries that will be skipped) before replacing anything, and the replace can be undone from the toast.

**Reminders** follow three rules: the evening before exams, midterms, and high-priority work (from 18:00); the morning of anything due (from 08:00, merged into one summary when more than three are due); and the final hour before a timed deadline. Each fires once per item per due date, so moving a deadline re-arms it.

## Known limits

- Reminders fire while StudyFlow is open or minimised. Notifications that arrive with the app fully closed need OS-level scheduling, which differs per platform.
- On Android, files picked through the system dialog can be content URIs; test backup restore on a device before relying on it.
- The IndexedDB upgrade from the first version's schema is unit-tested at the converter level; open `npm run dev` once with an existing database to confirm the upgrade in a real browser.
- The Windows installer isn't code-signed with a paid certificate, so SmartScreen warns on the first manual install. Automatic updates are verified with the Tauri signing key and don't trigger it.
