# Ambient themes and course outline import

## Architecture at a glance

```
src/core/ambient.ts            Pure: particle physics, palettes, WCAG-safe layer opacity
src/ambient/engine.ts          Canvas renderer: sprites, frame loop, adaptive thinning
src/ambient/ambient.worker.ts  Runs the engine off the main thread (OffscreenCanvas)
src/ambient/driver.ts          Picks worker or main thread; one interface for both
src/ambient/motion.ts          Reduced-motion + user preference → animate or still
src/ambient/AmbientBackground.tsx  Mounts the layer; reacts to settings and theme

src/core/outline/text.ts         Pure recognisers: days, times, dates, weights, rooms
src/core/outline/parseOutline.ts Pure parser: text → ParsedOutline
src/platform/outlineReader.ts    File → text (pdf.js / mammoth / TextDecoder) → parse, in memory
src/features/import/OutlineImportDialog.tsx  Pick → read → review flow
src/features/import/OutlineReview.tsx        Edit and approve before anything is saved
src/state/store.ts  applyOutlineImport()     Saves the approved plan as one change, with Undo
```

**State.** Ambient preferences live in `Settings.ambient` (effect, motion, intensity) and are persisted with the rest of the settings. Everything else about the effect is derived: the palette and safe opacity come from the resolved theme, and motion from the preference plus the OS reduce-motion setting. For the outline import, nothing is persisted until approval. The dialog holds only the structured parse result in component state and drops it on close; the store receives a plain `OutlineImportPlan` (course, meetings, assessments).

## Ambient particles

**Performance.**
- In WebView2 (Windows), Chromium, Firefox, and Safari 16.4+, the canvas is handed to a Web Worker with `transferControlToOffscreen`, so simulation and drawing never block the UI thread. Elsewhere the same engine runs on the main thread.
- Each particle shape is drawn once per color into a sprite. A frame is then only `drawImage` calls.
- The engine measures its own work time per frame. When the average passes the budget (4 ms on the main thread, 8 ms in a worker), it removes 20% of the particles, repeating down to a quarter of the original count.
- Rendering resolution is capped at 1.5× device pixels, since soft particles gain nothing from more.
- The loop pauses while the window is hidden. After sleep, a clamped time step stops particles from jumping.

**Accessibility.**
- **Text contrast.** Particles draw into one layer whose CSS opacity is capped. Every canvas pixel has alpha ≤ 1, so the worst case behind any text is `mix(particleColor, background, opacity)`. `safeLayerOpacity` picks the largest opacity for which body and muted text keep 4.5:1 against that worst case, for every palette color and every blend of two. `tests/ambient.test.ts` checks this for every theme and effect. Cards and dialogs are opaque, so text on them is never affected.
- **Muted text colour.** To give the effect room, muted text was raised to 7:1 on light themes and 8.5:1 on dark ones. The resulting layer opacity is 21–51% depending on theme and effect.
- **Motion.** WCAG 2.2.2 (Pause, Stop, Hide) is met by the Motion control and the command palette's "Pause ambient motion". The "Automatic" setting follows `prefers-reduced-motion`, and "Still" shows a single static frame.
- **Screen readers and pointer.** The layer is `aria-hidden` and `pointer-events: none`.

## Outline import: privacy model

1. **On device.** The file is read from the browser's `File` into memory. The code makes no network requests, and in the desktop app the Tauri CSP (`connect-src 'self' ipc:`) blocks outbound connections regardless.
2. **Nothing persisted.** The reader never touches IndexedDB, SQLite, localStorage, the file system, or logs. pdf.js runs in a worker created for that one document and destroyed afterwards.
3. **Scoped lifetime.** Bytes and extracted text live only inside `readOutline()`. It returns the structured `ParsedOutline`, and the byte buffer is zeroed on the way out. The only document text that survives is the single matched line per item (`source`), shown during review so the student can check it. It's never saved; imported assessments get empty notes.
4. **Approval gate.** Nothing is written until the student presses Create/Add on the review screen. The write is one store change with Undo.

**Limit worth stating plainly.** JavaScript can't overwrite strings in place. The extracted text is released for garbage collection, not wiped. It's unreachable once `readOutline()` returns.

`tests/outline.test.ts` includes a check that a sentence from the document which isn't an assessment or class time (a student number and address) doesn't appear anywhere in the returned data.

## Why the parser is rule-based, not an LLM

A language model would handle unusual layouts better. But it means sending the document's text off the device, which breaks guarantee 1, and it needs a server to hold the API key, since a key shipped inside the desktop app is public. The parser is a pure `text → ParsedOutline` function, so an opt-in model-based extractor could be added behind the same review screen later. It should be clearly labelled as sending the text out, and use a provider with contractual zero data retention.

What the rules handle today:
- **Class times:** day names and registrar shorthand (MWF, TTh, TR), am/pm inference ("11-12:20pm", "2-3:50pm"), and rooms.
- **Assessments:** grading tables and schedules (merged by name, so the midterm's weight and date can come from different sections), "10 x 1%" expansion, "Week 7" dates resolved from the term start, TBA finals, and table cells split across lines (typical of Word documents).
- **Skipped on purpose:** late-penalty and policy sentences, and office hours.

**Formats:**
- **Supported:** PDF with a text layer, .docx, .txt, and .md.
- **Not supported:**
  - Scanned PDFs, which need OCR. The student gets a clear message.
  - Old .doc files. The student is asked to save as .docx or PDF.
