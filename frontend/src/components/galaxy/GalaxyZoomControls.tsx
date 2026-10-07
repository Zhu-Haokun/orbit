import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";

import { Tooltip } from "@/components/ui/Tooltip";

/**
 * 星图的视图层：平移 / 滚轮缩放 / 双指缩放的手势与数学，
 * 以及右下角那组缩放入口（规范 §14.2 / §42 / §43）。
 *
 * 手势和按钮共用同一套 zoomGalaxyView，避免两处数学漂移。
 * 这里只有离散的缩放与拖拽，没有自动持续缩放（规范 §11）。
 */

export interface GalaxyView {
  scale: number;
  x: number;
  y: number;
}

export const GALAXY_MIN_SCALE = 0.6;
export const GALAXY_MAX_SCALE = 2.5;

export function clampGalaxyScale(scale: number): number {
  return Math.min(Math.max(scale, GALAXY_MIN_SCALE), GALAXY_MAX_SCALE);
}

/** 以画布内某个点为锚点缩放。 */
export function zoomGalaxyView(
  view: GalaxyView,
  factor: number,
  anchor: { x: number; y: number },
): GalaxyView {
  const scale = clampGalaxyScale(view.scale * factor);
  const ratio = view.scale === 0 ? 1 : scale / view.scale;
  return {
    scale,
    x: anchor.x - ratio * (anchor.x - view.x),
    y: anchor.y - ratio * (anchor.y - view.y),
  };
}

type Gesture =
  | { kind: "pan"; startX: number; startY: number; view: GalaxyView }
  | { kind: "pinch"; distance: number; midX: number; midY: number; view: GalaxyView };

export interface GalaxyViewportOptions {
  view: GalaxyView;
  onViewChange: (view: GalaxyView) => void;
  /** 空白处点击（规范 §18: 关闭 Drawer）。拖拽之后不会触发。 */
  onBackgroundClick?: () => void;
}

export interface GalaxyViewport {
  svgRef: RefObject<SVGSVGElement | null>;
  panning: boolean;
  /** 正在拖拽或滚轮缩放 —— 此时关掉 600ms 过渡，避免手感发飘。 */
  interacting: boolean;
  handlePointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  handlePointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  handlePointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void;
  handleBackgroundClick: () => void;
}

export function useGalaxyViewport(options: GalaxyViewportOptions): GalaxyViewport {
  const { view, onViewChange, onBackgroundClick } = options;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const movedDistance = useRef(0);
  const idleTimer = useRef<number | null>(null);
  const latest = useRef({ view, onViewChange, onBackgroundClick });
  /**
   * 已经捕获的指针。
   *
   * 关键：不能在 pointerdown 就 setPointerCapture —— 一旦捕获，浏览器会把随后的
   * click 事件重定向到捕获元素（也就是这个 SVG），星星自己的 onClick 就永远收不到，
   * 点人物打不开档案。所以只把「确认是拖动」和「双指缩放」的指针捕获住。
   */
  const captured = useRef(new Set<number>());

  const capturePointer = (element: SVGSVGElement, pointerId: number) => {
    if (captured.current.has(pointerId)) return;
    try {
      element.setPointerCapture(pointerId);
      captured.current.add(pointerId);
    } catch {
      /* 少数浏览器在指针已释放时会抛错，忽略即可。 */
    }
  };

  const releasePointer = (element: SVGSVGElement, pointerId: number) => {
    if (!captured.current.has(pointerId)) return;
    try {
      element.releasePointerCapture(pointerId);
    } catch {
      /* 已经释放过了 */
    }
    captured.current.delete(pointerId);
  };

  const [panning, setPanning] = useState(false);
  const [interacting, setInteracting] = useState(false);

  useEffect(() => {
    latest.current = { view, onViewChange, onBackgroundClick };
  });

  const markInteracting = useCallback(() => {
    setInteracting(true);
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      idleTimer.current = null;
      setInteracting(false);
    }, 160);
  }, []);

  useEffect(
    () => () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    },
    [],
  );

  // React 的 onWheel 在根节点上是 passive 的，无法 preventDefault，所以自己挂原生监听。
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const current = latest.current;
      current.onViewChange(zoomGalaxyView(current.view, Math.exp(-event.deltaY * 0.0015), anchor));
      markInteracting();
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [markInteracting]);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    movedDistance.current = 0;
    markInteracting();
    setPanning(true);
    const current = latest.current.view;

    if (pointers.current.size === 1) {
      gesture.current = { kind: "pan", startX: point.x, startY: point.y, view: current };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        kind: "pinch",
        distance: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1),
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        view: current,
      };
      // 双指缩放需要捕获：手指滑出画布也要继续跟手。
      capturePointer(event.currentTarget, event.pointerId);
    }
    // 单指按下先不捕获 —— 等确认是拖动再说，见 captured 的注释。
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    const current = gesture.current;
    if (!current) return;
    const rect = event.currentTarget.getBoundingClientRect();

    if (current.kind === "pan" && pointers.current.size === 1) {
      const dx = point.x - current.startX;
      const dy = point.y - current.startY;
      movedDistance.current = Math.max(movedDistance.current, Math.hypot(dx, dy));
      if (movedDistance.current <= 2) return;
      // 到这里才算真的在拖动，此时捕获指针才不会影响点击人物。
      capturePointer(event.currentTarget, event.pointerId);
      latest.current.onViewChange({
        scale: current.view.scale,
        x: current.view.x + dx,
        y: current.view.y + dy,
      });
      return;
    }

    if (current.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const scale = clampGalaxyScale(current.view.scale * (distance / current.distance));
      const worldX = (current.midX - rect.left - current.view.x) / current.view.scale;
      const worldY = (current.midY - rect.top - current.view.y) / current.view.scale;
      latest.current.onViewChange({
        scale,
        x: midX - rect.left - worldX * scale,
        y: midY - rect.top - worldY * scale,
      });
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    releasePointer(event.currentTarget, event.pointerId);
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      setPanning(false);
      markInteracting();
      return;
    }
    const remaining = [...pointers.current.values()][0];
    gesture.current = {
      kind: "pan",
      startX: remaining.x,
      startY: remaining.y,
      view: latest.current.view,
    };
  };

  const handleBackgroundClick = useCallback(() => {
    if (movedDistance.current > 4) return;
    latest.current.onBackgroundClick?.();
  }, []);

  return {
    svgRef,
    panning,
    interacting,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleBackgroundClick,
  };
}

/* ------------------------------------------------------------------ *
 * 右下角缩放入口。所有按钮都是 icon button，必须有 aria-label（规范 §43）。
 * ------------------------------------------------------------------ */

export interface GalaxyZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  /** 与缩放入口同组的其他操作（例如「添加人物」）。 */
  actions?: ReactNode;
}

function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-full text-ink-2 transition-colors duration-[140ms] hover:bg-hover-fill hover:text-ink"
    >
      {children}
    </button>
  );
}

export function GalaxyZoomControls({
  onZoomIn,
  onZoomOut,
  onReset,
  actions,
}: GalaxyZoomControlsProps) {
  return (
    <div className="absolute right-4 bottom-4 z-30 flex flex-col items-end gap-3">
      {actions}
      <div className="glass-panel flex flex-col gap-1 rounded-pill border border-line-subtle p-1">
        <Tooltip content="放大">
          <ZoomButton label="放大" onClick={onZoomIn}>
            <Plus className="size-4" aria-hidden />
          </ZoomButton>
        </Tooltip>
        <Tooltip content="缩小">
          <ZoomButton label="缩小" onClick={onZoomOut}>
            <Minus className="size-4" aria-hidden />
          </ZoomButton>
        </Tooltip>
        <Tooltip content="回到初始视角">
          <ZoomButton label="回到初始视角" onClick={onReset}>
            <RotateCcw className="size-4" aria-hidden />
          </ZoomButton>
        </Tooltip>
      </div>
    </div>
  );
}
