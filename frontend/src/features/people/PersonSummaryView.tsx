import { useNavigate } from "react-router-dom";
import { CircleDashed } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { daysSince, formatMonthDay, metDurationLabel, truncate } from "@/lib/format";
import type { PersonDetail } from "@/types";

/**
 * 人物页「摘要」视图（参考 Notion：同一份数据换一种视图服务不同的任务）。
 *
 * 完整视图适合"整理"（逐块检查近况 / 日期 / 借还），
 * 摘要视图适合"回看一眼这个人"：一眼看到最近发生了什么、还欠着什么。
 * 两个视图读的是同一份数据，不引入任何新的判断或评分。
 */

const FEATURED = 3;

function FactRow({ person }: { person: PersonDetail }) {
  const lastDays = daysSince(person.lastInteractionAt, new Date());
  const facts = [
    metDurationLabel(person.metAt),
    person.interactions.length > 0 ? `${person.interactions.length} 次记录` : null,
    lastDays === null ? "还没有记录" : lastDays === 0 ? "最近一次是今天" : `最近一次是 ${lastDays} 天前`,
  ].filter(Boolean) as string[];

  if (facts.length === 0) return null;

  return (
    <p className="text-body text-ink-3">
      {facts.map((fact, index) => (
        <span key={fact}>
          {index > 0 && <span className="text-ink-4"> · </span>}
          {fact}
        </span>
      ))}
    </p>
  );
}

export function PersonSummaryView({
  person,
  onOpenTimeline,
}: {
  person: PersonDetail;
  onOpenTimeline: () => void;
}) {
  const navigate = useNavigate();

  const interactions = [...person.interactions].sort((a, b) =>
    b.interactionDate.slice(0, 10).localeCompare(a.interactionDate.slice(0, 10)),
  );
  const featured = interactions.slice(0, FEATURED);

  // 只看"接下来的"日子：按月日比较，跨年也成立。没有具体日期的（例如"每年春天"）不进这一行。
  const todayMonthDay = new Date().toISOString().slice(5, 10);
  const upcoming = person.importantDates
    .filter((item): item is typeof item & { date: string } => Boolean(item.date))
    .filter((item) => item.date.slice(5, 10) >= todayMonthDay)
    .sort((a, b) => a.date.slice(5, 10).localeCompare(b.date.slice(5, 10)))[0];

  const openCommitments = person.commitments
    .filter((item) => item.status === "open")
    .slice(0, 2);

  const updates = person.updates.filter((item) => item.status === "active").slice(0, FEATURED);

  if (interactions.length === 0 && updates.length === 0 && openCommitments.length === 0) {
    return (
      <EmptyState
        title="还没有关于这个人的记录。"
        description="记下第一件事之后，这里会变成一眼能看完的摘要。"
        action={{ label: "记录互动", onClick: () => navigate(`/record?person=${person.id}`) }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <FactRow person={person} />

      {upcoming && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm text-ink-3">下一件值得记住的日子</h2>
          <Card tone="soft">
            <ul className="flex flex-col divide-y divide-line-subtle">
              <li className="flex items-baseline gap-3 px-4 py-3">
                <span className="font-data text-lg text-accent tabular-nums">
                  {formatMonthDay(upcoming.date)}
                </span>
                <span className="font-display text-body text-ink">{upcoming.title}</span>
              </li>
            </ul>
          </Card>
        </section>
      )}

      {updates.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm text-ink-3">最近在忙什么</h2>
          <ul className="flex flex-col gap-1.5">
            {updates.map((item) => (
              <li key={item.id} className="text-body text-ink-2">
                {item.content}
              </li>
            ))}
          </ul>
        </section>
      )}

      {featured.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm text-ink-3">最近的记忆</h2>
            {interactions.length > FEATURED && (
              <Button size="sm" variant="ghost" onClick={onOpenTimeline}>
                查看完整时间轴
              </Button>
            )}
          </div>
          <Card tone="soft">
            <ul className="flex flex-col divide-y divide-line-subtle">
              {featured.map((item) => (
                <li key={item.id} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-sm text-ink-3 tabular-nums">
                      {formatMonthDay(item.interactionDate)}
                    </span>
                    <span className="font-display text-body text-ink">{item.title}</span>
                  </div>
                  {item.content && (
                    <p className="text-sm text-ink-2">{truncate(item.content, 68)}</p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {openCommitments.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm text-ink-3">还没完的事</h2>
          <ul className="flex flex-col gap-2">
            {openCommitments.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-body text-ink-2">
                <CircleDashed className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                <span className={cn(item.dueDate && "text-ink")}>{item.content}</span>
                {item.dueText && <span className="text-sm text-ink-4">{item.dueText}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
