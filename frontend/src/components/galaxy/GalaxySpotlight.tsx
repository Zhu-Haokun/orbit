import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarHeart, ImageIcon, Sparkles } from "lucide-react";

import { daysSince, formatMonthDay } from "@/lib/format";
import { useUiStore } from "@/stores/uiStore";
import type { PersonSummary } from "@/types";

/**
 * 星图的「此刻值得看」入口（产品升级文档 P0-1）。
 *
 * 星图是强视觉入口，但用户看完星星之后常常不知道下一步做什么 ——
 * "漂亮但停留时间短"。这里在搜索框下面放一条每次只显示一项的上下文入口，
 * 不新增一级导航，也不把星图改成信息流。
 *
 * 候选**只来自已经存在的事实**，按优先级取第一条命中：
 *   1. 有人还没有任何记录  → 去记录（这是最该被补上的空白）
 *   2. 60 天内的重要日期   → 打开那个人
 *   3. 最近有记录的人       → 打开那个人
 *   4. 星图里还没有人       → 添加第一个人
 *
 * 刻意不做"最重要的人""最该联系的人"这类推断 ——
 * 文档与规范都禁止关系评分，这里的每一句都能在数据里核对。
 */

/** 距离某个日期还有几天；已经过去的返回负数。 */
function daysUntil(iso: string, from: Date): number {
  const target = new Date(`${iso.slice(0, 10)}T12:00:00Z`).getTime();
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  return Math.round((target - start) / 86_400_000);
}

function useSpotlight(people: PersonSummary[]) {
  return useMemo(() => {
    if (people.length === 0) return null;

    const today = new Date();

    // 1) 有人还没有任何记录 —— 这是最该被补上的空白。
    const neverRecorded = people.filter((person) => person.interactionCount === 0);

    // 2) 60 天内的重要日期。
    const upcoming = people
      .flatMap((person) => {
        const next = person.nextImportantDate;
        if (!next?.date) return [];
        return [{ person, date: next.date, label: next.title }];
      })
      .map((entry) => ({ ...entry, days: daysUntil(entry.date, today) }))
      .filter((entry) => entry.days >= 0 && entry.days <= 60)
      .sort((a, b) => a.days - b.days);

    // 3) 最近有记录的人。
    const recentlyRecorded = people
      .filter((person) => person.lastInteractionAt)
      .sort((a, b) => (b.lastInteractionAt ?? "").localeCompare(a.lastInteractionAt ?? ""))[0];

    if (neverRecorded.length > 0) {
      const person = neverRecorded[0]!;
      return {
        icon: "record" as const,
        text: `还没有记录 · ${person.name}`,
        hint: "记下最近发生的一件小事",
        personId: person.id,
        action: "record" as const,
      };
    }

    if (upcoming.length > 0) {
      const entry = upcoming[0]!;
      return {
        icon: "date" as const,
        text: `${formatMonthDay(entry.date)} · ${entry.person.name}`,
        hint: entry.days === 0 ? `今天 · ${entry.label}` : `还有 ${entry.days} 天 · ${entry.label}`,
        personId: entry.person.id,
        action: "open" as const,
      };
    }

    if (recentlyRecorded) {
      const days = daysSince(recentlyRecorded.lastInteractionAt, today);
      const when = days === null ? "打开看看" : days <= 0 ? "今天" : days === 1 ? "昨天" : `${days} 天前`;
      return {
        icon: "spark" as const,
        text: `最近有记录 · ${recentlyRecorded.name}`,
        hint: when,
        personId: recentlyRecorded.id,
        action: "open" as const,
      };
    }

    const person = people[0]!;
    return {
      icon: "record" as const,
      text: `还没有记录 · ${person.name}`,
      hint: "记下最近发生的一件小事",
      personId: person.id,
      action: "record" as const,
    };
  }, [people]);
}

const ICONS = {
  record: Sparkles,
  date: CalendarHeart,
  spark: ImageIcon,
} as const;

export function GalaxySpotlight({ people }: { people: PersonSummary[] }) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const openPerson = useUiStore((state) => state.openPerson);

  const spotlight = useSpotlight(people);
  if (!spotlight) return null;

  const Icon = ICONS[spotlight.icon];

  const go = () => {
    if (spotlight.action === "record") {
      navigate(`/record?person=${spotlight.personId}`);
      return;
    }
    // 打开 Drawer 会把人物 id 同步进 URL，和其他入口行为一致。
    openPerson(spotlight.personId);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none absolute inset-x-0 top-[68px] z-20 flex justify-center px-4"
    >
      <button
        type="button"
        onClick={go}
        className="glass-panel pointer-events-auto group flex max-w-[min(92vw,420px)] items-center gap-3 rounded-pill border border-line-subtle px-4 py-2 text-left shadow-soft transition-colors duration-[140ms] hover:border-line"
      >
        <Icon className="size-3.5 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <span className="text-body text-ink">{spotlight.text}</span>
          <span className="ml-2 text-sm text-ink-4">{spotlight.hint}</span>
        </span>
        <ArrowRight
          className="size-3.5 shrink-0 text-ink-4 transition-transform duration-[140ms] group-hover:translate-x-0.5"
          aria-hidden
        />
      </button>
    </motion.div>
  );
}
