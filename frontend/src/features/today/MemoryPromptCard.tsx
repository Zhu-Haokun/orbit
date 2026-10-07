import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { formatMonthDay } from "@/lib/format";
import type { MemoryPrompt } from "@/types";

/**
 * 规范 §33.5 值得回看的记忆
 *
 * 有一阵子没有新的记录
 * 阿杰
 * 你们上一次的记录：
 * 3 月 21 日 · 一起吃烤肉
 *
 * [看看那一天]
 *
 * 规范 §5.2: 绝不出现「赶紧联系他」这类命令式提醒。
 */

export interface MemoryPromptCardProps {
  item: MemoryPrompt;
  className?: string;
}

export function MemoryPromptCard({ item, className }: MemoryPromptCardProps) {
  const navigate = useNavigate();
  const name = item.person.name;

  const lastLine = item.lastInteractionAt
    ? [formatMonthDay(item.lastInteractionAt), item.lastInteractionTitle].filter(Boolean).join(" · ")
    : null;

  return (
    <Card tone="quiet" className={cn("flex flex-col gap-3 px-4 py-4 md:px-5 md:py-5", className)}>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-ink-3">有一阵子没有新的记录</span>
        <h3 className="text-h3 text-ink">{name}</h3>
      </div>

      {lastLine && (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-ink-3">你们上一次的记录：</span>
          <p className="text-body text-ink-2">{lastLine}</p>
        </div>
      )}

      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/people/${item.person.id}`)}>
          看看那一天
        </Button>
      </div>
    </Card>
  );
}
