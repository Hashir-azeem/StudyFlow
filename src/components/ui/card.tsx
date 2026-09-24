import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--sf-border)] bg-[var(--sf-surface)] p-4",
        className,
      )}
      {...props}
    />
  );
}
