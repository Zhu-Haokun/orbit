import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/services/keys";
import { exportService, memoriesService, searchService, todayService } from "@/services/insights";

/** 规范 §33 今天 / §34 回忆 / §35 搜索 / §36.2 导出 */

export function useToday(enabled = true) {
  return useQuery({
    queryKey: queryKeys.today,
    queryFn: ({ signal }) => todayService.get(signal),
    enabled,
  });
}

/**
 * 规范 §35.3: 空查询不发请求，直接返回空结果。
 * The page owns the debounce so the input stays responsive.
 */
export function useSearch(query: string, enabled = true) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: queryKeys.search(trimmed),
    queryFn: ({ signal }) => searchService.search(trimmed, signal),
    enabled: enabled && trimmed.length > 0,
    staleTime: 10_000,
  });
}

export interface MemoriesFilters {
  year?: number | null;
  groupId?: string | null;
  /** 从右侧索引栏点地点进来的筛选。 */
  location?: string | null;
  /** 从右侧索引栏点人物进来的筛选。 */
  personId?: string | null;
}

export function useMemories(filters?: MemoriesFilters) {
  return useQuery({
    queryKey: queryKeys.memories(filters),
    queryFn: ({ signal }) => memoriesService.get(filters, signal),
  });
}

export function useExportPayload() {
  return useQuery({
    queryKey: ["export"] as const,
    queryFn: ({ signal }) => exportService.json(signal),
    enabled: false,
  });
}
