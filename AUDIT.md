# Audit: Cursor-generated StudyFlow (commit cc4f83c)

Checked by compiling against the real installed packages (TypeScript 6, React 19, React Router 7, Dexie 4), reading every source file, and measuring where numbers were involved. Vite's bundler couldn't run in the audit environment (its native binaries in `node_modules` are Windows-only), so runtime behavior was traced by reading the code.

## Blockers: the app doesn't build

1. **Three broken import paths.** `components/layout/AppShell.tsx` imports `../components/ui/button` and `../lib/cn` (one `../` short). `features/courses/CourseModal.tsx` imports `../ui/button`, `../ui/dialog`, `../ui/input`, which don't exist under `features/`. `tsc` reports all three as "Cannot find module".
2. **A type error in the command palette.** Theme items render `Theme: {p.label}`, which is two children, but `Item` only accepts a single string.
3. **`npm run build` stops before compiling anything.** `tsconfig.app.json` sets `baseUrl`, which TypeScript 6 deprecates as a hard error (TS5101).
4. **No `src-tauri` folder.** `@tauri-apps/cli` is installed, but there's no Rust project, `tauri.conf.json`, or capabilities, so this is a plain web app today.
5. **Vite template leftovers.** `src/App.tsx` (counter demo), `App.css`, `index.css` (which pins `#root` to 1126px, centered), and the demo images. They're unused but look live.

## Data bugs

6. **Fake courses written into every new user's real data.** On first run, `ensureSeeded` inserts "Dr. Chen", "Prof. Alvarez" and six assessments. It runs inside a `useEffect`, and React StrictMode runs effects twice in dev. The `seeded` flag is only set after the async work finishes, so both runs see zero courses and the demo data can be inserted twice.
7. **New classes can start tomorrow.** `emptySlot()` sets `startsOn` from `new Date().toISOString()`, which is the UTC date. In Ontario after 8 PM (EDT), that's already tomorrow. Verified: 9:30 PM on Sept 24 produces `2026-09-25`.
8. **Nothing can be deleted, and assessments can't be edited.** The storage adapter has no delete methods, and the assessment modal is create-only.
9. **Some fields can't be cleared.** `updateCourse` uses `patch.notes ?? existing.notes`, so clearing notes or the term keeps the old value.
10. **No validation.** A class can end before it starts, have zero days, reuse another course's code, or push a course's weights past 100%.
11. **The storage layer is bypassed.** Six components import the Dexie `db` directly through `useLiveQuery`. The `StorageAdapter` interface exists, but the UI doesn't go through it, so swapping to SQLite for Tauri or mobile would mean rewriting every screen.

## Theme bugs

12. **"System" mode half-works.** It flips `color-scheme` but keeps the chosen preset's colors. The result is a dark palette with light-mode form controls, or the reverse.
13. **Course colors are unreadable on light themes.** Badges draw the raw course color as text. Measured contrast on white for the default palette: `#67E8F9` 1.45:1, `#F6C177` 1.64:1, `#8FD3C8` 1.70:1, `#F4A6C8` 1.89:1, `#7C9CFF` 2.61:1. WCAG AA for text is 4.5:1.
14. **No color propagation.** `--sf-course-accent` is a single global variable, not one per course. Each component recolors itself with inline styles.
15. **Monochrome's status colors are grey.** Danger is `#D4D4D4` on `#F5F5F5` text (1.36:1 between them), so overdue work looks like everything else.
16. **Theme buttons sit at the top of every page.** Settings changes are broadcast through a `window` CustomEvent rather than shared state.

## UX gaps

17. **Command palette:** navigation, create, and theme switching only. There's no quick-add, no search, no dialog semantics or focus trap, and it remounts on every route change (`key={location.pathname}`).
18. **Today view:**
    - The heading is a raw ISO date.
    - Times are hard-coded to 12h, ignoring the `timeFormat` setting.
    - It never rolls over at midnight.
    - "Exams in 7 days" actually covers 8 days (today through today + 7).
    - Overdue items are mixed into "due today".
19. **Calendar:** current month only, with no navigation and no week view. It ignores `weekStartsOn` and shows archived courses' work.
20. **Course form:** only Monday to Friday can be picked, and meetings can't be removed.
21. **Assessment modal:** the form resets while you type whenever any database write happens, because the course list from `useLiveQuery` is a new array each time and it's in the effect's dependencies.

## What was kept from Cursor's version

These were good decisions and are now in the merged code:
- **Multi-day meetings:** one "Mon/Wed 10:00" slot instead of one row per day.
- **12h/24h time format setting**, now actually applied everywhere.
- **Custom accent color**, now with contrast protection.
- **React Router**, now with hash routes so it works in Tauri without server config and gives Android's back button real history.
- **`cn` (clsx + tailwind-merge).**
- **The starter course content**, now an opt-in "Try with sample courses" button.
- **Oxlint config, the `@` alias, and the Vite 8 / TypeScript 6 toolchain.**

## What was dropped

These were never reachable from the old UI:
- **Terms table:** replaced by per-course term start/end.
- **One-off ("once") meetings and extra dates:** weekly patterns carry over; one-off meetings are skipped during migration.
- **The `cancelled` status:** migrated as done.

## Existing data is preserved

The merged Dexie database declares Cursor's schema as version 1 and upgrades it:
- **Version 2** folds slots into courses, renames fields, and converts settings.
- **Version 3** drops the old tables.

The converters are pure functions covered by unit tests. The IndexedDB upgrade path itself runs only in a browser and should be checked once in `npm run dev` with an existing database.
