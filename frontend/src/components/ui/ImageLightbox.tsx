import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { cn } from "@/lib/cn";
import { useLightboxStore } from "@/stores/lightboxStore";

/**
 * 图片放大浮层。
 *
 * 入口是页面里任意一张缩略图（时间轴 / 回忆 / 解析结果…），
 * 打开后在 AppShell 里渲染一次，点空白或 Esc 关闭，多张图可用左右键翻。
 */
export function ImageLightbox() {
  const images = useLightboxStore((state) => state.images);
  const index = useLightboxStore((state) => state.index);
  const close = useLightboxStore((state) => state.close);
  const step = useLightboxStore((state) => state.step);

  const open = images.length > 0;
  const current = open ? images[index] : null;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [open, close, step]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && current && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="放大查看图片"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-scrim p-4 md:p-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          onClick={close}
        >
          <button
            type="button"
            aria-label="关闭"
            onClick={close}
            className="absolute top-4 right-4 inline-flex size-9 items-center justify-center rounded-full border border-line bg-elevated/80 text-ink-2 transition-colors duration-[140ms] hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                aria-label="上一张"
                onClick={(event) => {
                  event.stopPropagation();
                  step(-1);
                }}
                className="absolute left-3 inline-flex size-10 items-center justify-center rounded-full border border-line bg-elevated/80 text-ink-2 transition-colors duration-[140ms] hover:text-ink"
              >
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="下一张"
                onClick={(event) => {
                  event.stopPropagation();
                  step(1);
                }}
                className="absolute right-3 inline-flex size-10 items-center justify-center rounded-full border border-line bg-elevated/80 text-ink-2 transition-colors duration-[140ms] hover:text-ink"
              >
                <ChevronRight className="size-5" aria-hidden />
              </button>
            </>
          )}

          <motion.figure
            className="flex max-h-full max-w-full flex-col items-center gap-3"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={current}
              alt=""
              className="max-h-[calc(100dvh-140px)] max-w-full rounded-lg border border-line-subtle object-contain shadow-soft"
            />
            {images.length > 1 && (
              <figcaption className={cn("text-sm text-ink-3")}>
                {index + 1} / {images.length}
              </figcaption>
            )}
          </motion.figure>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
