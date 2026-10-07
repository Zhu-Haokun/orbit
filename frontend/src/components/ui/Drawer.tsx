import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * 规范 §18 星图人物 Drawer / §39.5 Drawer
 * Desktop: width 380 / height calc(100vh - 32px) / top 16 / right 16 / radius 20
 * 背景 rgba(14,17,24,.92) + backdrop blur 20
 * Mobile: 变 Bottom Sheet 或 Fullscreen Sheet（规范 §41）。
 *
 * 规范 §18: Drawer 出现时星图不冻结；当前人物节点保持高亮；点击空白关闭。
 * 因此桌面端默认不加遮罩，由容器自己处理“点击空白”。
 */
export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Tablet / Mobile 需要一个遮罩来承接“点击空白关闭”。 */
  scrim?: boolean;
  /** 人物档案使用较宽的抽屉。 */
  width?: number;
  className?: string;
  labelId?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  scrim = false,
  width = 380,
  className,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // 同上：onClose 是不稳定引用，必须放进 ref，否则每次渲染都会重置焦点。
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="pointer-events-none fixed inset-0 z-[60]">
          {scrim && (
            <motion.div
              className="pointer-events-auto absolute inset-0 bg-scrim md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              onClick={onClose}
            />
          )}
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal={scrim ? true : undefined}
            aria-label={title}
            tabIndex={-1}
            style={{ width: `min(${width}px, calc(100vw - 32px))` }}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "pointer-events-auto absolute flex flex-col overflow-hidden border border-line-subtle",
              "glass-drawer shadow-drawer",
              // Mobile: fullscreen sheet
              "inset-x-0 bottom-0 top-0 w-full rounded-none border-x-0",
              // Desktop: floating card
              "md:inset-auto md:top-4 md:right-4 md:bottom-4 md:rounded-xl md:border-x",
              className,
            )}
          >
            <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-2">
              {title ? <h2 className="text-h3 text-ink">{title}</h2> : <span />}
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="inline-flex size-8 items-center justify-center rounded-sm text-ink-3 transition-colors duration-[140ms] hover:bg-hover-fill hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>
            <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 py-3">{children}</div>
            {footer && <footer className="border-t border-line-subtle px-5 py-4 pb-safe">{footer}</footer>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
