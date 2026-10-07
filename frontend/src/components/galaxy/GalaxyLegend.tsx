import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { useUiStore } from "@/stores/uiStore";

/**
 * 规范 §56 星图图例：右下角一个非常小的 `?`，点开说明星体大小 / 亮度 / 位置，
 * 并明确写出 Orbit 不对关系打分（规范 §5.1 / §71）。
 */

const LINES: Array<{ label: string; text: string }> = [
  { label: "星体大小：", text: "你手动设置的关注层级" },
  { label: "亮度：", text: "最近是否有新的记录" },
  { label: "方向：", text: "所属星系" },
  { label: "距离：", text: "上次联系有多久；核心圈的人一直在最近处" },
];

export function GalaxyLegend() {
  const open = useUiStore((state) => state.galaxyHelpOpen);
  const setGalaxyHelpOpen = useUiStore((state) => state.setGalaxyHelpOpen);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGalaxyHelpOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setGalaxyHelpOpen]);

  return (
    <div className="absolute right-[60px] bottom-4 z-30 flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="星图图例"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="glass-panel w-[252px] rounded-lg border border-line-subtle p-3 shadow-soft"
          >
            <div className="flex flex-col gap-1.5">
              {LINES.map((line) => (
                <p key={line.label} className="text-sm text-ink-2">
                  <span className="text-ink-3">{line.label}</span>
                  {line.text}
                </p>
              ))}
            </div>
            <p className="mt-2 border-t border-line-subtle pt-2 text-sm text-ink-3">
              Orbit 不对关系打分。
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        aria-label="星图图例"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setGalaxyHelpOpen(!open)}
        className="glass-panel inline-flex size-7 items-center justify-center rounded-full border border-line-subtle text-sm text-ink-3 transition-colors duration-[140ms] hover:border-line hover:text-ink"
      >
        ?
      </button>
    </div>
  );
}
