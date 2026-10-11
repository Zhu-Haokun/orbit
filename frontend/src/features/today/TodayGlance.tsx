import { useMemo } from "react";
import { Link } from "react-router-dom";

import { usePeople } from "@/hooks/usePeople";
import { useToday } from "@/hooks/useInsights";
import { cn } from "@/lib/cn";
import { daysSinceLastInteraction } from "@/lib/starTone";

/**
 * 「今晚的天象」—— 今天页顶部的概览条。
 *
 * ## 为什么加这个
 *
 * 原来今天页是一串**纵向堆叠的区块**：日期 → 未完待续 → 借还 → 记忆。
 * 每一块都是全宽列表，得一路滚下去才知道今天到底有什么事。
 *
 * 对照下来，观感差距不在功能多少，而在**首屏密度**：好的首页一屏就能
 * 把"今天该看什么"讲完，剩下的细节再往下走。
 *
 * 所以这里给一块紧凑的概览：四到五个小格，每格是**一个数字 + 一句最相关
 * 的事实**，而不是干巴巴的计数。下面的详细区块原样保留 —— 概览负责"一眼
 * 看完"，明细负责"点进去看全"。
 *
 * ## 为什么有「久未联系」
 *
 * 这是 Orbit 独有的一格。别的软件能告诉你"今天要做什么"，只有这里能告诉你
 * **"有个人，你快要忘记了"** —— 因为它有互动记录。这份数据一直在库里，
 * 以前只是没被摆到台面上。
 */

/** 多久算「久未联系」。半年 —— 比星等色阶的"有点久了"更严格一些。 */
const STALE_DAYS = 180;

/**
 * 每格的语义色。
 *
 * 颜色在这里不是装饰，是**分工**：
 *   warm  金  时间性的、要你留意的（纪念日 / 久未联系）
 *   accent 紫  你亲口许下的（未完待续）—— 和导航同一个颜色，属于"你"
 *   jade  绿  来往与结清（借还）
 *   cool  蓝  回头看的（回忆）
 * 于是扫一眼就知道哪几格在"叫你"。
 */
type GlanceTone = "warm" | "accent" | "jade" | "cool";

const TONE_CLASS: Record<GlanceTone, { dot: string; value: string }> = {
  warm: { dot: "bg-warning", value: "text-warning" },
  accent: { dot: "bg-accent", value: "text-accent" },
  jade: { dot: "bg-success", value: "text-success" },
  cool: { dot: "bg-info", value: "text-info" },
};

interface GlanceItem {
  key: string;
  /** 小标题，两到四个字。 */
  label: string;
  /** 主数值。 */
  value: string;
  /** 副行：最相关的那一条事实。 */
  hint: string;
  /** 语义色。 */
  tone: GlanceTone;
  /** 有去处时整格可点。 */
  to?: string;
}

function GlanceTile({ item }: { item: GlanceItem }) {
  const tone = TONE_CLASS[item.tone];

  const body = (
    <>
      <span className="flex items-center gap-1.5">
        {/* 一粒语义色的点 —— 比给整格上色克制得多，但足够把五格区分开。 */}
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} />
        <span className="truncate text-xs text-ink-3">{item.label}</span>
      </span>
      <span className={cn("text-h3 tabular-nums", tone.value)}>{item.value}</span>
      <span className="line-clamp-1 text-xs text-ink-4">{item.hint}</span>
    </>
  );

  const className = cn(
    "flex min-w-0 flex-col gap-1 rounded-lg border border-line-subtle bg-surface px-3 py-2.5",
    "transition-colors",
    item.to && "hover:border-line-default hover:bg-elevated",
  );

  if (item.to) {
    return (
      <Link to={item.to} className={className}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}

export function TodayGlance() {
  const { data: today } = useToday();
  const { data: people } = usePeople();

  const items = useMemo<GlanceItem[]>(() => {
    const list: GlanceItem[] = [];

    if (today) {
      const { importantDates, commitments, borrowRecords, memoryPrompts } = today;

      if (importantDates.length > 0) {
        const first = importantDates[0]!;
        list.push({
          key: "dates",
          label: "重要日期",
          value: `${importantDates.length} 件`,
          hint: `${first.person.name} · ${first.title}`,
          tone: "warm",
        });
      }

      if (commitments.length > 0) {
        const first = commitments[0]!;
        list.push({
          key: "commitments",
          label: "未完待续",
          value: `${commitments.length} 件`,
          hint: `${first.person.name} · ${first.content}`,
          tone: "accent",
          to: "/today",
        });
      }

      if (borrowRecords.length > 0) {
        const first = borrowRecords[0]!;
        list.push({
          key: "borrow",
          label: "借还",
          value: `${borrowRecords.length} 条`,
          hint: `${first.person.name} · ${first.itemName}`,
          tone: "jade",
          to: "/today",
        });
      }

      if (memoryPrompts.length > 0) {
        const first = memoryPrompts[0]!;
        list.push({
          key: "memories",
          label: "可以回看",
          value: `${memoryPrompts.length} 段`,
          // 优先用那条记录的标题 —— 比"某人的旧记录"具体得多。
          hint: first.lastInteractionTitle
            ? `${first.person.name} · ${first.lastInteractionTitle}`
            : `${first.person.name} 的旧记录`,
          tone: "cool",
          to: "/memories",
        });
      }
    }

    // 久未联系：Orbit 独有的一格。
    if (people && people.length > 0) {
      const stale = people
        .filter((person) => !person.isSelf && person.lastInteractionAt)
        .map((person) => ({
          person,
          days: daysSinceLastInteraction(person.lastInteractionAt) ?? 0,
        }))
        .filter((entry) => entry.days >= STALE_DAYS)
        .sort((a, b) => b.days - a.days);

      if (stale.length > 0) {
        const worst = stale[0]!;
        list.push({
          key: "stale",
          label: "久未联系",
          value: `${stale.length} 个人`,
          hint: `${worst.person.name} · ${worst.days} 天`,
          tone: "warm",
          to: "/galaxy",
        });
      }
    }

    return list;
  }, [today, people]);

  if (items.length === 0) return null;

  return (
    <section
      aria-label="今晚的天象"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
    >
      {items.map((item) => (
        <GlanceTile key={item.key} item={item} />
      ))}
    </section>
  );
}
