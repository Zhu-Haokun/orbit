import { api, requestBlob } from "@/lib/api";
import type { ExportPayload, MemoriesPayload, SearchResults, TodayPayload } from "@/types";

/** 规范 §33 / §45 Today */
export const todayService = {
  get: (signal?: AbortSignal) => api.get<TodayPayload>("/today", { signal }),
};

/** 规范 §35 / §45 Search */
export const searchService = {
  search: (query: string, signal?: AbortSignal) =>
    api.get<SearchResults>("/search", { query: { q: query }, signal }),
};

/** 规范 §34 回忆 */
export const memoriesService = {
  get: (
    filters?: {
      year?: number | null;
      groupId?: string | null;
      location?: string | null;
      personId?: string | null;
    },
    signal?: AbortSignal,
  ) =>
    api.get<MemoriesPayload>("/memories", {
      query: {
        year: filters?.year ?? undefined,
        groupId: filters?.groupId ?? undefined,
        location: filters?.location ?? undefined,
        personId: filters?.personId ?? undefined,
      },
      signal,
    }),
};

/** 存储位置：让用户知道自己的东西到底存在哪。 */
export interface StorageInfo {
  backendDir: string;
  /** 被当作"项目根"的那一层，通常就是打包发出去的那个文件夹。 */
  packageRoot: string;
  packageRootName: string;
  databaseUrl: string;
  uploadDirSetting: string;
  /** 本机绝对路径 —— 复制到资源管理器里才能用。 */
  databasePath: string;
  /** 从项目文件夹开始的展示路径 —— 打包发给别人也是对的。 */
  databaseDisplay: string;
  databaseExists: boolean;
  databaseBytes: number;
  uploadPath: string;
  uploadDisplay: string;
  uploadExists: boolean;
  uploadBytes: number;
  uploadFileCount: number;
  envFile: string;
  envFileDisplay: string;
}

export const storageService = {
  read: (signal?: AbortSignal) => api.get<StorageInfo>("/storage", { signal }),
};

/** 规范 §36.2 / §88 数据导出 */
export const exportService = {
  json: (signal?: AbortSignal) => api.get<ExportPayload>("/export/json", { signal }),
  /** 规范 §36.2: CSV 也走带 token 的请求，不用裸链接。 */
  csv: (signal?: AbortSignal) => requestBlob("/export/csv", { signal }),
};
