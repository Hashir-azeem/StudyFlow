import type { Weekday } from "./schedule";
import type { AppTheme } from "./theme";

export interface AppSettings {
  theme: AppTheme;
  weekStartsOn: Weekday;
  timeFormat: "12h" | "24h";
}
