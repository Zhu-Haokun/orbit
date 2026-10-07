import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { commentsService, meService } from "@/services/me";
import type { MemoryCommentInput, PersonPatch } from "@/types";

/** 自我档案。几乎不变，缓存久一点没关系。 */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => meService.read(),
    staleTime: 60_000,
  });
}

export function useUpdateMe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: PersonPatch) => meService.update(patch),
    onSuccess: (person) => {
      client.setQueryData(["me"], person);
      // 「我」的名字/头像会出现在星图中心、独处记录、回忆里。
      void client.invalidateQueries({ queryKey: ["people"] });
      void client.invalidateQueries({ queryKey: ["memories"] });
    },
  });
}

/* ------------------------------ 回忆评论 ------------------------------ */

export function useCreateComment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ interactionId, input }: { interactionId: string; input: MemoryCommentInput }) =>
      commentsService.create(interactionId, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["memories"] });
      void client.invalidateQueries({ queryKey: ["person"] });
    },
  });
}

export function useDeleteComment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ interactionId, commentId }: { interactionId: string; commentId: string }) =>
      commentsService.remove(interactionId, commentId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["memories"] });
      void client.invalidateQueries({ queryKey: ["person"] });
    },
  });
}
