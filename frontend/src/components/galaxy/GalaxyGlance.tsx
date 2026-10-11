import { useMemo } from "react";
import { Link } from "react-router-dom";

import { usePeople } from "@/hooks/usePeople";
import { useToday } from "@/hooks/useInsights";
import { daysSinceLastInteraction } from "@/lib/starTone";

/**
 * 星图左下角的「今晚的天象」小面板。
 *
 * ## 为什么需要
 *
 * 星图是全应用最好看的一页，但也是**信息最空**的一页：它把 55 个人摊成
 * 一片星空，却不告诉你今晚该看谁。用户逛完一圈，除了"好看"什么也没带走。
 *
 * 这里补一句最小的提示：几个需要被看见的人，加一条通往今天页的路。
 * 它刻意做得**很小** —— 星图的主角仍然是星星，这只是一个门牌。
 *
 * 只在桌面显示：手机上星图本来就窄，左下角还被星系筛选条占着。
 */

/** 多久算「久未联系」。和今天页保持一致：半年。 */
const STALE_DAYS = 180;

interface Stat {
  value: number;
  label: string;
  /** 需要被看见时用主色。 */
  highlight?: boolean;
}

export function GalaxyGlance() {
  const { data: today } = useToday();
  const { data: people } = usePeople();

  const stats = useMemo<Stat[]>(() => {
    const list: Stat[] = [];

    const upcoming = today?.importantDates.length ?? 0;
    if (upcoming > 0) {
      list.push({ value: upcoming, label: "人生日或纪念日", highlight: true });
    }

    const open = today?.commitments.length ?? 0;
    if (open > 0) list.push({ value: open, label: "件没说完的事" });

    if (people && people.length > 0) {
      const stale = people.filter((person) => {
        if (person.isSelf || !person.lastInteractionAt) return false;
        return (daysSinceLastInteraction(person.lastInteractionAt) ?? 0) >= STALE_DAYS;
      }).length;
      if (stale > 0) list.push({ value: stale, label: "个人久了" });
    }

    return list;
  }, [today, people]);

  if (stats.length === 0) return null;

  return (
    <Link
      to="/today"
      aria-label="今晚的天象，打开今天页"
      className="pointer-events-auto absolute left-4 top-4 hidden flex-col gap-2 rounded-lg border border-line-subtle bg-surface/85 px-3.5 py-3 backdrop-blur-sm transition-colors hover:border-line-default hover:bg-elevated/90 md:flex"
    >
      <span className="text-xs text-ink-3">今晚的天象</span>
      <span className="flex items-baseline gap-3">
        {stats.map((stat) => (
          <span key={stat.label} className="flex items-baseline gap-1">
            <span
              className={`text-h3 tabular-nums ${stat.highlight ? "text-accent" : "text-ink"}`}
            >
              {stat.value}
            </span>
            <span className="text-xs text-ink-4">{stat.label}</span>
          </span>
        ))}
      </span>
    </Link>
  );
}
