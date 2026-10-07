import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { dueDayLabel, formatMonthDay } from "@/lib/format";
import type { TodayImportantDate } from "@/types";

/**
 * 规范 §33.3 重要日期卡
 *
 * 今天 / 明天 / 还有 3 天
 * 林夕的生日
 * 摄影社 · 大学朋友
 *
 * 去年你记录：
 * 送了她一本摄影集
 *
 * [查看她的档案]
 *
 * 明确不出现「发送祝福」按钮（§33.3），也不做任何催促文案（§5.2）。
 */

export interface TodayDateCardProps {
  item: TodayImportantDate;
  className?: string;
}

export function TodayDateCard({ item, className }: TodayDateCardProps) {
  const navigate = useNavigate();
  const name = item.person.name;

  /* 规范 §33.3 的标题形态是「林夕的生日」；若标题里已经带了姓名就不再重复。 */
  const title = !item.title ? name : item.title.includes(name) ? item.title : `${name}的${item.title}`;

  /* PersonRef 只带关系标签，星系在星图里看得到，这里不重复拉取。 */
  const relationship = item.person.relationshipLabel ?? "";

  const memory = item.lastYearMemory;

  return (
    <Card tone="soft" className={cn("flex flex-col gap-3 px-4 py-4 md:px-5 md:py-5", className)}>
      <div className="flex flex-col gap-1">
        <span
          className={cn(
            "text-micro tracking-wide",
            item.inDays === 0 ? "text-accent" : "text-ink-3",
          )}
        >
          {dueDayLabel(item.inDays)}
        </span>
        <h3 className="text-h3 text-ink">{title}</h3>
        {relationship && <p className="text-sm text-ink-3">{relationship}</p>}
      </div>

      {memory && (
        <div className="flex flex-col gap-1 border-t border-line-subtle pt-3">
          <span className="text-sm text-ink-3">去年你记录：</span>
          <p className="text-body text-ink-2">{memory.content || memory.title}</p>
          <span className="text-sm text-ink-4">{formatMonthDay(memory.date)}</span>
        </div>
      )}

      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/people/${item.person.id}`)}>
          查看{name}的档案
        </Button>
      </div>
    </Card>
  );
}
