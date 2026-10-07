import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * 规范 §39.4 Modal
 * Desktop max width 560 / Overlay rgba(0,0,0,.56) / 支持 Esc 关闭（危险操作除外）
 * 规范 §41 / §20: Mobile 变 full-screen sheet。
 */
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** `sm` 用于二次确认，`lg` 用于新建人物（规范 §20: 520px）。 */
  size?: "sm" | "md" | "lg";
  /** 危险操作时设为 false —— Esc 与点击遮罩都不关闭。 */
  dismissible?: boolean;
  /** 危险操作时去掉右上角关闭按钮。 */
  showClose?: boolean;
}

const SIZES: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "md:max-w-[420px]",
  md: "md:max-w-[520px]",
  lg: "md:max-w-[560px]",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
  showClose = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // onClose 每次渲染都是新函数，用 ref 持有它，避免副作用被反复重跑（会抢走输入焦点）。
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissible) {
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, dismissible]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center md:items-center">
          <motion.div
            className="absolute inset-0 bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={dismissible ? onClose : undefined}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={{ opacity: 0, y: 16, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "relative flex w-full flex-col overflow-hidden border border-line-subtle bg-surface shadow-soft",
              "max-h-[calc(100dvh-0px)] rounded-t-xl",
              "md:max-h-[calc(100dvh-64px)] md:min-w-[420px] md:rounded-xl",
              SIZES[size],
            )}
          >
            {(title || showClose) && (
              <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
                <div className="flex min-w-0 flex-col gap-1">
                  {title && <h2 className="text-h3 text-ink">{title}</h2>}
                  {description && <p className="text-sm text-ink-3">{description}</p>}
                </div>
                {showClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="关闭"
                    className="-mt-1 -mr-1 inline-flex size-8 items-center justify-center rounded-sm text-ink-3 transition-colors duration-[140ms] hover:bg-hover-fill hover:text-ink"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </header>
            )}
            <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
            {footer && (
              <footer className="flex items-center justify-end gap-3 border-t border-line-subtle px-6 py-4 pb-safe">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
