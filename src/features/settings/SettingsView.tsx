import { Ban, Check, Download, Flame, Flower2, Monitor, Snowflake, Upload, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { AmbientEffect, AmbientIntensity, AmbientMotion, Snapshot, ThemePreference } from "../../core/types";
import { usePrefersReducedMotion } from "../../ambient/motion";
import { ambientPalette } from "../../core/ambient";
import { useResolvedTheme } from "../../theme/useResolvedTheme";
import { Button } from "../../components/ui/Button";
import { cx } from "../../components/ui/cx";
import { Dialog } from "../../components/ui/Dialog";
import { Select } from "../../components/ui/Field";
import { openBackupFile, saveBackupFile } from "../../platform/backupFile";
import {
  notificationPermission,
  requestNotificationPermission,
  sendNotification,
  type PermissionState,
} from "../../platform/notify";
import { useStore } from "../../state/store";
import { useUpdates } from "../../state/updates";
import { parseSnapshot } from "../../storage/snapshot";
import { THEME_LIST } from "../../theme/themes";

const LOOKAHEAD_OPTIONS = [3, 5, 7, 10, 14];

const BACKEND_LABEL = {
  sqlite: "Saved on this device in a local database.",
  indexeddb: "Saved in this browser's storage.",
  memory: "Not saved: storage couldn't be opened, so data lasts only until you close the app.",
} as const;

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint ? <div className="text-xs text-muted">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-border")}
    >
      <span
        className={cx(
          "absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function ThemePicker() {
  const current = useStore((s) => s.settings.theme);
  const setTheme = useStore((s) => s.setTheme);

  const card = (id: ThemePreference, name: string, preview: ReactNode) => (
    <button
      key={id}
      type="button"
      role="radio"
      aria-checked={current === id}
      onClick={() => void setTheme(id)}
      className={cx(
        "flex flex-col gap-2 rounded-xl border p-2 text-left",
        current === id ? "border-accent ring-2 ring-accent/30" : "border-border hover:border-muted",
      )}
    >
      {preview}
      <span className="flex items-center justify-between px-1 text-sm font-medium">
        {name}
        {current === id ? <Check className="h-4 w-4 text-accent" aria-hidden /> : null}
      </span>
    </button>
  );

  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {card(
        "system",
        "Match system",
        <div className="grid h-20 place-items-center rounded-lg bg-surface-2 text-muted">
          <Monitor className="h-6 w-6" aria-hidden />
        </div>,
      )}
      {THEME_LIST.map((t) =>
        card(
          t.id,
          t.name,
          // Painted from the theme's own tokens so each card previews itself, whatever theme is active.
          <div className="h-20 overflow-hidden rounded-lg p-2" style={{ background: `rgb(${t.tokens.bg})` }} aria-hidden>
            <div className="flex h-full flex-col justify-between rounded-md p-2" style={{ background: `rgb(${t.tokens.surface})` }}>
              <div className="h-1.5 w-12 rounded-full" style={{ background: `rgb(${t.tokens.text})` }} />
              <div className="flex items-center gap-1">
                {t.coursePalette.slice(0, 4).map((c) => (
                  <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                ))}
                <span className="ml-auto h-3 w-8 rounded" style={{ background: `rgb(${t.tokens.accent})` }} />
              </div>
            </div>
          </div>,
        ),
      )}
    </div>
  );
}

const ACCENT_CHOICES = ["#4f7cff", "#e2557b", "#1fa98a", "#f59e0b", "#8b5cf6", "#0ea5e9", "#ef6c3a"];

function AccentPicker() {
  const accent = useStore((s) => s.settings.accent);
  const updateSettings = useStore((s) => s.updateSettings);
  const swatch = "grid h-8 w-8 place-items-center rounded-full ring-offset-2 ring-offset-surface";
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
      <span className="mr-2 text-sm font-medium">Accent</span>
      <div role="radiogroup" aria-label="Accent color" className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={accent === null}
          onClick={() => void updateSettings({ accent: null })}
          className={cx("h-8 rounded-full border border-border px-3 text-xs font-medium", accent === null ? "ring-2 ring-text ring-offset-2 ring-offset-surface" : "text-muted")}
        >
          Theme default
        </button>
        {ACCENT_CHOICES.map((hex) => (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={accent === hex}
            aria-label={`Accent ${hex}`}
            onClick={() => void updateSettings({ accent: hex })}
            style={{ backgroundColor: hex }}
            className={cx(swatch, accent === hex && "ring-2 ring-text")}
          >
            {accent === hex ? <Check className="h-4 w-4 text-white mix-blend-difference" aria-hidden /> : null}
          </button>
        ))}
        <label className={cx(swatch, "relative cursor-pointer border border-dashed border-border text-xs text-muted")} title="Custom color">
          +
          <input
            type="color"
            value={accent ?? "#4f7cff"}
            onChange={(e) => void updateSettings({ accent: e.target.value })}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Custom accent color"
          />
        </label>
      </div>
    </div>
  );
}

const EFFECT_OPTIONS: Array<{ id: AmbientEffect; name: string; icon: LucideIcon; blurb: string }> = [
  { id: "none", name: "Off", icon: Ban, blurb: "Plain background" },
  { id: "snow", name: "Snowfall", icon: Snowflake, blurb: "Soft drifting flakes" },
  { id: "sakura", name: "Sakura", icon: Flower2, blurb: "Tumbling petals" },
  { id: "embers", name: "Embers", icon: Flame, blurb: "Warm rising sparks" },
];

const INTENSITY_LABEL: Record<AmbientIntensity, string> = { 1: "Sparse", 2: "Light", 3: "Medium", 4: "Full", 5: "Heavy" };

function AmbientSection() {
  const ambient = useStore((s) => s.settings.ambient);
  const updateSettings = useStore((s) => s.updateSettings);
  const reducedMotion = usePrefersReducedMotion();
  const theme = useResolvedTheme();
  const set = (patch: Partial<typeof ambient>) => void updateSettings({ ambient: { ...ambient, ...patch } });
  const layer = ambient.effect === "none" ? null : ambientPalette(ambient.effect, theme).layerOpacity;
  const motionHint =
    ambient.motion === "auto"
      ? reducedMotion
        ? "Your system asks for reduced motion, so particles stay still."
        : "Follows your system's reduce-motion setting."
      : ambient.motion === "off"
        ? "Particles are shown as a still scene."
        : undefined;

  return (
    <Section
      title="Ambient background"
      description="A living backdrop behind your schedule. Particles are dimmed for each theme so text keeps WCAG AA contrast."
    >
      <div role="radiogroup" aria-label="Ambient effect" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {EFFECT_OPTIONS.map(({ id, name, icon: Icon, blurb }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={ambient.effect === id}
            onClick={() => set({ effect: id })}
            className={cx(
              "flex flex-col items-start gap-1 rounded-xl border p-3 text-left",
              ambient.effect === id ? "border-accent bg-accent/10 ring-2 ring-accent/30" : "border-border hover:border-muted",
            )}
          >
            <Icon className={cx("h-5 w-5", ambient.effect === id ? "text-accent" : "text-muted")} aria-hidden />
            <span className="text-sm font-medium">{name}</span>
            <span className="text-xs text-muted">{blurb}</span>
          </button>
        ))}
      </div>

      {ambient.effect !== "none" ? (
        <div className="mt-3 border-t border-border pt-2">
          <Row label="Motion" hint={motionHint}>
            <div role="radiogroup" aria-label="Motion" className="flex rounded-lg bg-surface-2 p-0.5">
              {(["auto", "on", "off"] as AmbientMotion[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={ambient.motion === m}
                  onClick={() => set({ motion: m })}
                  className={cx(
                    "rounded-md px-3 py-1 text-sm font-medium",
                    ambient.motion === m ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
                  )}
                >
                  {m === "auto" ? "Automatic" : m === "on" ? "Animate" : "Still"}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Density" hint={INTENSITY_LABEL[ambient.intensity]}>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={ambient.intensity}
              onChange={(e) => set({ intensity: Number(e.target.value) as AmbientIntensity })}
              aria-label="Particle density"
              aria-valuetext={INTENSITY_LABEL[ambient.intensity]}
              className="w-40 accent-[rgb(var(--c-accent))]"
            />
          </Row>
          {layer !== null && layer < 0.25 ? (
            <p className="text-xs text-muted">
              This theme leaves little contrast headroom, so particles are kept faint to protect readability.
            </p>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}

function RemindersSection() {
  const enabled = useStore((s) => s.settings.notifications);
  const updateSettings = useStore((s) => s.updateSettings);
  const [permission, setPermission] = useState<PermissionState | null>(null);

  useEffect(() => {
    void notificationPermission().then(setPermission, () => setPermission("unsupported"));
  }, []);

  async function toggle(next: boolean) {
    if (next && permission !== "granted") {
      const result = await requestNotificationPermission().catch((): PermissionState => "unsupported");
      setPermission(result);
      if (result !== "granted") return;
    }
    await updateSettings({ notifications: next });
  }

  return (
    <Section
      title="Reminders"
      description="Evening before exams, midterms, and high-priority work; the morning of anything due; and an hour before timed deadlines. Reminders arrive while StudyFlow is open or minimised."
    >
      <Row label="Deadline reminders" hint={enabled && permission === "granted" ? "On" : undefined}>
        <Switch checked={enabled && permission === "granted"} onChange={(v) => void toggle(v)} label="Deadline reminders" />
      </Row>
      {permission === "denied" ? (
        <p className="mt-2 text-sm text-warning">
          Notifications are blocked for StudyFlow. Allow them in your system settings, then turn reminders on here.
        </p>
      ) : null}
      {permission === "unsupported" ? (
        <p className="mt-2 text-sm text-muted">This device doesn't support notifications.</p>
      ) : null}
      {enabled && permission === "granted" ? (
        <Button
          size="sm"
          variant="ghost"
          className="mt-1"
          onClick={() => void sendNotification("Reminders are on", "You'll get deadline reminders like this one.")}
        >
          Send a test reminder
        </Button>
      ) : null}
    </Section>
  );
}

function BackupSection() {
  const backend = useStore((s) => s.backend);
  const courseCount = useStore((s) => s.courses.length);
  const assessmentCount = useStore((s) => s.assessments.length);
  const exportData = useStore((s) => s.exportData);
  const importData = useStore((s) => s.importData);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<{ snapshot: Snapshot; dropped: number } | null>(null);

  async function handleExport() {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await saveBackupFile(await exportData());
      if (saved) setMessage({ tone: "ok", text: "Backup saved." });
    } catch (err) {
      setMessage({ tone: "error", text: `Backup wasn't saved: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setBusy(false);
    }
  }

  async function handlePick() {
    setMessage(null);
    try {
      const raw = await openBackupFile();
      if (raw !== null) setPending(parseSnapshot(raw));
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }

  async function confirmImport() {
    if (!pending) return;
    setBusy(true);
    try {
      await importData(pending.snapshot);
      setPending(null);
    } catch {
      /* the store already showed an error toast; keep the dialog open to retry */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Backup" description={backend ? BACKEND_LABEL[backend] : undefined}>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void handleExport()} disabled={busy}>
          <Download className="h-4 w-4" /> Save backup
        </Button>
        <Button variant="ghost" onClick={() => void handlePick()} disabled={busy}>
          <Upload className="h-4 w-4" /> Restore from backup
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted">
        {courseCount} courses and {assessmentCount} assessments right now.
      </p>
      {message ? (
        <p role="status" className={cx("mt-2 text-sm", message.tone === "error" ? "text-danger" : "text-success")}>
          {message.text}
        </p>
      ) : null}

      <Dialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title="Replace your data with this backup?"
        description="Everything currently in StudyFlow is replaced. You can undo right after."
        footer={
          <>
            <Button onClick={() => setPending(null)}>Cancel</Button>
            <Button variant="primary" disabled={busy} onClick={() => void confirmImport()}>
              Replace data
            </Button>
          </>
        }
      >
        {pending ? (
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">Courses</dt>
            <dd className="text-right tabular-nums">{pending.snapshot.courses.length}</dd>
            <dt className="text-muted">Assessments</dt>
            <dd className="text-right tabular-nums">{pending.snapshot.assessments.length}</dd>
            <dt className="text-muted">Backup from</dt>
            <dd className="text-right">{new Date(pending.snapshot.exportedAt).toLocaleString()}</dd>
            {pending.dropped > 0 ? (
              <dd className="col-span-2 mt-2 rounded-lg bg-warning/10 px-3 py-2 text-warning">
                {pending.dropped} damaged or unlinked {pending.dropped === 1 ? "entry" : "entries"} will be skipped.
              </dd>
            ) : null}
          </dl>
        ) : null}
      </Dialog>
    </Section>
  );
}

function AboutSection() {
  const status = useUpdates((s) => s.status);
  const version = useUpdates((s) => s.version);
  const available = useUpdates((s) => s.available);
  const progress = useUpdates((s) => s.progress);
  const error = useUpdates((s) => s.error);
  const checkedAt = useUpdates((s) => s.checkedAt);
  const check = useUpdates((s) => s.check);
  const install = useUpdates((s) => s.install);

  if (status === "unsupported") {
    return (
      <Section title="About">
        <p className="text-sm text-muted">
          You're running StudyFlow in a browser. Install the desktop app to get automatic updates.
        </p>
      </Section>
    );
  }

  const line =
    status === "checking"
      ? "Checking for updates…"
      : status === "current"
        ? "You're on the latest version."
        : status === "available" && available
          ? `Version ${available.version} is available.`
          : status === "installing"
            ? progress !== null && progress < 1
              ? `Downloading: ${Math.round(progress * 100)}%`
              : "Installing. StudyFlow will restart."
            : status === "error"
              ? `Couldn't check for updates: ${error}`
              : null;

  return (
    <Section title="About">
      <Row
        label={version ? `StudyFlow ${version}` : "StudyFlow"}
        hint={checkedAt ? `Last checked ${new Date(checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : undefined}
      >
        {status === "available" ? (
          <Button variant="primary" onClick={() => void install()}>Restart and update</Button>
        ) : (
          <Button onClick={() => void check()} disabled={status === "checking" || status === "installing"}>
            Check for updates
          </Button>
        )}
      </Row>
      {line ? (
        <p role="status" className={cx("mt-1 text-sm", status === "error" ? "text-danger" : "text-muted")}>{line}</p>
      ) : null}
      {status === "available" && available?.notes ? (
        <p className="mt-2 whitespace-pre-line rounded-lg bg-surface-2 px-3 py-2 text-sm">{available.notes}</p>
      ) : null}
    </Section>
  );
}

export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>

      <Section title="Appearance">
        <ThemePicker />
        <AccentPicker />
        <Row label="Time format">
          <div role="radiogroup" aria-label="Time format" className="flex rounded-lg bg-surface-2 p-0.5">
            {(["auto", "12h", "24h"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={settings.timeFormat === f}
                onClick={() => void updateSettings({ timeFormat: f })}
                className={cx(
                  "rounded-md px-3 py-1 text-sm font-medium",
                  settings.timeFormat === f ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
                )}
              >
                {f === "auto" ? "Automatic" : f === "12h" ? "3:30 PM" : "15:30"}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="Planning">
        <Row label="Week starts on">
          <div role="radiogroup" aria-label="Week starts on" className="flex rounded-lg bg-surface-2 p-0.5">
            {([1, 0] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={settings.weekStartsOn === d}
                onClick={() => void updateSettings({ weekStartsOn: d })}
                className={cx(
                  "rounded-md px-3 py-1 text-sm font-medium",
                  settings.weekStartsOn === d ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
                )}
              >
                {d === 1 ? "Monday" : "Sunday"}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Look ahead" hint="How far the Today view's trackers reach">
          <Select
            aria-label="Look ahead"
            className="w-32"
            value={settings.lookaheadDays}
            onChange={(e) => void updateSettings({ lookaheadDays: Number(e.target.value) })}
          >
            {[...new Set([...LOOKAHEAD_OPTIONS, settings.lookaheadDays])].sort((a, b) => a - b).map((n) => (
              <option key={n} value={n}>{n} days</option>
            ))}
          </Select>
        </Row>
      </Section>

      <AmbientSection />
      <RemindersSection />
      <BackupSection />
      <AboutSection />
    </div>
  );
}
