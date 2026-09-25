import { FileText, FileUp, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ParsedOutline } from "../../core/outline/types";
import { Button } from "../../components/ui/Button";
import { cx } from "../../components/ui/cx";
import { Dialog } from "../../components/ui/Dialog";
import { OutlineReadError, readOutline, type ReadProgress } from "../../platform/outlineReader";
import { useStore } from "../../state/store";
import { OutlineReview } from "./OutlineReview";

type Phase =
  | { step: "pick" }
  | { step: "reading"; fileName: string; progress: ReadProgress | null }
  | { step: "review"; fileName: string; outline: ParsedOutline }
  | { step: "error"; message: string };

const ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

/**
 * Course outline import: pick → read on device → review → save.
 * Only the structured parse result is ever held in component state, and it's
 * dropped when the dialog closes.
 */
export function OutlineImportDialog() {
  const open = useStore((s) => s.outlineImportOpen);
  const setOpen = useStore((s) => s.openOutlineImport);
  const today = useStore((s) => s.today);
  const [phase, setPhase] = useState<Phase>({ step: "pick" });
  const [dragging, setDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Closing always discards everything: parse results, progress, pending reads.
  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase({ step: "pick" });
    setDragging(false);
  }, [open]);

  async function handleFile(file: File | undefined) {
    // Clear the input right away so the browser holds no reference to the file.
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setPhase({ step: "reading", fileName: file.name, progress: null });
    try {
      const outline = await readOutline(file, {
        today,
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted) setPhase({ step: "reading", fileName: file.name, progress });
        },
      });
      if (!controller.signal.aborted) setPhase({ step: "review", fileName: file.name, outline });
    } catch (err) {
      if (controller.signal.aborted) return;
      setPhase({
        step: "error",
        message: err instanceof OutlineReadError ? err.message : "Something went wrong while reading that file. Try another copy of it.",
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  const close = () => setOpen(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={phase.step === "review" ? "Review what was found" : "Import a course outline"}
      description={phase.step === "review" ? "Untick anything that's wrong, fix dates and weights, then save." : undefined}
      wide
    >
      {phase.step === "pick" || phase.step === "error" ? (
        <div className="flex flex-col gap-4">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFile(e.dataTransfer.files[0]);
            }}
            className={cx(
              "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
              dragging ? "border-accent bg-accent/10" : "border-border hover:border-muted hover:bg-surface-2/50",
            )}
          >
            <FileUp className="h-8 w-8 text-accent" aria-hidden />
            <span className="text-base font-medium">Drop your course outline here, or click to choose it</span>
            <span className="text-sm text-muted">PDF, Word (.docx), or text file, up to 20 MB</span>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </label>

          {phase.step === "error" ? (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{phase.message}</p>
          ) : null}

          <div className="flex gap-3 rounded-xl bg-surface-2 px-4 py-3 text-sm">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="font-medium">Private by design</p>
              <p className="text-muted">
                The outline is read on this device. It's never uploaded, and neither the file nor its text is saved. You'll
                review everything that's found, and only the class times and assessments you approve are kept.
              </p>
            </div>
          </div>
        </div>
      ) : phase.step === "reading" ? (
        <div className="flex flex-col items-center gap-4 py-10 text-center" aria-busy="true">
          <FileText className="h-8 w-8 animate-pulse text-accent motion-reduce:animate-none" aria-hidden />
          <div role="status">
            <p className="font-medium">Reading {phase.fileName}</p>
            <p className="text-sm text-muted">
              {phase.progress ? `Page ${phase.progress.page} of ${phase.progress.pages}` : "Opening the file…"}
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              abortRef.current?.abort();
              setPhase({ step: "pick" });
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <OutlineReview outline={phase.outline} fileName={phase.fileName} onCancel={close} onImported={close} />
      )}
    </Dialog>
  );
}
