import { useEffect, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import { queryClient } from "@/lib/queryClient";
import { useSessionStore } from "@/stores/sessionStore";
import { useUiStore } from "@/stores/uiStore";

/** 规范 §6.4: token 存在时先恢复会话，再决定路由。 */
function SessionHydrator() {
  const hydrate = useSessionStore((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  return null;
}

/**
 * 规范 §36.1 外观：深色 / 跟随系统，默认深色。
 * `跟随系统` resolves through prefers-color-scheme into the light token palette.
 */
function ThemeSync() {
  const theme = useUiStore((state) => state.theme);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const resolved = theme === "system" && media.matches ? "light" : "dark";
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeSync />
        <SessionHydrator />
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
}
