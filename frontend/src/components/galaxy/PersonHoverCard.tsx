import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Avatar } from "@/components/ui/Avatar";
import { relativeDayLabel, truncate } from "@/lib/format";
import type { PersonSummary } from "@/types";

/**
 * 规范 §17 人物 Hover Card
 * 240 × auto / 延迟 150ms（延迟在 PersonStar 里）/ 只展示 2–3 行 /
 * **不放任何操作按钮** / 靠近节点但不出视口。
 */

const CARD_WIDTH = 240;
const CARD_HEIGHT_ESTIMATE = 148;
const GAP = 18;
const EDGE = 8;

export interface PersonHoverCardProps {
  /** null 时收起（AnimatePresence 负责淡出）。 */
  person: PersonSummary | null;
  /** 相对画布容器的坐标。 */
  x: number;
  y: number;
  width: number;
  height: number;
}

export function PersonHoverCard({ person, x, y, width, height }: PersonHoverCardProps) {
  const reducedMotion = useReducedMotion();

  const overflowsRight = x + GAP + CARD_WIDTH > width - EDGE;
  const left = overflowsRight ? Math.max(EDGE, x - GAP - CARD_WIDTH) : x + GAP;
  const top = Math.min(Math.max(EDGE, y - 14), Math.max(EDGE, height - CARD_HEIGHT_ESTIMATE - EDGE));

  const recent = person?.lastInteractionAt ? relativeDayLabel(person.lastInteractionAt) : "";

  return (
    <AnimatePresence>
      {person && (
        <motion.div
          key={person.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
          style={{ left, top, width: CARD_WIDTH }}
          className="glass-panel pointer-events-none absolute z-30 rounded-lg border border-line-subtle p-3 shadow-soft"
        >
          <div className="flex items-center gap-2.5">
            <Avatar name={person.name} src={person.avatarUrl} size="md" />
            <div className="min-w-0">
              <p className="truncate text-body text-ink">{person.name}</p>
              {person.relationshipLabel && (
                <p className="truncate text-sm text-ink-3">{person.relationshipLabel}</p>
              )}
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-1">
            {recent && (
              <p className="text-sm text-ink-2">
                <span className="text-ink-3">最近互动：</span>
                {recent}
              </p>
            )}
            {person.latestUpdate && (
              <p className="text-sm text-ink-2">
                <span className="text-ink-3">最近提到：</span>
                {truncate(person.latestUpdate, 16)}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
