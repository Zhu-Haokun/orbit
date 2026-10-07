import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { ToastViewport } from "@/components/ui/Toast";
import { CreatePersonModal } from "@/features/people/CreatePersonModal";
import { GlobalSearch } from "@/features/search/GlobalSearch";
import { cn } from "@/lib/cn";
import { applyBackgroundTone, useBackgroundStore } from "@/stores/backgroundStore";

/**
 * 规范 §9 全局页面框架
 * Desktop ≥1200: Sidebar 232px + Main
 * Main: min-width 0 / height 100vh / overflow hidden on galaxy / overflow-y auto on content pages
 * 规范 §9.3 Mobile: 取消左侧导航，采用底部 Tab。
 */
export function AppShell() {
  const location = useLocation();
  const isGalaxy = location.pathname.startsWith("/galaxy");
  const isRecord = location.pathname.startsWith("/record");
  const tone = useBackgroundStore((state) => state.tone);

  // 氛围只是 <html> 上的一个 data 属性：切换不重载、不重新请求任何东西。
  useEffect(() => {
    applyBackgroundTone(tone);
  }, [tone]);

  return (
    <div className="relative flex h-full min-h-dvh w-full bg-base">
      {/*
        背景层次（产品文档「背景层次」）：
        base 在最远，canvas 是页面主背景，内容表面（卡片 / 输入）再往上。
        之前所有页面共用一块纯黑，于是文字像浮在黑幕上。
        星图例外 —— 它自己就是夜空，不需要这层。
      */}
      {!isGalaxy && <div aria-hidden className="orbit-backdrop bg-canvas" />}

      <div className="relative z-10 flex min-w-0 flex-1">
        <Sidebar />

        <main
          className={cn(
            "relative flex min-w-0 flex-1 flex-col",
            isGalaxy ? "overflow-hidden" : "scroll-quiet overflow-y-auto",
            "pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom,0px))] md:pb-0",
          )}
        >
          {/* 规范 §11 page enter 300ms —— 保持安静，只做极轻的淡入 */}
          <div
            key={location.pathname}
            className={cn(
              "flex min-h-0 flex-1 flex-col motion-safe:animate-[orbit-page_300ms_var(--ease-orbit)]",
              isGalaxy && "h-full",
            )}
          >
            <Outlet />
          </div>

          {/* 记录页是最高频交互，移动端给输入留出更多呼吸空间 */}
          {isRecord && <div aria-hidden className="h-4 md:hidden" />}
        </main>
      </div>

      <MobileTabBar />
      <GlobalSearch />
      <CreatePersonModal />
      <ImageLightbox />
      <ToastViewport />
    </div>
  );
}
