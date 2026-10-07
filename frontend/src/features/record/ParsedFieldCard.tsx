import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";

import { Checkbox } from "@/components/ui/Checkbox";
import { cn } from "@/lib/cn";

/**
 * 规范 §30 解析结果页：结构化结果严格分卡，每一项都有 勾选 / 编辑 / 删除。
 */

export interface ParsedFieldCardProps {
  title: string;
  hint?: string;
  empty?: string;
  children?: ReactNode;
  className?: string;
}

export function ParsedFieldCard({ title, hint, empty, children, className }: ParsedFieldCardProps) {
  const isEmpty = !children;
  return (
    <section className={cn("rounded-lg border border-line-subtle bg-surface p-4", className)}>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-body font-medium text-ink">{title}</h3>
        {hint && <span className="text-micro text-ink-4">{hint}</span>}
      </header>
      {isEmpty ? <p className="text-sm text-ink-4">{empty ?? "这一段里没有识别到内容。"}</p> : children}
    </section>
  );
}

export interface ParsedRowProps {
  keep: boolean;
  onKeepChange: (keep: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
  onRemove: () => void;
  label: string;
  meta?: string;
  /** 人物卡片没有勾选框，只有一个单选结果。 */
  hideCheckbox?: boolean;
}

/** 可勾选、可编辑、可删除的一行解析结果。 */
export function ParsedRow({
  keep,
  onKeepChange,
  value,
  onValueChange,
  onRemove,
  label,
  meta,
  hideCheckbox,
}: ParsedRowProps) {
  return (
    <div className="group flex items-start gap-3 py-1.5">
      {!hideCheckbox && (
        <span className="pt-0.5">
          <Checkbox checked={keep} onChange={onKeepChange} label={`保留：${label}`} />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <input
          aria-label={label}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className={cn(
            "w-full rounded-xs border border-transparent bg-transparent px-1 py-0.5 text-body",
            "transition-colors duration-[140ms] hover:border-line-subtle focus:border-accent-border focus:outline-none",
            !keep && !hideCheckbox && "text-ink-4 line-through",
          )}
        />
        {meta && <span className="px-1 text-micro text-ink-4">{meta}</span>}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`删除：${label}`}
        className="mt-0.5 inline-flex size-7 items-center justify-center rounded-sm text-ink-4 opacity-0 transition-opacity duration-[140ms] group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger"
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
