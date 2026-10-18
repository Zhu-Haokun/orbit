import { Suspense, lazy, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { OrbitLogo } from "@/components/layout/OrbitLogo";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSessionStore } from "@/stores/sessionStore";

/**
 * 规范 §8 路由
 * / /login /register /galaxy /today /record /memories /search /people/:personId /settings
 * 规范：/ 在登录状态下自动进入 /galaxy。
 *
 * 额外入口：
 *   /lab       —— 平行人生的入口页（介绍 + “进入实验场”），套 AppShell；
 *   /lab/play  —— LifeSim 静态子应用，全屏，不套 AppShell。
 * 两段式是刻意的：用户先知道这是什么，再决定要不要进去。
 */

const LandingPage = lazy(() => import("@/pages/LandingPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/RegisterPage"));
const GalaxyPage = lazy(() => import("@/pages/GalaxyPage"));
const RecordPage = lazy(() => import("@/pages/RecordPage"));
const PersonPage = lazy(() => import("@/pages/PersonPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const LabIntroPage = lazy(() => import("@/pages/LabIntroPage"));
const LabPage = lazy(() => import("@/pages/LabPage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));

// 今天 / 回忆 / 搜索三页导出的是具名组件。
const TodayPage = lazy(() =>
  import("@/pages/TodayPage").then((module) => ({ default: module.TodayPage })),
);
const MemoriesPage = lazy(() =>
  import("@/pages/MemoriesPage").then((module) => ({ default: module.MemoriesPage })),
);
const SearchPage = lazy(() =>
  import("@/pages/SearchPage").then((module) => ({ default: module.SearchPage })),
);

function BootSplash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-base">
      <OrbitLogo size={28} />
      <div className="w-40">
        <Skeleton className="h-2 w-full" />
      </div>
      <span className="sr-only">正在打开你的星图</span>
    </div>
  );
}

/** 规范 §43: 星图不能成为唯一导航方式，所有人物必须可通过搜索或列表访问。 */
function RequireAuth({ children }: { children: ReactNode }) {
  const status = useSessionStore((state) => state.status);
  const location = useLocation();

  if (status === "loading") return <BootSplash />;
  if (status === "anonymous") return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const status = useSessionStore((state) => state.status);
  if (status === "loading") return <BootSplash />;
  if (status === "authenticated") return <Navigate to="/galaxy" replace />;
  return <>{children}</>;
}

function RootRoute() {
  const status = useSessionStore((state) => state.status);
  if (status === "loading") return <BootSplash />;
  if (status === "authenticated") return <Navigate to="/galaxy" replace />;
  return <LandingPage />;
}

export function AppRouter() {
  return (
    <Suspense fallback={<BootSplash />}>
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnly>
              <RegisterPage />
            </PublicOnly>
          }
        />

        {/*
          平行人生（LifeSim）是独立的静态子应用，放在 AppShell 之外全屏渲染：
          它有自己的侧栏与路由，套进 Orbit 的壳里会出现两条导航。
          这里只保留登录态校验，进去之后由 LabPage 自己的顶部栏提供返回入口。
        */}
        <Route
          path="/lab/play"
          element={
            <RequireAuth>
              <LabPage />
            </RequireAuth>
          }
        />

        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/galaxy" element={<GalaxyPage />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/record" element={<RecordPage />} />
          <Route path="/memories" element={<MemoriesPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/lab" element={<LabIntroPage />} />
          <Route path="/people/:personId" element={<PersonPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
