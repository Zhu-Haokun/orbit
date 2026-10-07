import { cn } from "@/lib/cn";
import type { MemorySummary } from "@/types";

/**
 * 规范 §34.4 年度摘要
 *
 * 2026
 * 42 次共同经历
 * 17 个人出现过
 * 12 个地点
 *
 * 禁止：最重要的人 / 关系排名 / 任何分数（§5.1 / §34.4 / §71）。
 */

export interface YearSummaryProps {
  summary: MemorySummary;
  className?: string;
}

export function YearSummary({ summary, className }: YearSummaryProps) {
  const heading = summary.year ? String(summary.year) : "全部时间";

  const lines = [
    { key: "共同经历", value: `${summary.interactionCount} 次共同经历` },
    { key: "出现过的人", value: `${summary.peopleCount} 个人出现过` },
    { key: "地点", value: `${summary.placeCount} 个地点` },
  ];

  return (
    <aside className={cn("flex flex-col gap-3", className)} aria-label="年度摘要">
      <h2 className="text-sm tracking-widest text-ink-3 tabular-nums">{heading}</h2>
      <dl className="flex flex-col gap-2">
        {lines.map((line) => (
          <div key={line.key} className="flex items-baseline gap-2">
            <dt className="sr-only">{line.key}</dt>
            <dd className="text-body text-ink-2 tabular-nums">{line.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
