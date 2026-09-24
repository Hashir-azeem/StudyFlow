export function formatTime(min: number, format: "12h" | "24h"): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const mm = String(m).padStart(2, "0");
  if (format === "24h") return `${String(h).padStart(2, "0")}:${mm}`;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${period}`;
}

export function formatRange(
  startMin: number,
  endMin: number,
  format: "12h" | "24h",
): string {
  return `${formatTime(startMin, format)} – ${formatTime(endMin, format)}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function weekdayLabel(day: number): string {
  return WEEKDAYS[day] ?? "";
}
