import type { ElementType, HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * 规范 §39.2 Card
 * background: bg-surface / border: border-subtle / radius: 16px
 * 只有可点击卡片 Hover 时边框变亮。
 */

export interface CardProps extends HTMLAttributes<HTMLElement> {
  interactive?: boolean;
  /** `soft` 用于未完待续这类“柔和卡片”，比标准 Card 更轻。 */
  tone?: "default" | "soft" | "quiet";
  as?: ElementType;
  children?: ReactNode;
}

const TONES: Record<NonNullable<CardProps["tone"]>, string> = {
  default: "bg-surface border-line-subtle",
  soft: "bg-soft/60 border-line-subtle",
  quiet: "bg-transparent border-line-subtle",
};

export function Card({
  interactive,
  tone = "default",
  as,
  className,
  children,
  ...rest
}: CardProps) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag
      className={cn(
        "rounded-lg border",
        TONES[tone],
        interactive &&
          "cursor-pointer transition-colors duration-[140ms] hover:border-line-hover focus-visible:border-line-hover",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-h3 text-ink", className)} {...rest}>
      {children}
    </h3>
  );
}
