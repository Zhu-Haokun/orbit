import { cn } from "@/lib/cn";
import { initialOf } from "@/lib/format";

/**
 * 规范 §82 头像
 * 没有头像时使用姓名首字 / 中文首字，背景 bg-soft，不要随机彩虹色头像。
 */

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZES: Record<AvatarSize, string> = {
  xs: "size-6 text-micro",
  sm: "size-8 text-sm",
  md: "size-9 text-body",
  lg: "size-12 text-lg",
  xl: "size-[72px] text-h2",
};

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
  /** 中心节点 YOU 使用 accent 描边，规范 §14.3。 */
  accent?: boolean;
}

export function Avatar({ name, src, size = "md", className, accent }: AvatarProps) {
  const label = name?.trim() || "?";
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "bg-soft text-ink-2 select-none",
        accent ? "border border-accent-border text-accent" : "border border-line-subtle",
        SIZES[size],
        className,
      )}
      aria-hidden={false}
      role="img"
      aria-label={label}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <span className="font-medium">{initialOf(label)}</span>
      )}
    </span>
  );
}
