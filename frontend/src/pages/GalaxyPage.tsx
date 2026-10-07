import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { UserPlus } from "lucide-react";

import { GalaxyCanvas } from "@/components/galaxy/GalaxyCanvas";
import { GalaxySpotlight } from "@/components/galaxy/GalaxySpotlight";
import { GalaxyFilter } from "@/components/galaxy/GalaxyFilter";
import { GalaxyLegend } from "@/components/galaxy/GalaxyLegend";
import { GalaxySearch, galaxySearchMatch } from "@/components/galaxy/GalaxySearch";
import {
  GalaxyZoomControls,
  zoomGalaxyView,
  type GalaxyView,
} from "@/components/galaxy/GalaxyZoomControls";
import { PersonDrawer } from "@/components/galaxy/PersonDrawer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useGalaxyLayout } from "@/features/galaxy/useGalaxyLayout";
import { useGalaxyLinks, useGroups, usePeople } from "@/hooks/usePeople";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { daysSince } from "@/lib/format";
import { useUiStore } from "@/stores/uiStore";
import type { CircleLevel, PersonSummary } from "@/types";

/**
 * 规范 §14.1 星图页 / §19 空状态 / §52 Galaxy 状态矩阵。
 *
 * Full-bleed 画布，没有厚重 Topbar（§13），所有工具都是浮动层。
 * 状态覆盖：empty / loading / normal / searching / filtered / person-selected / error
 * —— searching、filtered、person-selected 由画布的高亮与渐隐表达，
 * empty / loading / error 是本页的三个覆盖层。
 */

/** 规范 §41 / §42: 手机默认只展示 12 个最相关节点。 */
const MOBILE_NODE_LIMIT = 12;

const CIRCLE_RANK: Record<CircleLevel, number> = {
  core: 3,
  frequent: 2,
  normal: 1,
  occasional: 0,
};

/** 手机的“最相关”只用于挑选展示哪些节点，不是关系评分（规范 §5.1）。 */
function relevance(person: PersonSummary): number {
  const circle = CIRCLE_RANK[person.circleLevel];
  const days = daysSince(person.lastInteractionAt);
  const recency = days === null ? 0 : Math.max(0, 1 - days / 365);
  return circle * 2 + recency;
}

export function GalaxyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const handledParam = useRef<string | null>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<GalaxyView>({ scale: 1, x: 0, y: 0 });
  const [focus, setFocus] = useState<{ personId: string; token: number } | null>(null);

  const peopleQuery = usePeople();
  const groupsQuery = useGroups();
  // 星图上"朋友之间的线"来自真实的共同经历，不是同星系就自动串起来。
  const sharedLinksQuery = useGalaxyLinks();
  const people = useMemo(() => peopleQuery.data ?? [], [peopleQuery.data]);
  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);

  const groupId = useUiStore((state) => state.galaxyGroupId);
  const query = useUiStore((state) => state.galaxyQuery);
  const selectedPersonId = useUiStore((state) => state.selectedPersonId);
  const openPerson = useUiStore((state) => state.openPerson);
  const isMobile = useIsMobile();

  /* ------------------------------ 画布尺寸 ------------------------------ */

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const report = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /* --------------------------- 数据 → 星图布局 --------------------------- */

  const visiblePeople = useMemo(() => {
    const trimmed = query.trim();
    if (!isMobile || groupId || trimmed) return people;
    return [...people].sort((a, b) => relevance(b) - relevance(a)).slice(0, MOBILE_NODE_LIMIT);
  }, [people, isMobile, groupId, query]);

  const { nodes, links, bounds } = useGalaxyLayout({
    people: visiblePeople,
    groups,
    width: size.width,
    height: size.height,
    groupId,
    query,
  });

  const matchedIds = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return null;
    const ids = new Set<string>();
    for (const person of visiblePeople) {
      if (galaxySearchMatch(person, trimmed)) ids.add(person.id);
    }
    return ids;
  }, [visiblePeople, query]);

  const firstMatchId = useMemo(() => {
    if (!matchedIds) return null;
    return visiblePeople.find((person) => matchedIds.has(person.id))?.id ?? null;
  }, [matchedIds, visiblePeople]);

  /* ---------------------------- URL ↔ Drawer ---------------------------- */

  /*
   * 规范 §8: /galaxy?person=<id> 必须打开该人物的 Drawer，打开 / 关闭也要保持 URL 同步。
   * 两个方向放在同一个 effect 里，避免同一轮渲染里互相覆盖：
   * URL 上出现了新的 person 参数 → 以 URL 为准；否则以 store 为准回写 URL。
   */
  const personParam = searchParams.get("person");
  useEffect(() => {
    if (personParam && personParam !== handledParam.current) {
      handledParam.current = personParam;
      openPerson(personParam);
      return;
    }
    handledParam.current = personParam;
    const next = new URLSearchParams(searchParams);
    if (selectedPersonId) next.set("person", selectedPersonId);
    else next.delete("person");
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [personParam, selectedPersonId, searchParams, setSearchParams, openPerson]);

  /**
   * URL 是抽屉的最终依据：带着 ?person= 进来就打开，没带就收起。
   * 只在挂载时判定一次，避免和上面的双向同步互相触发。
   */
  useEffect(() => {
    if (!personParam) useUiStore.getState().closePerson();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------------------- 视图 -------------------------------- */

  const handleViewChange = useCallback((next: GalaxyView) => setView(next), []);
  const zoomIn = useCallback(
    () => setView((current) => zoomGalaxyView(current, 1.25, { x: size.width / 2, y: size.height / 2 })),
    [size.width, size.height],
  );
  const zoomOut = useCallback(
    () => setView((current) => zoomGalaxyView(current, 0.8, { x: size.width / 2, y: size.height / 2 })),
    [size.width, size.height],
  );
  const resetView = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), []);
  const handleFocusFirstMatch = useCallback(() => {
    if (!firstMatchId) return;
    openPerson(firstMatchId);
    setFocus({ personId: firstMatchId, token: Date.now() });
  }, [firstMatchId, openPerson]);

  /**
   * 规范 §54.2: 新建人物保存后自动定位新星并打开抽屉。
   * 等人物列表里真的出现这个人再聚焦，否则会定位到一个还不存在的节点。
   */
  const focusPersonId = useUiStore((state) => state.focusPersonId);
  useEffect(() => {
    if (!focusPersonId) return;
    if (!people.some((person) => person.id === focusPersonId)) return;
    setFocus({ personId: focusPersonId, token: Date.now() });
    openPerson(focusPersonId);
    useUiStore.getState().clearFocusPerson();
  }, [focusPersonId, people, openPerson]);

  /* -------------------------------- 状态 -------------------------------- */

  const isPending = peopleQuery.isPending || groupsQuery.isPending;
  // 文档 P0-3: 星系请求失败也要报出来，否则筛选条会无声消失。
  const isError = peopleQuery.isError || groupsQuery.isError;
  const isEmpty = !isPending && !isError && people.length === 0;

  const retryAll = useCallback(() => {
    void peopleQuery.refetch();
    void groupsQuery.refetch();
  }, [peopleQuery, groupsQuery]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-base">
      <GalaxyCanvas
        nodes={nodes}
        links={links}
        sharedLinks={sharedLinksQuery.data ?? []}
        groups={groups}
        bounds={bounds}
        width={size.width}
        height={size.height}
        view={view}
        onViewChange={handleViewChange}
        matchedIds={matchedIds}
        focus={focus}
      />

      <GalaxySearch onFocusFirstMatch={handleFocusFirstMatch} />
      <GalaxySpotlight people={people} />
      {groups.length > 0 && <GalaxyFilter groups={groups} />}
      <GalaxyZoomControls
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onReset={resetView}
        actions={
          // 规范只在 §19 空状态给了「添加第一个人」，一旦星图里有人就再没有入口。
          // 这里补一个常驻入口：不新增一级导航，放在右下角操作组里（§0.9）。
          <Button
            variant="secondary"
            size="md"
            className="glass-panel shadow-soft"
            icon={<UserPlus className="size-4" aria-hidden />}
            onClick={() => useUiStore.getState().openCreatePerson()}
          >
            添加人物
          </Button>
        }
      />
      <GalaxyLegend />

      {/* 规范 §52 loading: 用低对比 skeleton，绝不用大 spinner（§40.1）。 */}
      {isPending && (
        <div className="pointer-events-none absolute inset-x-0 top-[58%] flex -translate-y-1/2 justify-center">
          <div className="glass-panel flex w-[260px] flex-col gap-3 rounded-lg border border-line-subtle p-4 shadow-soft">
            <Skeleton className="w-2/3" />
            <Skeleton className="w-full" />
            <Skeleton className="w-1/2" />
          </div>
        </div>
      )}

      {/* 规范 §52 error / §40.2 */}
      {isError && (
        <div className="absolute left-1/2 top-1/2 w-[320px] max-w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2">
          <ErrorState className="glass-panel" onRetry={retryAll} />
        </div>
      )}

      {/* 规范 §19 空状态：背景只有中心 YOU 节点 */}
      {isEmpty && (
        <div className="absolute inset-x-0 top-[58%] flex -translate-y-1/2 justify-center px-6">
          <EmptyState
            className="pointer-events-auto w-full max-w-[380px] border-0"
            title="你的宇宙还很安静。"
            description={"添加一个你想记住的人，\n第一颗星就会出现。"}
            action={{
              label: "添加第一个人",
              onClick: () => useUiStore.getState().openCreatePerson(),
            }}
          />
        </div>
      )}

      <PersonDrawer personId={selectedPersonId} />
    </div>
  );
}

export default GalaxyPage;
