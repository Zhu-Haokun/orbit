import { useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * 一个极简的表情选择器（文档 P1：用表情更直接地表达心情）。
 *
 * 参考市面产品的做法：不接入任何表情库，给一排常用表情 + 一个「清除」，
 * 点一下就选中。只存用户选的那个字符，不做解析、不做统计、不猜情绪。
 */

/** 常用心情。刻意保持短，一屏能看完，不用搜索。 */
export const MOOD_PRESETS = [
  "😊",
  "🥰",
  "😌",
  "😄",
  "🤔",
  "😮",
  "🥲",
  "😔",
  "😴",
  "💪",
  "🌿",
  "🌙",
  "☕",
  "🎬",
  "📷",
  "🎂",
] as const;

export interface EmojiPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  /** 触发按钮上没选任何表情时显示的文案。 */
  placeholder?: string;
  className?: string;
}

export function EmojiPicker({ value, onChange, placeholder = "心情", className }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={value ? `心情：${value}` : placeholder}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-md border border-line-subtle bg-surface px-3 text-body transition-colors duration-[140ms] hover:border-line",
          value ? "text-ink" : "text-ink-3",
        )}
      >
        {value ? <span className="text-base leading-none">{value}</span> : <Smile className="size-4" aria-hidden />}
        <span className="text-sm">{value ? "心情" : placeholder}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="选择心情"
          className="absolute bottom-[calc(100%+8px)] left-0 z-40 grid w-[232px] grid-cols-8 gap-1 rounded-md border border-line-subtle bg-elevated p-2 shadow-soft"
        >
          {MOOD_PRESETS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`选择 ${emoji}`}
              onClick={() => {
                onChange(emoji);
                setOpen(false);
              }}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-sm text-base leading-none transition-colors duration-[140ms] hover:bg-hover-fill",
                value === emoji && "bg-accent-soft",
              )}
            >
              {emoji}
            </button>
          ))}
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="col-span-8 mt-1 h-7 rounded-sm text-sm text-ink-3 transition-colors duration-[140ms] hover:bg-hover-fill hover:text-ink"
            >
              清除
            </button>
          )}
        </div>
      )}
    </div>
  );
}
