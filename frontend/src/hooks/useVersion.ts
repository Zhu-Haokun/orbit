import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { versionService, type StagedResult, type UpdateCheck } from "@/services/version";
import { toast } from "@/stores/toastStore";

/** 当前版本。打开设置页就调，必须瞬时（后端不联网）。 */
export function useVersion() {
  return useQuery({
    queryKey: ["version"],
    queryFn: ({ signal }) => versionService.current(signal),
    staleTime: 60_000,
  });
}

/**
 * 检查更新。
 *
 * 刻意不做成自动轮询：这是一次**外网请求**，只有用户点了才发。
 * 离线时后端会返回一条 error 说明，而不是抛错 —— 更新是便利功能，
 * 不该让设置页看起来像坏了。
 */
export function useUpdateCheck() {
  return useQuery<UpdateCheck>({
    queryKey: ["version", "check"],
    queryFn: ({ signal }) => versionService.check(signal),
    enabled: false,
    retry: false,
    staleTime: 0,
  });
}

/** 下载更新到 update-staging/（只暂存，不应用）。 */
export function useDownloadUpdate() {
  const queryClient = useQueryClient();
  return useMutation<StagedResult, Error>({
    mutationFn: () => versionService.download(),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["version"] });
      toast.success(`已下载 ${result.files} 个文件，请关闭 Orbit 后运行 apply-update.bat。`);
    },
    onError: (error) => {
      toast.error(error.message || "下载失败，请稍后再试。");
    },
  });
}

/** 丢弃暂存的更新。 */
export function useCancelUpdate() {
  const queryClient = useQueryClient();
  return useMutation<{ message: string }, Error>({
    mutationFn: () => versionService.discard(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["version"] });
    },
  });
}
