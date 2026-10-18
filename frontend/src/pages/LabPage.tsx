import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { OrbitLogo } from "@/components/layout/OrbitLogo";

/**
 * 平行人生 · LifeSim 实验场（第六个入口）。
 *
 * 设计取舍：
 * - LifeSim 是一个**独立的静态子应用**（经典 script + 自己的 hash 路由），
 *   所以这里只用 iframe 承载，不 import 它的任何代码，也不共享 React 状态。
 * - 这一页故意放在 AppShell 之外、全屏渲染：如果套进 AppShell，Orbit 的左侧栏
 *   和 LifeSim 自己的侧栏会并排出现，两条导航很吵。进入运行页时 Orbit 让出整个
 *   窗口，顶部只留一条 44px 的“返回 Orbit”栏，像从书房走进另一个房间。
 * - LifeSim 不读取 Orbit 的任何数据，也不发起网络请求；它的人生卡只存在
 *   浏览器 localStorage 里。两边唯一的连接就是这条路由和这个 iframe。
 */
export default function LabPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = "平行人生 · Orbit";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col bg-[#070912]">
      {/*
        这条栏始终是深色：LifeSim 只有深色皮肤，如果跟着 Orbit 的浅色主题
        变成白条，会在顶部割出一道明显的接缝。它属于“另一个房间”的墙，
        所以固定用 LifeSim 的底色，而不是 Orbit 的 surface token。
      */}
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0b0e17]/95 px-3 backdrop-blur-md md:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <OrbitLogo size={16} />
          <span className="truncate text-sm font-medium text-[#f2f4fb]">平行人生</span>
          <span className="hidden truncate text-micro text-[#7d86a3] sm:inline">
            LifeSim · 人生沙盒
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <a
            href="/lifesim/index.html"
            target="_blank"
            rel="noreferrer"
            className="flex h-7 items-center gap-1.5 rounded-sm px-2 text-micro text-[#7d86a3] transition-colors duration-[140ms] hover:bg-white/5 hover:text-[#f2f4fb]"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">新标签打开</span>
            <span className="sr-only sm:hidden">在新标签打开完整版</span>
          </a>
          <Link
            to="/galaxy"
            className="flex h-7 items-center gap-1.5 rounded-sm px-2 text-micro text-[#b9c0d8] transition-colors duration-[140ms] hover:bg-white/5 hover:text-[#f2f4fb]"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            返回 Orbit
          </Link>
        </div>
      </header>

      {/*
        用 /lifesim/index.html 而不是 /lifesim/：
        后端的 SPA catch-all 只在“目标是一个文件”时才返回它，目录 URL 会回退成
        Orbit 的 index.html。index.html 这个入口同时让 LifeSim 的相对路径
        （css/…、js/…）解析到 /lifesim/css/…、/lifesim/js/…。
      */}
      <iframe
        title="平行人生 · LifeSim 实验场"
        src="/lifesim/index.html"
        className="min-h-0 w-full flex-1 border-0 bg-[#070912]"
        allow="autoplay; fullscreen"
      />
    </div>
  );
}
