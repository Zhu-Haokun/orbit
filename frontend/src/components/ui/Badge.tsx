import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/** 语义色只用于状态，不做大面积背景（规范 §10.1）。 */
export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-line-subtle text-ink-3",
  accent: "border-accent-border bg-accent-soft text-accent",
  success: "border-success/30 text-success",
  warning: "border-warning/30 text-warning",
  danger: "border-danger/30 text-danger",
  info: "border-info/30 text-info",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center rounded-pill border px-2 text-micro whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
