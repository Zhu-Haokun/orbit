import { Check } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * 规范 §23 未完待续使用圆点 checkbox。
 * 点击后：圆点变勾 → 文本 opacity 下降 → 500ms 后折叠（由列表负责）。
 */
export interface RoundCheckProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}

export function RoundCheck({ checked, onChange, label, size = "md", className }: RoundCheckProps) {
  const dimension = size === "sm" ? "size-4" : "size-5";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border transition-all duration-[140ms]",
        dimension,
        checked
          ? "border-accent bg-accent text-on-accent"
          : "border-line bg-transparent text-transparent hover:border-accent-border",
        className,
      )}
    >
      <Check className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={2.5} aria-hidden />
    </button>
  );
}

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/** 方形勾选框，用于解析结果卡片的“勾选保留”与设置页的多选项。 */
export function Checkbox({ checked, onChange, label, hint, disabled }: CheckboxProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-xs border",
          "transition-colors duration-[140ms]",
          checked ? "border-accent bg-accent text-on-accent" : "border-line bg-transparent text-transparent",
        )}
      >
        <Check className="size-3" strokeWidth={3} aria-hidden />
      </button>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body text-ink">{label}</span>
        {hint && <span className="text-sm text-ink-3">{hint}</span>}
      </span>
    </label>
  );
}
