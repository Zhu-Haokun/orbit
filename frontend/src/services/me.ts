import { api } from "@/lib/api";
import type { MemoryComment, MemoryCommentInput, PersonDetail, PersonPatch } from "@/types";

/**
 * 「我」自己的档案（``/api/me``）。
 *
 * 后端把"我"也存成一条 person（``isSelf = true``），只是不出现在 /api/people 里。
 * 这样独处记录、自己的时间轴、回忆、搜索都复用同一套逻辑。
 */
export const meService = {
  read: () => api.get<PersonDetail>("/me"),
  update: (patch: PersonPatch) => api.patch<PersonDetail>("/me", patch),
};

/** 回忆评论：挂在某条互动下面。 */
export const commentsService = {
  list: (interactionId: string) =>
    api.get<MemoryComment[]>(`/interactions/${interactionId}/comments`),
  create: (interactionId: string, input: MemoryCommentInput) =>
    api.post<MemoryComment>(`/interactions/${interactionId}/comments`, input),
  remove: (interactionId: string, commentId: string) =>
    api.del<void>(`/interactions/${interactionId}/comments/${commentId}`),
};
