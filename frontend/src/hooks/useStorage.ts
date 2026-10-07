import { useQuery } from "@tanstack/react-query";

import { storageService, type StorageInfo } from "@/services/insights";

/** 当前存储位置。 */
export function useStorage() {
  return useQuery<StorageInfo>({
    queryKey: ["storage"],
    queryFn: ({ signal }) => storageService.read(signal),
    // 不缓存：体积与文件数是**实时**读磁盘算出来的，缓存会让用户
    // 刚上传完图片却看到旧数字，反而以为这些数是写死的。
    // 这个接口只做一次 stat 加一次目录遍历，很便宜。
    staleTime: 0,
    refetchOnMount: "always",
  });
}
