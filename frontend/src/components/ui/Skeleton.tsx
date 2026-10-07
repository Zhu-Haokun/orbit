import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}

/**
 * 规范 §40.1: 使用低对比 skeleton，禁止大面积闪烁。
 * 主要模块统一用它占位。
 */
export function SkeletonBlock({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={index === lines - 1 ? "w-2/3" : "w-full"} />
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-lg border border-line-subtle p-4">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex w-full flex-col gap-2">
            <Skeleton className="w-1/3" />
            <Skeleton className="w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
