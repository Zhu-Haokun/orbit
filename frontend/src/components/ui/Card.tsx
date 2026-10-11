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
  /**
   * 左侧一条语义色边。
   *
   * 只给"需要你行动"的卡片用（纪念日、未完待续）。全都加等于都没加，
   * 而且这条边是**小面积**元素 —— 正好符合"对比度与面积成反比"。
   */
  accent?: "warm" | "accent" | "jade" | "cool";
  as?: ElementType;
  children?: ReactNode;
}

const ACCENTS: Record<NonNullable<CardProps["accent"]>, string> = {
  warm: "border-l-2 border-l-warning",
  accent: "border-l-2 border-l-accent",
  jade: "border-l-2 border-l-success",
  cool: "border-l-2 border-l-info",
};

const TONES: Record<NonNullable<CardProps["tone"]>, string> = {
  default: "bg-surface border-line-subtle",
  soft: "bg-soft/60 border-line-subtle",
  quiet: "bg-transparent border-line-subtle",
};

export function Card({
  interactive,
  tone = "default",
  accent,
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
        accent && ACCENTS[accent],
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
