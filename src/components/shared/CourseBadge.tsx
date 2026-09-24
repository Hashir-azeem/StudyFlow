import type { HexColor } from "../../core/types";
import { cn } from "../../lib/cn";

export function CourseBadge({
  code,
  color,
  className,
}: {
  code: string;
  color: HexColor;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
      style={{
        background: `${color}22`,
        color,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      {code}
    </span>
  );
}
