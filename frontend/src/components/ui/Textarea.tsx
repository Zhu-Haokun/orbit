import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * 规范 §28.1 记录页的大文本框使用 min-height 180px；
 * 其余场景保持与 Input 同一套 token。
 */

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  autoGrow?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full resize-none rounded-md border bg-elevated px-3 py-2.5 text-lg text-ink",
        "leading-[26px] placeholder:text-ink-4 transition-colors duration-[140ms]",
        "focus:border-accent-border focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        invalid ? "border-danger/50" : "border-line",
        className,
      )}
      {...rest}
    />
  );
});
