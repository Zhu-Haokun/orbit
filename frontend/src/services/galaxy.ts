import { api } from "@/lib/api";

/**
 * 星图的"共同经历"连线。
 *
 * 两个人之间**只有真的同框过才会连起来** —— 数据来自同一次多人记录
 * 共享的 `eventId`。之前星图按星系把成员串成链，那是"被分到同一组"，
 * 不是"一起做过什么"。
 */
export interface SharedEventLink {
  source: string;
  target: string;
  /** 一起经历过几次。只陈述次数，不做评价。 */
  count: number;
}

export const galaxyService = {
  links: (signal?: AbortSignal) => api.get<SharedEventLink[]>("/galaxy/links", { signal }),
};
