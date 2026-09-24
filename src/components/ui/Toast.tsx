import { useEffect, useState } from "react";
import { useStore } from "../../state/store";
import { cx } from "./cx";

/** Single toast slot with optional Undo. Errors stay until dismissed. */
export function ToastHost() {
  const toast = useStore((s) => s.toast);
  const dismiss = useStore((s) => s.dismissToast);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!toast || toast.tone === "error") return;
    const id = window.setTimeout(dismiss, toast.undo ? 6000 : 3500);
    return () => window.clearTimeout(id);
  }, [toast, dismiss]);

  if (!toast) return null;
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className={cx(
        "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-[60] flex w-[min(92vw,440px)] -translate-x-1/2 items-center gap-3 rounded-xl border bg-surface px-4 py-3 text-sm shadow-lg",
        toast.tone === "error" ? "border-danger/40 text-danger" : "border-border text-text",
      )}
    >
      <span className="flex-1">{toast.message}</span>
      {toast.undo ? (
        <button
          type="button"
          disabled={busy}
          className="font-semibold text-accent hover:underline disabled:opacity-50"
          onClick={async () => {
            setBusy(true);
            try {
              await toast.undo?.();
            } finally {
              setBusy(false);
              dismiss();
            }
          }}
        >
          Undo
        </button>
      ) : null}
      <button type="button" className="px-1 text-muted hover:text-text" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
