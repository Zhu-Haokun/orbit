import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { MemoryIndex } from "@/features/memories/MemoryIndex";
import { MemoriesReplay } from "@/features/memories/MemoriesReplay";
import { MemoryTimeline } from "@/features/memories/MemoryTimeline";
import { useMemories } from "@/hooks/useInsights";
import { useGroups } from "@/hooks/usePeople";
import type { MemoriesPayload } from "@/types";

/**
 * 规范 §34 回忆页
 *
 * 布局（产品升级文档「方向一：导航型右栏」）：
 *   正文时间线限制在约 720px 的舒适阅读行宽，
 *   右侧 260px 是**回忆索引**——月份目录、人物/地点索引、当前范围摘要。
 *   之前的右侧只有四行统计数字然后大片空白，那不是留白，是没干完活。
 *
 * 超过 1440px 的空间给索引，而不是把正文拉成横向长句。
 */

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-ink-4">{label}</span>
      {children}
    </div>
  );
}

function MemoriesSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      {[0, 1].map((block) => (
        <div key={block} className="flex flex-col gap-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      ))}
    </div>
  );
}

/**
 * 滚动时同步当前月份：索引栏里对应那条会亮起来。
 *
 * 注意滚动容器不是 window —— AppShell 把内容页的滚动放在 `<main>` 上
 * （`overflow-y: auto`），所以必须挂到那个元素上，否则监听永远不触发。
 */
function useScrollContainer(): HTMLElement | null {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.querySelector<HTMLElement>("main"));
  }, []);
  return container;
}

function useActiveMonth(monthKeys: string[], enabled: boolean): string | null {
  const [active, setActive] = useState<string | null>(null);
  const container = useScrollContainer();
  const keySignature = monthKeys.join("|");

  useEffect(() => {
    if (!enabled || monthKeys.length === 0) return;
    const target: HTMLElement | Window = container ?? window;
    let frame = 0;

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        // 取"已经越过视口上沿的最后一个月"，就是用户当前正在看的那一段。
        let current: string | null = null;
        for (const key of monthKeys) {
          const element = document.getElementById(`memory-month-${key}`);
          if (!element) continue;
          if (element.getBoundingClientRect().top <= 180) current = key;
        }
        setActive(current ?? monthKeys[0] ?? null);
      });
    };

    onScroll();
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
    // keySignature 已经概括了 monthKeys 的内容。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySignature, enabled, container]);

  return active;
}

function MemoriesBody({
  payload,
  activeMonth,
  onPickLocation,
  onPickPerson,
  activeLocation,
  activePersonId,
}: {
  payload: MemoriesPayload;
  activeMonth: string | null;
  onPickLocation: (value: string) => void;
  onPickPerson: (id: string) => void;
  activeLocation: string | null;
  activePersonId: string | null;
}) {
  return (
    <div className="flex flex-col gap-10">
      {/* 回顾带只在"全部年份 + 未按人/地点收窄"时出现：收窄后用户已经在主动找了。 */}
      {payload.year === null && !activeLocation && !activePersonId && (
        <MemoriesReplay payload={payload} />
      )}
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 xl:max-w-[720px]">
          {/*
            阅读场（产品文档「背景层次」试点）：主列坐在一块略亮的表面上，
            时间线两侧仍然是更暗的画布 —— 视线因此停在文字和图片上，
            而不是靠"给每个区块加卡片"来分隔。
          */}
          <div className="orbit-reading-field -mx-4 px-4 py-6 md:-mx-6 md:px-6">
            <MemoryTimeline months={payload.months} />
          </div>
        </div>
        <div className="xl:sticky xl:top-8 xl:self-start">
          <MemoryIndex
            payload={payload}
            activeMonth={activeMonth}
            onPickLocation={onPickLocation}
            onPickPerson={onPickPerson}
            activeLocation={activeLocation}
            activePersonId={activePersonId}
          />
        </div>
      </div>
    </div>
  );
}

export function MemoriesPage() {
  const [year, setYear] = useState<number | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);

  const filters = useMemo(
    () => ({ year, groupId, location, personId }),
    [year, groupId, location, personId],
  );
  const memories = useMemories(filters);
  const groupsQuery = useGroups();
  const payload = memories.data;
  const groups = groupsQuery.data ?? [];

  const monthKeys = useMemo(() => payload?.months.map((m) => m.key) ?? [], [payload]);
  const activeMonth = useActiveMonth(monthKeys, monthKeys.length > 1);

  const clearAll = useCallback(() => {
    setYear(null);
    setGroupId(null);
    setLocation(null);
    setPersonId(null);
  }, []);

  const hasScope = year !== null || groupId !== null || location !== null || personId !== null;
  const total = payload ? payload.months.reduce((sum, m) => sum + m.items.length, 0) : 0;

  const scopeLabel = [
    year !== null ? `${year} 年` : "全部时间",
    groups.find((g) => g.id === groupId)?.name,
    location,
    personId ? payload?.months.flatMap((m) => m.items).flatMap((i) => i.people).find((p) => p.id === personId)?.name : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    // 宽屏提到 1240px 给索引留位置；正文自己限制行宽，不跟着变长。
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-8 px-4 py-8 md:px-8 md:py-10 lg:px-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-display text-ink">回忆</h1>
        <p className="max-w-[42ch] text-lg text-ink-2">
          你记录下来的，
          <br />
          不是数据，是你和别人一起经历过的时间。
        </p>
        {/* 事实型副信息：比抽象文案更能让人感到"这里确实有我的内容"。 */}
        {payload && total > 0 && (() => {
          // payload.months 是倒序的，最后一个是数据里最早的月份。
          const oldest = payload.months[payload.months.length - 1];
          return (
            <p className="text-sm text-ink-4 tabular-nums">
              {oldest ? `从 ${oldest.year} 年 ${oldest.month} 月开始，` : ""}
              你记录了 {total} 段经历。
            </p>
          );
        })()}
      </header>

      <div className="flex flex-col gap-3">
        <FilterRow label="时间">
          <Chip active={year === null} onClick={() => setYear(null)}>
            全部
          </Chip>
          {(payload?.years ?? []).map((item) => (
            <Chip key={item} active={year === item} onClick={() => setYear(item)} className="tabular-nums">
              {item}
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label="星系">
          <Chip active={groupId === null} onClick={() => setGroupId(null)}>
            全部
          </Chip>
          {groups.map((group) => (
            <Chip
              key={group.id}
              active={groupId === group.id}
              onClick={() => setGroupId(group.id)}
            >
              {group.name}
            </Chip>
          ))}
        </FilterRow>

        {/* 当前范围：让用户随时知道自己在看什么，并且能一键退回。 */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-4">
          <span className="tabular-nums">
            {hasScope ? `${scopeLabel} · ${total} 段经历` : "显示全部时间"}
          </span>
          {hasScope && (
            <button
              type="button"
              onClick={clearAll}
              className="text-ink-3 underline-offset-2 transition-colors duration-[140ms] hover:text-ink hover:underline"
            >
              清除筛选
            </button>
          )}
        </div>
      </div>

      {memories.isError ? (
        <ErrorState onRetry={() => void memories.refetch()} />
      ) : payload === undefined ? (
        <MemoriesSkeleton />
      ) : payload.months.length === 0 ? (
        hasScope ? (
          <EmptyState
            title="这个范围还没有记录。"
            description="换一个时间或星系看看，也可以回到全部时间。"
            action={{ label: "返回全部时间", onClick: clearAll }}
          />
        ) : (
          <EmptyState title="当你开始记录，这里会慢慢长出时间。" />
        )
      ) : (
        <MemoriesBody
          payload={payload}
          activeMonth={activeMonth}
          onPickLocation={(value) => setLocation((prev) => (prev === value ? null : value))}
          onPickPerson={(id) => setPersonId((prev) => (prev === id ? null : id))}
          activeLocation={location}
          activePersonId={personId}
        />
      )}
    </div>
  );
}
