import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { PersonHero } from "@/components/people/PersonHero";
import { Timeline } from "@/components/timeline/Timeline";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton, SkeletonBlock, SkeletonList } from "@/components/ui/Skeleton";
import { BorrowList } from "@/features/borrow/BorrowList";
import { CommitmentList } from "@/features/commitments/CommitmentList";
import { ImportantDateList } from "@/features/dates/ImportantDateList";
import { PersonSummaryView } from "@/features/people/PersonSummaryView";
import { RecentUpdateList } from "@/features/people/RecentUpdateList";
import { PreferenceList } from "@/features/preferences/PreferenceList";
import { usePerson } from "@/hooks/usePeople";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

/**
 * 规范 §21 人物详情页 —— V1 实用价值核心。
 * 规范 §79: main 最大宽度 980px 居中。
 * 规范 §80: Section gap 40px / Page horizontal padding 32px desktop、16px mobile。
 * 规范 §21.2 顺序固定：最近近况 → 未完待续 → 重要日期 → 偏好 → 借还 → 时间轴。
 * 规范 §52 状态：loading / normal / no-updates / no-commitments / no-timeline /
 * error / edit-mode（edit-mode 由 EditPersonModal 打开时呈现）。
 *
 * 在此基础上加了两个轻量视图（产品升级文档：同一份数据的不同视图）。
 * 「全部」仍然是默认值，所以习惯原来的用法的人不会被打断。
 */

const PAGE_CLASS =
  "mx-auto flex w-full max-w-[980px] flex-col gap-10 px-4 py-6 md:px-8 md:py-10";

type PersonView = "all" | "summary" | "timeline";

const VIEW_KEY = "orbit.person.view";

const VIEW_OPTIONS: ReadonlyArray<{ value: PersonView; label: string }> = [
  { value: "all", label: "全部" },
  { value: "summary", label: "摘要" },
  { value: "timeline", label: "时间轴" },
];

function readStoredView(): PersonView {
  if (typeof window === "undefined") return "all";
  try {
    const stored = window.localStorage.getItem(VIEW_KEY);
    return stored === "summary" || stored === "timeline" ? stored : "all";
  } catch {
    // 隐私模式下 localStorage 可能直接抛错。
    return "all";
  }
}

function PersonSkeleton() {
  return (
    <div className={PAGE_CLASS}>
      <div className="flex items-center gap-4">
        <Skeleton className="size-[72px] shrink-0 rounded-full" />
        <div className="flex w-full max-w-xs flex-col gap-2">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="w-1/3" />
        </div>
      </div>
      <SkeletonBlock lines={2} />
      <SkeletonList rows={2} />
      <SkeletonBlock lines={3} />
    </div>
  );
}

export default function PersonPage() {
  const { personId } = useParams<{ personId: string }>();
  // 搜索结果可以带 ?interaction=<id> 进来，直接定位到时间轴上那一条。
  const [searchParams] = useSearchParams();
  const focusInteractionId = searchParams.get("interaction");
  const { data: person, isPending, isError, error, refetch } = usePerson(personId);

  // 从搜索定位进来时必须是能看见时间轴的视图，否则会"跳了个寂寞"。
  const [view, setView] = useState<PersonView>(() =>
    focusInteractionId ? "all" : readStoredView(),
  );

  const changeView = (next: PersonView) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* 存不了就算了，不影响这次切换 */
    }
  };

  const missing = error instanceof ApiError && error.status === 404;

  if (!personId || missing) {
    return (
      <div className={PAGE_CLASS}>
        <EmptyState title="没有找到这个人。" />
      </div>
    );
  }

  if (isPending) return <PersonSkeleton />;

  if (isError) {
    return (
      <div className={PAGE_CLASS}>
        <ErrorState onRetry={() => void refetch()} />
      </div>
    );
  }

  if (!person) {
    return (
      <div className={PAGE_CLASS}>
        <EmptyState title="没有找到这个人。" />
      </div>
    );
  }

  return (
    <div className={PAGE_CLASS}>
      <div className="flex flex-col gap-6">
        <PersonHero person={person} />

        <div
          role="tablist"
          aria-label="档案视图"
          className="inline-flex w-fit items-center gap-1 rounded-pill border border-line-subtle bg-surface p-1"
        >
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={view === option.value}
              onClick={() => changeView(option.value)}
              className={cn(
                "rounded-pill px-3.5 py-1.5 text-sm transition-colors duration-[140ms]",
                view === option.value
                  ? "bg-accent-soft text-ink"
                  : "text-ink-3 hover:text-ink-2",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {view === "summary" && (
        <PersonSummaryView person={person} onOpenTimeline={() => changeView("timeline")} />
      )}

      {view === "all" && (
        <>
          <RecentUpdateList person={person} />
          <CommitmentList person={person} />
          <ImportantDateList person={person} />
          <PreferenceList person={person} />
          {/* 借还是"我们之间"的事，自己跟自己没有借还。 */}
          {!person.isSelf && <BorrowList person={person} />}
          <Timeline person={person} focusInteractionId={focusInteractionId} />
        </>
      )}

      {view === "timeline" && (
        <Timeline person={person} focusInteractionId={focusInteractionId} />
      )}
    </div>
  );
}
