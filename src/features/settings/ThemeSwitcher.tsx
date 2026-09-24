import { useLiveQuery } from "dexie-react-hooks";
import { THEME_PRESETS } from "../../core/theme/presets";
import { themeService } from "../../core/services/themeService";
import { db } from "../../core/storage";
import { COURSE_PALETTE } from "../../core/types";
import { broadcastSettings } from "../../app/ThemeProvider";
import { Button } from "../../components/ui/button";

export function ThemeSwitcher() {
  const settings = useLiveQuery(() => db.settings.get("singleton"));

  if (!settings) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {THEME_PRESETS.map((p) => (
        <Button
          key={p.id}
          size="sm"
          variant={settings.theme.presetId === p.id ? "default" : "outline"}
          onClick={() =>
            void themeService.setPreset(p.id).then(broadcastSettings)
          }
        >
          {p.label}
        </Button>
      ))}
      <div className="ml-2 flex gap-1">
        {COURSE_PALETTE.slice(0, 6).map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Accent ${c}`}
            className="h-6 w-6 rounded-full"
            style={{ background: c }}
            onClick={() =>
              void themeService.setAccent(c).then(broadcastSettings)
            }
          />
        ))}
      </div>
    </div>
  );
}
