import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/cn";
import { useToastStore, type ToastItem } from "@/stores/toastStore";

/**
 * 规范 §39.6 Toast
 * 位置：top-right desktop / top-center mobile，不显示超过 4 秒。
 */

const TONE_CLASS: Record<ToastItem["tone"], string> = {
  neutral: "border-line text-ink-2",
  success: "border-success/30 text-success",
  danger: "border-danger/30 text-danger",
};

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed top-4 left-1/2 z-[90] flex w-[calc(100vw-32px)] max-w-sm -translate-x-1/2 flex-col gap-2 md:left-auto md:right-6 md:translate-x-0"
    >
      <AnimatePresence initial={false}>
        {toasts.map((item) => (
          <motion.button
            key={item.id}
            type="button"
            onClick={() => dismiss(item.id)}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "pointer-events-auto rounded-md border bg-elevated/95 px-4 py-3 text-left text-body shadow-soft",
              "backdrop-blur-md",
              TONE_CLASS[item.tone],
            )}
          >
            {item.message}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
