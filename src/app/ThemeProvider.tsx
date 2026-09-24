import { useEffect, useState, type ReactNode } from "react";
import { adapter, ensureSeeded } from "../core/storage";
import { applyResolvedTheme } from "../core/theme/apply";
import { resolveTheme } from "../core/theme/resolve";
import type { AppSettings, HexColor } from "../core/types";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    let unsub = false;
    void (async () => {
      await ensureSeeded(adapter);
      const s = await adapter.getSettings();
      if (!unsub) setSettings(s);
    })();
    return () => {
      unsub = true;
    };
  }, []);

  useEffect(() => {
    if (!settings) return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const paint = (courseAccent?: HexColor) => {
      const resolved = resolveTheme(settings.theme, mq.matches);
      applyResolvedTheme(resolved, courseAccent);
    };
    paint();
    const onChange = () => paint();
    mq.addEventListener("change", onChange);
    const onSettings = (e: Event) => {
      const next = (e as CustomEvent<AppSettings>).detail;
      setSettings(next);
    };
    window.addEventListener("sf-settings", onSettings);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("sf-settings", onSettings);
    };
  }, [settings]);

  if (!settings) {
    return (
      <div className="grid min-h-svh place-items-center text-[var(--sf-text-muted)]">
        Loading studyflow…
      </div>
    );
  }

  return children;
}

export function broadcastSettings(settings: AppSettings) {
  window.dispatchEvent(new CustomEvent("sf-settings", { detail: settings }));
}
