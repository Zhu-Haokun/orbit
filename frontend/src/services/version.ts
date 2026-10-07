import { api } from "@/lib/api";

/**
 * 版本与更新。
 *
 * 后端只负责"查"和"下载到 update-staging"，真正替换文件由
 * ``apply-update.bat`` 在程序关闭后做 —— 运行中的进程不能替换自己的源码。
 */

export interface VersionInfo {
  name: string;
  current: string;
  /** 空字符串表示还没配置 GitHub 仓库，更新检查会安静跳过。 */
  repository: string;
  notes: string;
  /** 更新包是否已经下载好、等待用户关闭程序后应用。 */
  staged: boolean;
  stagedFiles: number;
  /**
   * 服务端正在发的入口 chunk 文件名，例如 `/assets/index-a1b2c3.js`。
   * 前端拿它对比自己那一份：不一致就说明这个标签页是旧的，自动刷新一次。
   */
  frontendEntry: string | null;
}

export interface UpdateCheck {
  current: string;
  repository: string;
  latest: string | null;
  latestName: string | null;
  releaseNotes: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
  hasUpdate: boolean;
  canDownload: boolean;
  /** 检查失败的原因；离线、未配置仓库都会写在这里。 */
  error: string | null;
}

export interface StagedResult {
  files: number;
  bytes: number;
  skipped: number;
  path: string;
  message: string;
}

export const versionService = {
  current: (signal?: AbortSignal) => api.get<VersionInfo>("/version", { signal }),
  check: (signal?: AbortSignal) => api.get<UpdateCheck>("/version/check", { signal }),
  download: () => api.post<StagedResult>("/version/download"),
  discard: () => api.del<{ message: string }>("/version/download"),
};
