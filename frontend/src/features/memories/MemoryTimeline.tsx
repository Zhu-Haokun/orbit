import { MemoryCard } from "@/features/memories/MemoryCard";
import { cn } from "@/lib/cn";
import { formatMemoryMonth } from "@/lib/format";
import type { MemoryMonth } from "@/types";

/** 月份章节的锚点 id —— 右侧索引栏据此滚动定位。 */
export function monthAnchorId(key: string): string {
  return `memory-month-${key}`;
}

/**
 * 规范 §34.3 Memory Timeline —— 按月从新到旧
 *
 * 2026 / OCT
 * 摄影社秋季外拍
 *
 * 2026 / SEP
 * 第一次参加路演
 *
 * 月份标题由 API 给出（已是大写），这里仍然走 formatMemoryMonth 做一次防御性格式化。
 * 条目之间只用留白分隔（§27 / §80），不做厚重描边卡片。
 */

export interface MemoryTimelineProps {
  months: MemoryMonth[];
  className?: string;
}

export function MemoryTimeline({ months, className }: MemoryTimelineProps) {
  if (months.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-10", className)}>
      {months.map((month) => {
        const label = formatMemoryMonth(month.year, month.month) || month.label;
        return (
          <section
            key={month.key}
            // 右侧索引栏靠这个 id 滚动定位。
            id={monthAnchorId(month.key)}
            data-month={month.key}
            className="flex scroll-mt-24 flex-col gap-1"
          >
            {/*
              月份是回忆页的章节标题，用展示字体拉开与正文的语气差别；
              数字部分保持等宽对齐，免得每个月的高度不一致。
            */}
            <h2
              className="font-display text-xl tracking-wide text-ink-2 tabular-nums"
              aria-label={`${month.year} 年 ${month.month} 月`}
            >
              {label}
            </h2>
            <div className="mt-2 flex flex-col">
              {month.items.map((item) => (
                <MemoryCard key={item.interactionId} item={item} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
