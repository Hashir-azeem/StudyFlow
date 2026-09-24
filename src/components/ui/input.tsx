import type { InputHTMLAttributes, LabelHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg border border-[var(--sf-border)] bg-[var(--sf-bg)] px-3 text-sm text-[var(--sf-text)] placeholder:text-[var(--sf-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-accent)]",
        className,
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1 block text-xs font-medium text-[var(--sf-text-muted)]",
        className,
      )}
      {...props}
    />
  );
}
