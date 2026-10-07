import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useCompleteCommitment } from "@/hooks/useRecords";
import { cn } from "@/lib/cn";
import { relativeDayLabel } from "@/lib/format";
import type { TodayCommitment } from "@/types";

/**
 * 规范 §33.4 未完待续 / §54.1 完成微交互
 *
 * 老陈
 * 把租房网站发给他
 *
 * 昨天记录
 * [完成]
 *
 * 点击后：行变暗 → 约 500ms 后才让列表刷新（由 invalidatePersonScope 负责）。
 * 规范 §23: 永远不展示红色「逾期」徽标。
 */

const DIM_MS = 500;

export interface TodayCommitmentCardProps {
  item: TodayCommitment;
  className?: string;
}

export function TodayCommitmentCard({ item, className }: TodayCommitmentCardProps) {
  const complete = useCompleteCommitment();
  const [dimmed, setDimmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      window.clearTimeout(timer.current);
    };
  }, []);

  const onComplete = () => {
    if (dimmed) return;
    setDimmed(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      complete.mutate(item.id);
    }, DIM_MS);
  };

  const recordedLabel = item.recordedAt ? `${relativeDayLabel(item.recordedAt)}记录` : null;

  return (
    <Card
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-3 transition-opacity duration-[140ms] md:px-5 md:py-4",
        dimmed && "opacity-40",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm text-ink-3">{item.person.name}</span>
        <p className="text-body text-ink">{item.content}</p>
        {recordedLabel && <span className="text-sm text-ink-4">{recordedLabel}</span>}
      </div>

      <Button variant="secondary" size="sm" onClick={onComplete} disabled={dimmed} className="shrink-0">
        完成
      </Button>
    </Card>
  );
}
