import { Button } from "./Button";

/**
 * 规范 §40.2 Error
 * 显示“暂时没能加载这些记录。”+ [重试]；技术错误放 console，不直接展示给普通用户。
 */
export interface ErrorStateProps {
  title?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export function ErrorState({
  title = "暂时没能加载这些记录。",
  onRetry,
  className,
  compact,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-line-subtle text-center " +
        (compact ? "px-6 py-8 " : "px-6 py-12 ") +
        (className ?? "")
      }
    >
      <p className="text-body text-ink-2">{title}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          重试
        </Button>
      )}
    </div>
  );
}
