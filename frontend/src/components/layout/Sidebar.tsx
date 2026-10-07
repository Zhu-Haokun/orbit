import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Clock3, Orbit, Plus, Search, Settings, Sun } from "lucide-react";

import { OrbitLogo } from "@/components/layout/OrbitLogo";
import { Avatar } from "@/components/ui/Avatar";
import { Tooltip } from "@/components/ui/Tooltip";
import { useIsTablet } from "@/hooks/useMediaQuery";
import { useToday } from "@/hooks/useInsights";
import { cn } from "@/lib/cn";
import { useSessionStore } from "@/stores/sessionStore";
import { useUiStore } from "@/stores/uiStore";

/**
 * 规范 §12 Sidebar
 * Desktop 232px / bg-surface / 右边框 border-subtle
 * 规范 §9.2 Tablet 折叠为 72px，仅显示图标，Hover 或点击可展开临时浮层。
 * 规范 §9.3 Mobile 取消左侧导航。
 */

const NAV_ITEMS = [
  { to: "/galaxy", label: "星图", icon: Orbit },
  { to: "/today", label: "今天", icon: Sun },
  { to: "/record", label: "记录", icon: Plus },
  { to: "/memories", label: "回忆", icon: Clock3 },
  { to: "/search", label: "搜索", icon: Search },
] as const;

export function Sidebar() {
  const isTablet = useIsTablet();
  const [hovered, setHovered] = useState(false);
  const sidebarExpanded = useUiStore((state) => state.sidebarExpanded);
  const setSidebarExpanded = useUiStore((state) => state.setSidebarExpanded);
  const user = useSessionStore((state) => state.user);
  const navigate = useNavigate();

  const { data: today } = useToday();
  // 规范 §55: 只展示今天确实有待关注内容，最大 9+
  const attention = today?.headlineCount ?? 0;
  const badge = attention > 9 ? "9+" : attention > 0 ? String(attention) : null;

  const expanded = !isTablet || hovered || sidebarExpanded;

  // 折叠态下不保留展开状态，避免浮层粘住。
  useEffect(() => {
    if (!isTablet && sidebarExpanded) setSidebarExpanded(false);
  }, [isTablet, sidebarExpanded, setSidebarExpanded]);

  return (
    <div
      className="relative hidden shrink-0 md:block"
      style={{ width: isTablet ? "var(--sidebar-w-tablet)" : "var(--sidebar-w)" }}
    >
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "absolute inset-y-0 left-0 z-40 flex flex-col border-r border-line-subtle bg-surface",
          "transition-[width] duration-[260ms] ease-orbit",
          expanded ? "w-[var(--sidebar-w)]" : "w-[var(--sidebar-w-tablet)]",
          isTablet && expanded && "shadow-soft",
        )}
      >
        <div className="flex h-[72px] items-center gap-2.5 px-4">
          <OrbitLogo size={22} />
          {expanded && (
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-body font-medium text-ink">Orbit</span>
              <span className="text-micro text-ink-3">人情星图</span>
            </span>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2 pt-2" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const content = (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex h-10 items-center gap-3 rounded-md px-3 text-body transition-colors duration-[140ms]",
                    expanded ? "" : "justify-center px-0",
                    isActive
                      ? "bg-accent-soft text-accent"
                      : "text-ink-2 hover:bg-hover-fill hover:text-ink",
                  )
                }
              >
                <Icon className="size-[18px] shrink-0" aria-hidden />
                {expanded && <span className="truncate">{item.label}</span>}
                {expanded && item.to === "/today" && badge && (
                  <span className="ml-auto rounded-pill bg-accent-soft px-1.5 text-micro text-accent tabular-nums">
                    {badge}
                  </span>
                )}
              </NavLink>
            );
            return expanded ? (
              content
            ) : (
              <Tooltip key={item.to} content={item.label} side="bottom">
                {content}
              </Tooltip>
            );
          })}
        </nav>

        <div className="flex flex-col gap-1 px-2 pb-5">
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className={cn(
              "flex h-10 items-center gap-3 rounded-md px-3 text-body text-ink-2 transition-colors duration-[140ms] hover:bg-hover-fill hover:text-ink",
              expanded ? "" : "justify-center px-0",
            )}
          >
            <Settings className="size-[18px] shrink-0" aria-hidden />
            {expanded && <span>设置</span>}
            {!expanded && <span className="sr-only">设置</span>}
          </button>

          {expanded ? (
            <Link
              to="/settings"
              className="mt-1 flex items-center gap-3 rounded-md px-2 py-2 transition-colors duration-[140ms] hover:bg-hover-fill"
            >
              <Avatar name={user?.nickname ?? "我"} src={user?.avatarUrl} size="sm" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body text-ink">{user?.nickname ?? "我"}</span>
                <span className="truncate text-micro text-ink-3">{user?.email ?? ""}</span>
              </span>
            </Link>
          ) : (
            <div className="mt-1 flex justify-center py-2">
              <Avatar name={user?.nickname ?? "我"} src={user?.avatarUrl} size="sm" />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
