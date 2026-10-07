import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useSessionStore } from "@/stores/sessionStore";
import { useUiStore } from "@/stores/uiStore";

/**
 * 规范 §13 顶部栏（非星图内容页使用）
 * Desktop: height 72 / padding 0 32
 * 左：页面标题 + 可选描述；右：全局搜索快捷按钮 + 用户头像
 * 星图页顶部不需要厚重 Topbar，采用浮动工具条（§14.1）。
 */

/** 文档 P2-2: Windows 用户看到的应该是 Ctrl+K，而不是 Mac 的 ⌘K。 */
const SHORTCUT_LABEL =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
    ? "⌘K"
    : "Ctrl K";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  const user = useSessionStore((state) => state.user);
  const setSearchOpen = useUiStore((state) => state.setSearchOpen);

  return (
    <header
      className={cn(
        "flex min-h-[72px] items-center justify-between gap-4 px-4 py-4 md:px-8 md:py-0",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="truncate text-h2 text-ink md:text-h1">{title}</h1>
        {description && <p className="truncate text-sm text-ink-3">{description}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <Button
          variant="ghost"
          size="md"
          className="md:hidden"
          aria-label="搜索"
          icon={<Search className="size-[18px]" aria-hidden />}
          onClick={() => setSearchOpen(true)}
        />
        <Button
          variant="secondary"
          size="sm"
          className="hidden min-w-[200px] justify-start text-ink-3 md:inline-flex"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">搜索一个人、一件事、一段回忆…</span>
          <kbd className="rounded-xs border border-line px-1.5 text-micro text-ink-4">
            {SHORTCUT_LABEL}
          </kbd>
        </Button>
        <Avatar name={user?.nickname ?? "我"} src={user?.avatarUrl} size="sm" className="hidden md:inline-flex" />
      </div>
    </header>
  );
}
