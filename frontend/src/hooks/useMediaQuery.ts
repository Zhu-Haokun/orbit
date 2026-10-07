import { useCallback, useSyncExternalStore } from "react";

/** Responsive breakpoints from 规范 §41: desktop ≥1200, tablet 768–1199, mobile <768. */

function subscribe(query: string, onStoreChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
  const list = window.matchMedia(query);
  list.addEventListener("change", onStoreChange);
  return () => list.removeEventListener("change", onStoreChange);
}

function getSnapshot(query: string): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
}

/**
 * 用 ``useSyncExternalStore`` 订阅媒体查询：不需要在 effect 里 setState，
 * 也不会有第一帧闪烁。
 */
export function useMediaQuery(query: string): boolean {
  const handleSubscribe = useCallback((onStoreChange: () => void) => subscribe(query, onStoreChange), [query]);
  const handleSnapshot = useCallback(() => getSnapshot(query), [query]);
  return useSyncExternalStore(handleSubscribe, handleSnapshot, () => false);
}

export const useIsMobile = () => useMediaQuery("(max-width: 767px)");
export const useIsTablet = () => useMediaQuery("(min-width: 768px) and (max-width: 1199px)");
export const useIsDesktop = () => useMediaQuery("(min-width: 1200px)");
