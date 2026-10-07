import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { formatMonthDay, truncate } from "@/lib/format";
import type { MemoriesPayload, MemoryItem } from "@/types";

/**
 * 「回顾带」（产品升级文档：把数据重新变成回忆）。
 *
 * 参考 Apple Photos 的被动发现：不依赖用户主动搜索，
 * 每次进回忆页时挑一两条值得再看一眼的旧内容放在最上面。
 *
 * 两条原则：
 * 1. 只用真实数据。优先级：往年今天 → 有图片的旧记忆；没有合适的就不显示，绝不硬凑。
 * 2. 每条都要说清楚"为什么现在给你看这个" —— 没有理由的推荐会让人不安。
 */

const MAX_ITEMS = 2;

interface ReplayEntry {
  item: MemoryItem;
  /** 为什么此刻显示这一条。必须是可核对的事实。 */
  reason: string;
}

interface Replay {
  label: string;
  hint: string;
  entries: ReplayEntry[];
}

function pickReplay(payload: MemoriesPayload, today: Date): Replay | null {
  const all = payload.months.flatMap((month) => month.items);
  if (all.length === 0) return null;

  const monthDay = today.toISOString().slice(5, 10);
  const thisYear = today.getFullYear();

  // 往年今天：同月同日、但不是今年的。
  const sameDay = all.filter(
    (item) => item.date.slice(5, 10) === monthDay && item.date.slice(0, 4) !== String(thisYear),
  );
  if (sameDay.length > 0) {
    return {
      label: "几年前的今天",
      hint: "同一天发生过的事",
      entries: sameDay.slice(0, MAX_ITEMS).map((item) => ({
        item,
        reason: `${thisYear - Number(item.date.slice(0, 4))} 年前的今天`,
      })),
    };
  }

  // 退一步：有图片的旧记忆，图片比文字更容易把人拉回去。
  const withImages = all
    .filter((item) => item.attachments.some((attachment) => attachment.fileType === "image"))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (withImages.length > 0) {
    return {
      label: "翻出来看看",
      hint: "留下过照片的记忆",
      entries: withImages.slice(0, MAX_ITEMS).map((item) => {
        const photos = item.attachments.filter((a) => a.fileType === "image").length;
        return { item, reason: `留下过 ${photos} 张照片` };
      }),
    };
  }

  return null;
}

export function MemoriesReplay({ payload }: { payload: MemoriesPayload }) {
  const navigate = useNavigate();
  const replay = useMemo(() => pickReplay(payload, new Date()), [payload]);

  if (!replay) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h2 className="inline-flex items-center gap-2 font-display text-lg text-ink-2">
          <Sparkles className="size-3.5 text-accent" aria-hidden />
          {replay.label}
        </h2>
        <span className="text-sm text-ink-4">{replay.hint}</span>
      </div>

      <Card tone="soft">
        <ul className="flex flex-col divide-y divide-line-subtle">
          {replay.entries.map(({ item, reason }) => {
            const first = item.people[0];
            return (
              <li key={item.interactionId}>
                <button
                  type="button"
                  onClick={() =>
                    first &&
                    navigate(`/people/${first.id}?interaction=${item.interactionId}`)
                  }
                  className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors duration-[140ms] hover:bg-hover-fill"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-sm text-ink-3 tabular-nums">
                      {formatMonthDay(item.date)}
                    </span>
                    <span className="font-display text-body text-ink">{item.title}</span>
                  </div>
                  {item.content && (
                    <p className="text-sm text-ink-2">{truncate(item.content, 72)}</p>
                  )}
                  <p className="text-sm text-ink-4">
                    {/* 先给"为什么现在显示"，再给人物 —— 顺序本身就是解释。 */}
                    {reason}
                    {item.people.length > 0 &&
                      ` · ${item.people.map((person) => person.name).join(" · ")}`}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
