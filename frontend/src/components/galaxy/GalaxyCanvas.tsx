import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";

import { PersonHoverCard } from "@/components/galaxy/PersonHoverCard";
import { PersonStar } from "@/components/galaxy/PersonStar";
import {
  clampGalaxyScale,
  useGalaxyViewport,
  type GalaxyView,
} from "@/components/galaxy/GalaxyZoomControls";
import {
  SELF_NODE_ID,
  buildGalaxyClouds,
  galaxyBackgroundDots,
  selectGalaxyLabelIds,
  type GalaxyBounds,
  type GalaxyLink,
  type GalaxyNode,
} from "@/features/galaxy/useGalaxyLayout";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useMe } from "@/hooks/useMe";import { cn } from "@/lib/cn";
import { useSessionStore } from "@/stores/sessionStore";
import { useUiStore } from "@/stores/uiStore";
import type { Group } from "@/types";

/**
 * 规范 §14.2 背景与柔光 / §14.4 云层 / §14.5 连线 / §16 筛选 / §18 点击空白 /
 * §42 Mobile / §61 标签降级。
 *
 * 分工：d3 只算坐标，React 出 SVG，手势与缩放数学在 GalaxyZoomControls。
 * 没有真实天文照片、没有粒子、没有持续动画 —— 只有静态星点、极淡云层，
 * 以及一次 500–800ms 的位置过渡（--dur-galaxy）。
 */

import type { SharedEventLink } from "@/services/galaxy";

export interface GalaxyCanvasProps {
  nodes: GalaxyNode[];
  links: GalaxyLink[];
  /** 一起出现过的人对；星图只画这些"朋友之间"的线。 */
  sharedLinks: SharedEventLink[];
  groups: Group[];
  bounds: GalaxyBounds;
  width: number;
  height: number;
  view: GalaxyView;
  onViewChange: (view: GalaxyView) => void;
  /** 命中当前搜索的节点；null 表示没有在搜索（规范 §15）。 */
  matchedIds: ReadonlySet<string> | null;
  /** 规范 §15: Enter 聚焦第一项。token 变化代表一次新的聚焦请求。 */
  focus: { personId: string; token: number } | null;
}

/** 背景星空走多快：0 = 完全不动，1 = 和内容一样快。0.35 有"深远"的层次感。 */
const STAR_PARALLAX = 0.35;

/**
 * 规范 §14.2: 确定性、不可交互的背景星点，带呼吸（§11 慢一点、轻一点）。
 *
 * 背景放在屏幕坐标系里，但跟着画布做**视差**平移（比内容慢），拖动时才有纵深感。
 * 平移没有边界，所以把一块星点平铺 2×2 再对偏移取模：
 * 无论往哪个方向拖多远，视口永远被盖满，边缘不会露白。
 */
function BackgroundDots({
  width,
  height,
  offsetX,
  offsetY,
  transitionClass,
}: {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  transitionClass: string;
}) {
  const dots = useMemo(() => galaxyBackgroundDots(width, height), [width, height]);
  if (width <= 0 || height <= 0) return null;

  // 取模后落进 (-size, 0]，四块拼起来必然覆盖 [0, size]。
  const wrap = (value: number, size: number) => (((value % size) + size) % size) - size;
  const tx = wrap(offsetX, width);
  const ty = wrap(offsetY, height);
  const tiles: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ];

  return (
    <g
      className={cn("orbit-starfield pointer-events-none", transitionClass)}
      aria-hidden
      style={{ transform: `translate(${tx}px, ${ty}px)`, transformOrigin: "0 0" }}
    >
      {tiles.map(([dx, dy]) => (
        <g key={`${dx}-${dy}`} transform={`translate(${dx}, ${dy})`}>
          {dots.map((dot) => (
            <g
              key={dot.key}
              className="orbit-star"
              style={
                {
                  // 周期走自定义属性：这样 prefers-reduced-motion 的豁免规则还能用
                  // !important 把它还原回来（内联的 animation-duration 会被压掉）。
                  "--star-floor": dot.floor,
                  "--star-ceil": dot.ceil,
                  "--star-duration": `${dot.duration}s`,
                  animationDelay: `${dot.delay}s`,
                } as CSSProperties
              }
            >
              {dot.bloom && (
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r={dot.r * 3.6}
                  className={dot.accent ? "fill-accent" : "fill-ink"}
                  opacity={0.14}
                />
              )}
              <circle
                cx={dot.x}
                cy={dot.y}
                r={dot.r}
                className={dot.accent ? "fill-accent" : "fill-ink"}
              />
            </g>
          ))}
        </g>
      ))}
    </g>
  );
}

export function GalaxyCanvas(props: GalaxyCanvasProps) {
  const { nodes, links, sharedLinks, groups, bounds, width, height, view, onViewChange, matchedIds, focus } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  const fitted = useRef(false);

  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set<string>());

  const selectedPersonId = useUiStore((state) => state.selectedPersonId);
  const hoveredPersonId = useUiStore((state) => state.hoveredPersonId);
  const setHoveredPersonId = useUiStore((state) => state.setHoveredPersonId);
  const openPerson = useUiStore((state) => state.openPerson);
  const closePerson = useUiStore((state) => state.closePerson);
  const groupId = useUiStore((state) => state.galaxyGroupId);
  const nickname = useSessionStore((state) => state.user?.nickname ?? "YOU");
  const isMobile = useIsMobile();
  // 「我」自己的档案：中心节点的头像与点击入口都来自它。
  const me = useMe().data;
  const navigate = useNavigate();
  const selfAvatar = me?.avatarUrl ?? null;
  const selfPersonId = me?.id ?? null;

  const viewport = useGalaxyViewport({ view, onViewChange, onBackgroundClick: closePerson });
  const { svgRef, panning, interacting } = viewport;

  const centerX = width / 2;
  const centerY = height / 2;

  /** 实际要画的线：中心连线 + 真实共同经历。布局算出来的星系链不画。 */
  const drawnLinks = useMemo(() => {
    const nodeIds = new Set(nodes.map((node) => node.id));
    return [
      ...links.filter((link) => link.kind === "center"),
      ...sharedLinks
        .filter((link) => nodeIds.has(link.source) && nodeIds.has(link.target))
        .map((link, index) => ({
          id: `share:${index}:${link.source}-${link.target}`,
          source: link.source,
          target: link.target,
          kind: "group" as const,
        })),
    ];
  }, [links, nodes, sharedLinks]);

  const glowId = "orbit-star-glow";
  const cloudId = "orbit-galaxy-cloud";

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // 首次拿到尺寸时，如果星图比视口大就整体收进视野（只做一次，不是持续缩放）。
  useEffect(() => {
    if (fitted.current) return;
    if (width <= 0 || height <= 0 || nodes.length === 0) return;
    fitted.current = true;
    const contentWidth = bounds.maxX - bounds.minX + 120;
    const contentHeight = bounds.maxY - bounds.minY + 120;
    if (contentWidth <= width && contentHeight <= height) return;
    const nextScale = clampGalaxyScale(Math.min(width / contentWidth, height / contentHeight));
    if (nextScale >= 1) return;
    const midX = (bounds.minX + bounds.maxX) / 2;
    const midY = (bounds.minY + bounds.maxY) / 2;
    onViewChange({ scale: nextScale, x: width / 2 - midX * nextScale, y: height / 2 - midY * nextScale });
  }, [width, height, nodes.length, bounds, onViewChange]);

  // 规范 §15: Enter 聚焦第一项 —— 把该节点移到视野中心。
  useEffect(() => {
    if (!focus) return;
    const node = nodes.find((item) => item.id === focus.personId);
    if (!node || width <= 0 || height <= 0) return;
    const scale = Math.max(viewRef.current.scale, 1.15);
    onViewChange({ scale, x: width / 2 - node.x * scale, y: height / 2 - node.y * scale });
  }, [focus, nodes, width, height, onViewChange]);

  /* -------------------------------- 派生数据 -------------------------------- */

  const nodePosition = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const node of nodes) map.set(node.id, { x: node.x, y: node.y });
    return map;
  }, [nodes]);

  const clouds = useMemo(() => buildGalaxyClouds(nodes, groups), [nodes, groups]);

  const memberIds = useMemo(() => {
    const set = new Set<string>();
    if (!groupId) return set;
    for (const node of nodes) {
      if (node.person.groups.some((group) => group.id === groupId)) set.add(node.id);
    }
    return set;
  }, [nodes, groupId]);

  /*
   * 选中一个人之后，只留下三条关系：中心 → 这个人 → 同一个星系的人。
   * 其余全部压暗（文档 §Obsidian：关系要可解释，且限制在少数几条，
   * 不扩大连线数量、不做全连接网络图）。
   */
  const relatedIds = useMemo(() => {
    if (!selectedPersonId) return null;
    const selected = nodes.find((node) => node.id === selectedPersonId);
    if (!selected) return null;
    const set = new Set<string>([selectedPersonId]);
    for (const group of selected.person.groups) {
      for (const node of nodes) {
        if (node.person.groups.some((item) => item.id === group.id)) set.add(node.id);
      }
    }
    return set;
  }, [nodes, selectedPersonId]);

  // 规范 §16: 不属于当前星系的人渐隐；§15: 未命中搜索的人也渐隐。
  const isDimmed = useCallback(
    (id: string) =>
      (groupId !== null && !memberIds.has(id)) ||
      (matchedIds !== null && !matchedIds.has(id)) ||
      (relatedIds !== null && !relatedIds.has(id)),
    [groupId, memberIds, matchedIds, relatedIds],
  );

  const labelIds = useMemo(
    () =>
      selectGalaxyLabelIds({
        nodes,
        selectedPersonId,
        hoveredPersonId,
        matchedIds,
        compact: isMobile,
        scale: view.scale,
      }),
    [nodes, selectedPersonId, hoveredPersonId, matchedIds, isMobile, view.scale],
  );

  // 规范 §54.2: 记录“刚刚出现”的星，只有它们额外播一段 1 秒 glow。
  const knownIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(nodes.map((node) => node.id));
    const previous = knownIds.current;
    knownIds.current = ids;
    if (!previous) return;
    const fresh = [...ids].filter((id) => !previous.has(id));
    if (fresh.length === 0) return;
    setFreshIds(new Set(fresh));
    const timer = window.setTimeout(() => setFreshIds(new Set()), 1200);
    return () => window.clearTimeout(timer);
  }, [nodes]);

  /* --------------------------------- 交互 --------------------------------- */

  const handleSelect = useCallback(
    (personId: string) => {
      openPerson(personId);
    },
    [openPerson],
  );

  const handleHoverStart = useCallback(
    (personId: string, point: { x: number; y: number }) => {
      const rect = containerRef.current?.getBoundingClientRect();
      setHoveredPersonId(personId);
      setHoverPoint(rect ? { x: point.x - rect.left, y: point.y - rect.top } : point);
    },
    [setHoveredPersonId],
  );

  const handleHoverEnd = useCallback(() => {
    setHoveredPersonId(null);
    setHoverPoint(null);
  }, [setHoveredPersonId]);

  const hoveredPerson = useMemo(() => {
    if (!hoveredPersonId) return null;
    return nodes.find((node) => node.id === hoveredPersonId)?.person ?? null;
  }, [hoveredPersonId, nodes]);

  const pointOf = (id: string) => {
    if (id === SELF_NODE_ID) return { x: centerX, y: centerY };
    return nodePosition.get(id) ?? null;
  };

  // 规范 §11 / §16: 星系切换与聚焦用 600ms（--dur-galaxy）过渡；拖拽时立刻跟手。
  const transitionClass = cn(
    "transition-transform duration-[600ms] ease-orbit",
    interacting && "transition-none",
  );

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-base">
      {/* 规范 §14.2: 非常轻的径向柔光 */}
      <div aria-hidden className="galaxy-glow pointer-events-none absolute inset-0" />

      <svg
        ref={svgRef}
        role="application"
        aria-label="人情星图：你自己在中心，认识的人在周围的星系里。"
        width="100%"
        height="100%"
        className="relative block touch-none select-none"
        onPointerDown={viewport.handlePointerDown}
        onPointerMove={viewport.handlePointerMove}
        onPointerUp={viewport.handlePointerUp}
        onPointerCancel={viewport.handlePointerUp}
      >
        <defs>
          <radialGradient id={glowId}>
            <stop offset="0%" style={{ stopColor: "var(--accent)", stopOpacity: 0.85 }} />
            <stop offset="55%" style={{ stopColor: "var(--accent)", stopOpacity: 0.22 }} />
            <stop offset="100%" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
          </radialGradient>
          <radialGradient id={cloudId}>
            <stop offset="0%" style={{ stopColor: "var(--accent)", stopOpacity: 0.08 }} />
            <stop offset="70%" style={{ stopColor: "var(--accent)", stopOpacity: 0.035 }} />
            <stop offset="100%" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
          </radialGradient>
        </defs>

        {/* 规范 §18: 点击空白关闭 Drawer */}
        <rect
          x={0}
          y={0}
          width="100%"
          height="100%"
          fill="transparent"
          className={panning ? "cursor-grabbing" : "cursor-grab"}
          onClick={viewport.handleBackgroundClick}
        />

        <BackgroundDots
          width={width}
          height={height}
          offsetX={view.x * STAR_PARALLAX}
          offsetY={view.y * STAR_PARALLAX}
          transitionClass={transitionClass}
        />

        <g
          className={transitionClass}
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: "0 0",
          }}
        >
          {/*
            规范 §14.4: 极淡云层表达星系聚类。
            这里不再画星系名字 —— 点开人物就能看到身份，常驻标签只会让画面变吵。
          */}
          <g className="pointer-events-none" aria-hidden>
            {clouds.map((cloud) => (
              <g key={cloud.id} opacity={groupId && groupId !== cloud.id ? 0.45 : 1}>
                <circle cx={cloud.x} cy={cloud.y} r={cloud.r} style={{ fill: `url(#${cloudId})` }} />
              </g>
            ))}
          </g>

          {/*
            连线只画两种：
            1. 中心 → 每个人（"我在意的人"）；
            2. 一起出现过的人之间 —— 数据来自同一次多人记录共享的 eventId。
            刻意不画"同星系就串成链"：被分到同一组不等于一起做过什么，
            那种线会让星图看起来像关系网，而它其实什么都不代表。
          */}
          <g className="pointer-events-none" aria-hidden>
            {drawnLinks.map((link) => {
              const from = pointOf(link.source);
              const to = pointOf(link.target);
              if (!from || !to) return null;
              const touchesSelected =
                selectedPersonId !== null &&
                (link.source === selectedPersonId || link.target === selectedPersonId);
              const dim =
                link.kind === "center"
                  ? isDimmed(link.target)
                    ? 0.3
                    : 1
                  : isDimmed(link.source) && isDimmed(link.target)
                    ? 0.3
                    : 1;
              return (
                <line
                  key={link.id}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  strokeWidth={1}
                  strokeOpacity={dim < 1 ? dim : undefined}
                  style={{
                    stroke: touchesSelected ? "var(--line-galaxy-active)" : "var(--line-galaxy)",
                  }}
                />
              );
            })}
          </g>

          {nodes.map((node) => (
            <g
              key={node.id}
              className={transitionClass}
              style={{ transform: `translate(${node.x}px, ${node.y}px)`, transformOrigin: "0 0" }}
            >
              <PersonStar
                node={node}
                selfLabel={nickname}
                glowId={glowId}
                selected={node.id === selectedPersonId}
                hovered={node.id === hoveredPersonId}
                matched={matchedIds?.has(node.id) ?? false}
                dimmed={isDimmed(node.id)}
                showLabel={labelIds.has(node.id)}
                appear={freshIds.has(node.id)}
                onSelect={handleSelect}
                onHoverStart={handleHoverStart}
                onHoverEnd={handleHoverEnd}
              />
            </g>
          ))}

          {/* 中心 YOU 节点固定在画布中心（规范 §14.6） */}
          <g style={{ transform: `translate(${centerX}px, ${centerY}px)`, transformOrigin: "0 0" }}>
            <PersonStar
              node={null}
              selfLabel={nickname}
              selfAvatar={selfAvatar}
              onSelfClick={selfPersonId ? () => navigate(`/people/${selfPersonId}`) : undefined}
              glowId={glowId}
            />
          </g>
        </g>
      </svg>

      <PersonHoverCard
        person={interacting ? null : hoveredPerson}
        x={hoverPoint?.x ?? 0}
        y={hoverPoint?.y ?? 0}
        width={width}
        height={height}
      />
    </div>
  );
}
