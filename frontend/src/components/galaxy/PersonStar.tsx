import { useEffect, useRef, useState } from "react";

import type { GalaxyNode } from "@/features/galaxy/useGalaxyLayout";
import { relativeDayLabel, truncate } from "@/lib/format";

/**
 * 规范 §14.3 人物节点 / §42 Mobile 星图 / §43 键盘与无障碍 / §54.2 新增人物。
 *
 * 星星本体永远是「中心亮点 + 非常轻的 glow」：
 * 头像只出现在 Hover Card 与 Drawer，绝不用头像当星体（§14.3）。
 */

export interface PersonStarProps {
  /** `null` 表示中心“自己”节点（规范 §14.3）。 */
  node: GalaxyNode | null;
  /** 中心节点标签：YOU 或用户昵称。 */
  selfLabel: string;
  /** 中心节点的头像（「我」自己的档案头像）。 */
  selfAvatar?: string | null;
  /** 点中心节点时打开「我」的档案。 */
  onSelfClick?: () => void;
  /** 共享的柔光 radialGradient id，由 GalaxyCanvas 的 <defs> 提供。 */
  glowId: string;
  selected?: boolean;
  hovered?: boolean;
  /** 命中当前搜索（规范 §15）。 */
  matched?: boolean;
  /** 不属于当前星系 / 未命中搜索 —— 渐隐且不可聚焦（规范 §16 / §42）。 */
  dimmed?: boolean;
  showLabel?: boolean;
  /** 规范 §54.2: 新星从 0.7 scale → 1，并有一段 1 秒 glow。 */
  appear?: boolean;
  onSelect?: (personId: string) => void;
  /** 延迟 150ms 后上报节点屏幕坐标（规范 §17）。 */
  onHoverStart?: (personId: string, point: { x: number; y: number }) => void;
  onHoverEnd?: () => void;
}

/** 点击目标 ≥ 36px，即使视觉半径更小（规范 §14.3）。 */
const HIT_RADIUS = 18;
const HOVER_DELAY = 150;

export function PersonStar(props: PersonStarProps) {
  const {
    node,
    selfLabel,
    selfAvatar = null,
    onSelfClick,
    glowId,
    selected = false,
    hovered = false,
    matched = false,
    dimmed = false,
    showLabel = false,
    appear = false,
    onSelect,
    onHoverStart,
    onHoverEnd,
  } = props;

  const hitRef = useRef<SVGCircleElement>(null);
  const timer = useRef<number | null>(null);
  const [focused, setFocused] = useState(false);
  // 规范 §54.2: 星体轻微地从 0.7 scale → 1（新出现的星都会走这一下）。
  const [entered, setEntered] = useState(false);
  // 新增人物在出现时额外有一段 1 秒 glow。
  const [glowing, setGlowing] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!appear) return;
    const frame = requestAnimationFrame(() => setGlowing(true));
    const timeout = window.setTimeout(() => setGlowing(false), 1000);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [appear]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const reportHover = () => {
    const rect = hitRef.current?.getBoundingClientRect();
    const point = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: 0, y: 0 };
    onHoverStart?.(node?.id ?? "", point);
  };

  const startHover = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      reportHover();
    }, HOVER_DELAY);
  };

  const endHover = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    onHoverEnd?.();
  };

  /* ---------------------------- 中心“自己”节点 ---------------------------- */
  if (!node) {
    // 「我」也可以有自己的头像：星图中心就是自己的那颗星。
    // 没有头像时退回原来的光点样式。
    const selfAvatarRadius = 22;
    const selfClipId = "orbit-self-avatar";
    return (
      <g
        role={onSelfClick ? "button" : "img"}
        tabIndex={onSelfClick ? 0 : undefined}
        aria-label={`你自己${selfLabel ? `，${selfLabel}` : ""}${onSelfClick ? "，打开我的档案" : ""}`}
        className={onSelfClick ? "cursor-pointer" : undefined}
        onClick={
          onSelfClick
            ? (event) => {
                event.stopPropagation();
                onSelfClick();
              }
            : undefined
        }
        onKeyDown={
          onSelfClick
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelfClick();
                }
              }
            : undefined
        }
      >
        <circle r={selfAvatarRadius * 1.9} style={{ fill: `url(#${glowId})` }} opacity={0.26} />
        {selfAvatar ? (
          <>
            <defs>
              <clipPath id={selfClipId}>
                <circle r={selfAvatarRadius} />
              </clipPath>
            </defs>
            <circle r={selfAvatarRadius} className="fill-accent-soft" />
            <image
              href={selfAvatar}
              x={-selfAvatarRadius}
              y={-selfAvatarRadius}
              width={selfAvatarRadius * 2}
              height={selfAvatarRadius * 2}
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#${selfClipId})`}
            />
            <circle
              r={selfAvatarRadius}
              fill="none"
              className="stroke-accent-border"
              strokeWidth={1.5}
            />
          </>
        ) : (
          <>
            <circle r={18} className="fill-accent-soft stroke-accent-border" strokeWidth={1} />
            <circle r={3} className="fill-accent" opacity={0.9} />
          </>
        )}
        <text
          y={selfAvatar ? selfAvatarRadius + 18 : 38}
          textAnchor="middle"
          className="fill-ink-2 text-sm"
          strokeWidth={3}
          style={{ paintOrder: "stroke", strokeLinejoin: "round", stroke: "var(--bg-base)" }}
        >
          {selfLabel}
        </text>
      </g>
    );
  }

  /* ------------------------------ 普通人物星 ------------------------------ */
  const { id, person, r, brightness } = node;
  const coreOpacity = 0.32 + brightness * 0.68;
  const glowOpacity = 0.09 + brightness * 0.17 + (glowing ? 0.34 : 0);
  const withLabel = showLabel || hovered || focused || selected;
  const groupNames = person.groups.map((group) => group.name).join("、");
  const recent = person.lastInteractionAt
    ? `最近 ${relativeDayLabel(person.lastInteractionAt)}有记录`
    : "还没有记录";
  const ariaLabel = `${person.name}，${groupNames || "还没有归属星系"}，${recent}`;

  // 有头像的人：星星本体就是那张头像，画得比光点大一点才认得出；
  // 没头像的人保持规范 §14.3 的「中心亮点 + 非常轻 glow」。
  const avatar = person.avatarUrl;
  const avatarRadius = Math.max(r * 1.55, 10.5);
  const clipId = `orbit-avatar-${id}`;

  const activate = () => onSelect?.(id);

  return (
    <g
      role="button"
      tabIndex={dimmed ? -1 : 0}
      aria-label={ariaLabel}
      aria-hidden={dimmed || undefined}
      className="cursor-pointer"
      style={{ opacity: dimmed ? 0.16 : 1, pointerEvents: dimmed ? "none" : "auto" }}
      onClick={(event) => {
        event.stopPropagation();
        activate();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          activate();
        }
      }}
      onMouseEnter={startHover}
      onMouseLeave={endHover}
      onFocus={(event) => {
        event.stopPropagation();
        setFocused(true);
        startHover();
      }}
      onBlur={() => {
        setFocused(false);
        endHover();
      }}
    >
      {/* 规范 §54.2: 新增人物 scale 0.7 → 1；reduced-motion 由全局 CSS 接管。 */}
      <g
        style={{
          transformBox: "fill-box",
          transformOrigin: "center",
          transform: entered ? "scale(1)" : "scale(0.7)",
          opacity: entered ? 1 : 0.5,
          transition: "transform 600ms var(--ease-orbit), opacity 600ms var(--ease-orbit)",
        }}
      >
        <circle
          r={Math.max(r * 3.2, avatarRadius * 1.8)}
          style={{ fill: `url(#${glowId})`, transition: "opacity 1000ms var(--ease-orbit)" }}
          opacity={glowOpacity}
        />

        {avatar ? (
          <>
            <defs>
              <clipPath id={clipId}>
                <circle r={avatarRadius} />
              </clipPath>
            </defs>
            <circle r={avatarRadius + 1} className="fill-base stroke-line-hover" strokeWidth={1} />
            <image
              href={avatar}
              x={-avatarRadius}
              y={-avatarRadius}
              width={avatarRadius * 2}
              height={avatarRadius * 2}
              clipPath={`url(#${clipId})`}
              preserveAspectRatio="xMidYMid slice"
              opacity={dimmed ? 0.3 : 0.68 + brightness * 0.32}
              style={{ transition: "opacity 1000ms var(--ease-orbit)" }}
            />
            <circle
              r={avatarRadius}
              className="fill-none stroke-accent-border"
              strokeWidth={1}
              opacity={0.8}
            />
          </>
        ) : (
          <circle r={r} className="fill-ink" opacity={coreOpacity} />
        )}

        {(selected || focused) && (
          <circle r={avatarRadius + 6} className="fill-none stroke-accent" strokeWidth={1.5} />
        )}
      </g>

      {withLabel && (
        <text
          y={r + 16}
          textAnchor="middle"
          className={selected ? "fill-accent text-sm" : matched ? "fill-ink text-sm" : "fill-ink-2 text-sm"}
          strokeWidth={3}
          style={{ paintOrder: "stroke", strokeLinejoin: "round", stroke: "var(--bg-base)" }}
        >
          {truncate(person.name, 8)}
        </text>
      )}

      {/* 透明命中区：视觉半径 6–11px，点击目标 ≥ 36px（规范 §14.3）。 */}
      <circle ref={hitRef} r={HIT_RADIUS} fill="transparent" />
    </g>
  );
}
