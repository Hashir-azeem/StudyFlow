import type { HexColor } from "../types/course";
import type { ResolvedTheme } from "./resolve";
import { TOKEN_VARS } from "./tokens";

export function applyResolvedTheme(
  resolved: ResolvedTheme,
  courseAccent?: HexColor,
  root: HTMLElement = document.documentElement,
): void {
  const { tokens, colorScheme, preset } = resolved;
  root.dataset.theme = preset.id;
  root.style.colorScheme = colorScheme;

  (Object.keys(TOKEN_VARS) as (keyof typeof TOKEN_VARS)[]).forEach((key) => {
    if (key === "courseAccent") return;
    root.style.setProperty(TOKEN_VARS[key], tokens[key]);
  });

  root.style.setProperty(
    TOKEN_VARS.courseAccent,
    courseAccent ?? tokens.accent,
  );
}
