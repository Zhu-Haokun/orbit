import { useEffect, useState } from "react";
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
 * 打开设置页就会跑一次（六小时内复用结果）。离线时后端返回一条 error
 * 说明而不是抛错 —— 更新是便利功能，不该让设置页看起来像坏了。
 */
export function useUpdateCheck() {
  return useQuery<UpdateCheck>({
    queryKey: ["version", "check"],
    queryFn: ({ signal }) => versionService.check(signal),
    retry: false,
    staleTime: 6 * 60 * 60 * 1000,
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

/* ---------------------------------------------------------------------------
 * 启动时的静默检查
 *
 * 本地软件没法主动"推"更新给已经装在别人电脑上的副本 —— 没有服务器。
 * 但用户也几乎不会自己去点「检查更新」。所以打开应用时在后台问一次，
 * 有新版本就在「设置」旁边点一个小圆点。
 *
 * 三条纪律：
 *   * 不阻塞、不转圈、失败完全静默（离线 / 未配置仓库 / GitHub 限流都不该打扰人）
 *   * 六小时内不重复问 —— 匿名 GitHub API 每小时只有 60 次
 *   * 只是"提示"，绝不自动下载，更不自动替换文件
 * ------------------------------------------------------------------------- */

const NOTICE_CACHE_KEY = "orbit.update.notice";
const NOTICE_TTL_MS = 6 * 60 * 60 * 1000;

interface UpdateNotice {
  hasUpdate: boolean;
  latest: string | null;
  checkedAt: number;
}

function readNoticeCache(): UpdateNotice | null {
  try {
    const raw = window.localStorage.getItem(NOTICE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UpdateNotice>;
    if (typeof parsed?.checkedAt !== "number") return null;
    return {
      hasUpdate: Boolean(parsed.hasUpdate),
      latest: typeof parsed.latest === "string" ? parsed.latest : null,
      checkedAt: parsed.checkedAt,
    };
  } catch {
    return null;
  }
}

function writeNoticeCache(notice: UpdateNotice): void {
  try {
    window.localStorage.setItem(NOTICE_CACHE_KEY, JSON.stringify(notice));
  } catch {
    /* 隐私模式下存不了，不影响这次提示 */
  }
}

function isFresh(notice: UpdateNotice | null): boolean {
  return Boolean(notice && Date.now() - notice.checkedAt < NOTICE_TTL_MS);
}

/** 丢掉缓存的检查结果 —— 用户手动点过「检查更新」之后强制刷新用。 */
export function clearUpdateNoticeCache(): void {
  try {
    window.localStorage.removeItem(NOTICE_CACHE_KEY);
  } catch {
    /* 忽略 */
  }
}

export interface UpdateNoticeState {
  hasUpdate: boolean;
  latest: string | null;
}

/**
 * 应用启动时后台检查一次更新。
 *
 * 返回值只用来画一个小圆点 —— 版本详情仍然由用户在设置页主动查看。
 */
export function useUpdateNotice(): UpdateNoticeState {
  const [notice, setNotice] = useState<UpdateNotice | null>(null);

  useEffect(() => {
    // 六小时内问过就不再问。
    const cached = readNoticeCache();
    if (isFresh(cached)) {
      setNotice(cached);
      return;
    }

    const controller = new AbortController();
    versionService
      .check(controller.signal)
      .then((result) => {
        const next: UpdateNotice = {
          hasUpdate: result.hasUpdate,
          latest: result.latest,
          checkedAt: Date.now(),
        };
        writeNoticeCache(next);
        setNotice(next);
      })
      .catch(() => {
        // 离线、未配置仓库、限流 —— 全都安静略过。
        // 这里绝不 toast：打开应用不该被一条网络错误打扰。
      });

    return () => controller.abort();
  }, []);

  return { hasUpdate: Boolean(notice?.hasUpdate), latest: notice?.latest ?? null };
}
