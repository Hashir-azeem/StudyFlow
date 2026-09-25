import { Button } from "../components/ui/Button";
import { useUpdates } from "../state/updates";

/** Shown across the top of the app when a new version is ready to install. */
export function UpdateBanner() {
  const status = useUpdates((s) => s.status);
  const available = useUpdates((s) => s.available);
  const progress = useUpdates((s) => s.progress);
  const error = useUpdates((s) => s.error);
  const dismissed = useUpdates((s) => s.dismissed);
  const install = useUpdates((s) => s.install);
  const dismiss = useUpdates((s) => s.dismiss);

  if (!available || dismissed || (status !== "available" && status !== "installing")) return null;
  const installing = status === "installing";

  return (
    <div role="status" className="flex flex-wrap items-center gap-3 border-b border-accent/30 bg-accent/10 px-4 py-2 text-sm">
      <span className="flex-1">
        {installing
          ? progress === null
            ? `Downloading StudyFlow ${available.version}…`
            : progress < 1
              ? `Downloading StudyFlow ${available.version}: ${Math.round(progress * 100)}%`
              : "Installing. StudyFlow will restart in a moment."
          : error ?? `StudyFlow ${available.version} is ready. Your data stays as it is.`}
      </span>
      {installing ? null : (
        <>
          <Button size="sm" variant="ghost" onClick={dismiss}>Later</Button>
          <Button size="sm" variant="primary" onClick={() => void install()}>Restart and update</Button>
        </>
      )}
    </div>
  );
}
