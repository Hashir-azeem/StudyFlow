import type { AppSettings } from "../types/settings";
import type { AppTheme, HexColor, ThemePresetId } from "../types";
import { adapter } from "../storage";

export const themeService = {
  async getSettings(): Promise<AppSettings> {
    return adapter.getSettings();
  },
  async setTheme(theme: AppTheme): Promise<AppSettings> {
    const current = await adapter.getSettings();
    const next = { ...current, theme };
    await adapter.saveSettings(next);
    return next;
  },
  async setPreset(presetId: ThemePresetId): Promise<AppSettings> {
    const current = await adapter.getSettings();
    return this.setTheme({ ...current.theme, presetId });
  },
  async setAccent(customAccent?: HexColor): Promise<AppSettings> {
    const current = await adapter.getSettings();
    return this.setTheme({ ...current.theme, customAccent });
  },
};
