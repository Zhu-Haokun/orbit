import type { ReactNode } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { usePerson } from "@/hooks/usePeople";
import { formatImportantDate, formatMonthDay, formatTimelineDate, metDurationLabel, truncate } from "@/lib/format";
import { useUiStore } from "@/stores/uiStore";

/**
 * 规范 §18 星图人物 Drawer
 * Desktop: width 380 / top 16 / right 16 / radius 20 / glass + blur。
 * scrim={false} —— Drawer 出现时星图不冻结（移动端由原语自动变成全屏 sheet）。
 *
 * 顺序固定：头像 + 姓名 + 关系标签 + 认识多久 → [记录互动] →
 * 最近近况 → 未完待续 → 重要日期 → 最近时间轴 3 条 → [查看完整档案]。
 */

const TIMELINE_LIMIT = 3;
const SECTION_LIMIT = 3;

export interface PersonDrawerProps {
  personId: string | null;
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm text-ink-3">{title}</h3>
      {children}
    </section>
  );
}

const EMPTY_TEXT = "text-sm text-ink-4";

export function PersonDrawer({ personId }: PersonDrawerProps) {
  const navigate = useNavigate();
  const closePerson = useUiStore((state) => state.closePerson);
  // 关闭时保留最后一个人物，避免退场动画期间内容先被清空（React 官方的 props 派生 state 写法）。
  const [activeId, setActiveId] = useState(personId);
  if (personId && personId !== activeId) setActiveId(personId);

  const { data, isPending, isError, refetch } = usePerson(activeId);

  const updates = data ? data.updates.filter((update) => update.status === "active") : [];
  const openCommitments = data
    ? data.commitments.filter((item) => item.status === "open" || item.status === "later")
    : [];
  const importantDates = data ? data.importantDates.slice(0, SECTION_LIMIT) : [];
  const interactions = data
    ? [...data.interactions]
        .sort((a, b) => b.interactionDate.localeCompare(a.interactionDate))
        .slice(0, TIMELINE_LIMIT)
    : [];

  const sourceLabel = (sourceInteractionId: string | null) => {
    if (!sourceInteractionId || !data) return null;
    const source = data.interactions.find((item) => item.id === sourceInteractionId);
    if (!source) return null;
    return `来自 ${formatMonthDay(source.interactionDate)} 的记录`;
  };

  const metLabel = data ? metDurationLabel(data.metAt) : null;

  return (
    <Drawer
      open={Boolean(personId)}
      onClose={closePerson}
      title="人物档案"
      width={380}
      scrim={false}
    >
      {activeId && isPending && <SkeletonBlock lines={6} />}
      {isError && <ErrorState onRetry={() => void refetch()} />}

      {data && (
        <div className="flex flex-col gap-5 pb-2">
          <div className="flex items-center gap-3">
            <Avatar name={data.name} src={data.avatarUrl} size="lg" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="truncate text-h3 text-ink">{data.name}</p>
              {data.relationshipLabel && (
                <p className="truncate text-sm text-ink-3">{data.relationshipLabel}</p>
              )}
              {metLabel && <p className="text-sm text-ink-3">{metLabel}</p>}
            </div>
          </div>

          <Button variant="primary" block onClick={() => navigate(`/record?person=${data.id}`)}>
            记录互动
          </Button>

          <DrawerSection title="最近">
            {updates.length === 0 ? (
              <p className={EMPTY_TEXT}>还没有新的近况。</p>
            ) : (
              updates.slice(0, SECTION_LIMIT).map((update) => {
                const source = sourceLabel(update.sourceInteractionId);
                return (
                  <div
                    key={update.id}
                    className="rounded-md border border-line-subtle bg-soft/60 px-3 py-2"
                  >
                    <p className="text-body text-ink-2">{update.content}</p>
                    {source && <p className="mt-0.5 text-sm text-ink-4">{source}</p>}
                  </div>
                );
              })
            )}
          </DrawerSection>

          <DrawerSection title="未完待续">
            {openCommitments.length === 0 ? (
              <p className={EMPTY_TEXT}>暂时没有没说完的事情。</p>
            ) : (
              openCommitments.slice(0, SECTION_LIMIT).map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 rounded-md border border-line-subtle bg-soft/60 px-3 py-2"
                >
                  <span
                    aria-hidden
                    className="mt-1.5 size-2 shrink-0 rounded-full border border-line-hover"
                  />
                  <div className="min-w-0">
                    <p className="text-body text-ink-2">{item.content}</p>
                    {item.dueText && <p className="mt-0.5 text-sm text-ink-4">{item.dueText}</p>}
                    {item.status === "later" && <p className="mt-0.5 text-sm text-ink-4">稍后再说</p>}
                  </div>
                </div>
              ))
            )}
          </DrawerSection>

          <DrawerSection title="重要日期">
            {importantDates.length === 0 ? (
              <p className={EMPTY_TEXT}>还没有记录重要日期。</p>
            ) : (
              importantDates.map((item) => (
                <div key={item.id} className="rounded-md border border-line-subtle px-3 py-2">
                  <p className="text-body text-ink-2">
                    {formatImportantDate(item.date, item.datePrecision, item.dateText)}
                  </p>
                  <p className="text-sm text-ink-3">{item.title}</p>
                </div>
              ))
            )}
          </DrawerSection>

          <DrawerSection title="时间轴">
            {interactions.length === 0 ? (
              <p className={EMPTY_TEXT}>你们的故事还没有被记录下来。</p>
            ) : (
              interactions.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <span className="w-10 shrink-0 pt-0.5 text-sm text-ink-4 tabular-nums">
                    {formatTimelineDate(item.interactionDate)}
                  </span>
                  <div className="min-w-0 flex-1 border-l border-line-subtle pl-3">
                    <p className="truncate text-body text-ink-2">{item.title}</p>
                    {item.content && (
                      <p className="text-sm text-ink-3">{truncate(item.content, 40)}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </DrawerSection>

          <button
            type="button"
            onClick={() => navigate(`/people/${data.id}`)}
            className="inline-flex h-10 w-full items-center justify-center rounded-md border border-line text-body text-ink-2 transition-colors duration-[140ms] hover:border-line-hover hover:text-ink"
          >
            查看完整档案
          </button>
        </div>
      )}
    </Drawer>
  );
}
