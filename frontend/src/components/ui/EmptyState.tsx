import type { ReactNode } from "react";

import { Button } from "./Button";

/**
 * 规范 §19 / §40 / §94: 空状态保持安静，不煽情、不命令。
 */
export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  icon?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ title, description, action, icon, className, compact }: EmptyStateProps) {
  return (
    <div
      className={
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line-subtle text-center " +
        (compact ? "px-6 py-8 " : "px-6 py-12 ") +
        (className ?? "")
      }
    >
      {icon && <span className="flex text-ink-3">{icon}</span>}
      <p className="text-body text-ink-2">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-3 whitespace-pre-line">{description}</p>}
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick} className="mt-1">
          {action.label}
        </Button>
      )}
    </div>
  );
}
