import { NavLink } from "react-router-dom";
import { Clock3, Orbit, Plus, Sun, User } from "lucide-react";

import { useToday } from "@/hooks/useInsights";
import { cn } from "@/lib/cn";

/**
 * 规范 §84 Mobile Bottom Navigation
 * 顺序固定：星图 / 今天 / 记录 / 回忆 / 我的
 * height 68 / safe-area aware；“记录”可以略突出，但不要变成巨大悬浮按钮。
 */
const ITEMS = [
  { to: "/galaxy", label: "星图", icon: Orbit },
  { to: "/today", label: "今天", icon: Sun },
  { to: "/record", label: "记录", icon: Plus, emphasis: true },
  { to: "/memories", label: "回忆", icon: Clock3 },
  { to: "/settings", label: "我的", icon: User },
] as const;

export function MobileTabBar() {
  const { data: today } = useToday();
  const attention = today?.headlineCount ?? 0;

  return (
    <nav
      aria-label="底部导航"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line-subtle bg-surface/95 backdrop-blur-md md:hidden"
      style={{ height: "calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px))" }}
    >
      <ul className="flex h-[var(--tabbar-h)] items-stretch">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "relative flex h-full flex-col items-center justify-center gap-1 text-micro",
                    "transition-colors duration-[140ms]",
                    isActive ? "text-accent" : "text-ink-3",
                  )
                }
              >
                <Icon
                  className={cn("size-5", "emphasis" in item && item.emphasis && "size-[22px]")}
                  aria-hidden
                />
                <span>{item.label}</span>
                {item.to === "/today" && attention > 0 && (
                  <span
                    aria-label={`今天有 ${attention} 件待关注的事情`}
                    className="absolute top-2.5 ml-4 size-1.5 rounded-full bg-accent"
                  />
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
