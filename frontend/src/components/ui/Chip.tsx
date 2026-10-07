import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * 规范 §16 星系筛选 / §34.2 时间筛选使用 Chips。
 * 选中：accent-soft 背景 + accent-border。
 */

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  count?: number;
}

export function Chip({ active, count, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-pill border px-3 text-sm whitespace-nowrap",
        "transition-colors duration-[140ms] focus-visible:outline-offset-2",
        active
          ? "border-accent-border bg-accent-soft text-accent"
          : "border-line-subtle bg-transparent text-ink-2 hover:border-line hover:text-ink",
        className,
      )}
      {...rest}
    >
      {children}
      {typeof count === "number" && (
        <span className={cn("text-micro tabular-nums", active ? "text-accent/80" : "text-ink-3")}>
          {count}
        </span>
      )}
    </button>
  );
}
