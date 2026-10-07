import type { ReactNode } from "react";

import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { MemoryPromptCard } from "@/features/today/MemoryPromptCard";
import { TodayCommitmentCard } from "@/features/today/TodayCommitmentCard";
import { TodayDateCard } from "@/features/today/TodayDateCard";
import { useToday } from "@/hooks/useInsights";
import { cn } from "@/lib/cn";
import { formatMonthDay, formatWeekday, todayKey } from "@/lib/format";
import type { TodayPayload } from "@/types";

/**
 * 规范 §33 今天页 / §79 max-width 900px
 *
 * 今天有哪些与「我在乎的人」有关的信息值得注意？—— 不是任务列表（§33）。
 * Section 顺序固定：今天的重要日期 → 未完待续 → 借还 → 值得回看的记忆（§33.2）。
 * 状态见 §52 Today：loading / normal / nothing-today / error。
 */

/** 规范 §33.1: 「10 月 5 日」—— 今天页不展示年份。 */
function formatTodayHeading(dateKey: string): string {
  const monthDay = formatMonthDay(dateKey);
  return monthDay || formatMonthDay(todayKey());
}

/** 规范 §33.1: 按本地时间选择问候语。 */
function greetingForHour(hour: number): string {
  if (hour < 6) return "晚上好。";
  if (hour < 12) return "早上好。";
  if (hour < 18) return "下午好。";
  return "晚上好。";
}

/** 规范 §33.1: 0 / 1 / N 都要读得通顺。 */
/**
 * 顶部第二句（产品升级文档 P0-3）。
 *
 * 原来只有一句"今天有 N 件…"，读起来像待办清单的计数。
 * 改成一条**可核对的事实摘要**：先说最近一件值得留意的事，
 * 再补一个总数，让这一页像"今天可以重新遇见什么"而不是"今天要处理什么"。
 */
function headlineForPayload(payload: TodayPayload): string {
  const { importantDates, commitments, borrowRecords, memoryPrompts, headlineCount } = payload;

  if (headlineCount <= 0) return "今天没有需要特别留意的事情。";

  const parts: string[] = [];

  if (importantDates.length > 0) {
    const first = importantDates[0]!;
    parts.push(`${first.person.name}的${first.title}`);
  }
  if (memoryPrompts.length > 0) {
    parts.push("有一段可以回看的记忆");
  }
  if (commitments.length > 0) {
    parts.push(`${commitments.length} 件没说完的事`);
  }
  if (borrowRecords.length > 0) {
    parts.push(`${borrowRecords.length} 条借还`);
  }

  if (parts.length === 0) {
    return `今天有 ${headlineCount} 件与你在乎的人有关的事情。`;
  }
  return `今天可以看看：${parts.slice(0, 2).join(" · ")}。`;
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <h2 className="text-sm text-ink-3">{title}</h2>
      {children}
    </section>
  );
}

function BorrowRow({
  person,
  itemName,
  direction,
  borrowDate,
  status,
}: TodayPayload["borrowRecords"][number]) {
  const personName = person.name;
  const directionLabel =
    direction === "lent_to" ? `我借给${personName}` : `${personName}借给我`;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-subtle px-1 py-3 last:border-b-0">
      <span className="text-body text-ink">{personName}</span>
      <span className="text-body text-ink-2">{itemName}</span>
      <span className="text-sm text-ink-3">{directionLabel}</span>
      <span className="text-sm text-ink-4">{formatMonthDay(borrowDate)}</span>
      {status === "open" && <span className="text-sm text-ink-4">尚未归还</span>}
    </div>
  );
}

function TodayBody({ payload }: { payload: TodayPayload }) {
  const { importantDates, commitments, borrowRecords, memoryPrompts } = payload;

  /* 规范 §52: nothing-today —— 今天没有值得留意的事情时，不堆砌空区块。 */
  if (payload.headlineCount <= 0 && importantDates.length === 0 && commitments.length === 0 && memoryPrompts.length === 0) {
    return <p className="text-body text-ink-3">今天没有需要特别留意的事情。</p>;
  }

  return (
    <>
      {importantDates.length > 0 && (
        <Section title="今天的重要日期">
          {importantDates.map((item) => (
            <TodayDateCard key={item.id} item={item} />
          ))}
        </Section>
      )}

      {commitments.length > 0 && (
        <Section title="未完待续">
          {commitments.map((item) => (
            <TodayCommitmentCard key={item.id} item={item} />
          ))}
        </Section>
      )}

      {borrowRecords.length > 0 && (
        <Section title="借还">
          <div className="flex flex-col">
            {borrowRecords.map((item) => (
              <BorrowRow key={item.id} {...item} />
            ))}
          </div>
        </Section>
      )}

      {memoryPrompts.length > 0 && (
        <Section title="值得回看的记忆">
          {memoryPrompts.map((item) => (
            <MemoryPromptCard key={item.person.id} item={item} />
          ))}
        </Section>
      )}
    </>
  );
}

function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <SkeletonList rows={2} />
      <SkeletonList rows={2} />
    </div>
  );
}

export function TodayPage() {
  const { data, isError, refetch } = useToday();
  const now = new Date();
  const heading = data ? formatTodayHeading(data.date) : formatTodayHeading(todayKey());

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-10 px-4 py-8 md:px-8 md:py-10 lg:px-10">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1 text-ink tabular-nums">{heading}</h1>
          <p className="text-body text-ink-3">{formatWeekday(now)}</p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-h3 text-ink">{greetingForHour(now.getHours())}</p>
          {data && <p className="text-body text-ink-2">{headlineForPayload(data)}</p>}
        </div>
      </header>

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : data === undefined ? (
        <TodaySkeleton />
      ) : (
        <TodayBody payload={data} />
      )}
    </div>
  );
}
