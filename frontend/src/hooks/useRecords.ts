import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { invalidatePersonScope } from "@/hooks/usePeople";
import { queryKeys } from "@/services/keys";
import {
  borrowRecordsService,
  commitmentsService,
  importantDatesService,
  interactionsService,
  preferencesService,
  updatesService,
} from "@/services/records";
import { toast } from "@/stores/toastStore";
import type {
  BorrowRecordInput,
  BorrowRecordPatch,
  CommitmentInput,
  CommitmentPatch,
  ImportantDateInput,
  ImportantDatePatch,
  InteractionInput,
  InteractionPatch,
  PersonUpdateInput,
  PersonUpdatePatch,
  PreferenceInput,
  PreferencePatch,
} from "@/types";

/**
 * 规范 §22 最近近况 / §23 未完待续 / §24 重要日期 /
 * §25 偏好 / §26 借还 / §27 时间轴。
 *
 * 人物详情会把整棵子树一次性取回（usePerson），
 * 这些列表 hook 供独立入口（今天页、搜索页、抽屉）复用。
 */

/* ----------------------------- Interactions ----------------------------- */

export function useInteractions(personId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.interactions(personId ?? ""),
    queryFn: ({ signal }) => interactionsService.listByPerson(personId as string, signal),
    enabled: Boolean(personId),
  });
}

/** 还没整理的「先记下来」。服务端保存，所以离开记录页也不会丢。 */
export function useDrafts() {
  return useQuery({
    queryKey: queryKeys.interactionDrafts,
    queryFn: ({ signal }) => interactionsService.listDrafts(signal),
  });
}

function invalidateDrafts(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: queryKeys.interactionDrafts });
}
export function useCreateInteraction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: InteractionInput) => interactionsService.create(input),
    onSuccess: (interaction) => {
      invalidatePersonScope(client, interaction.personId);
      invalidateDrafts(client);
    },
  });
}

export function useDeleteDraft() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => interactionsService.remove(id),
    onSuccess: () => invalidateDrafts(client),
  });
}

export function useUpdateInteraction(personId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: InteractionPatch }) =>
      interactionsService.update(id, patch),
    onSuccess: () => invalidatePersonScope(client, personId),
  });
}

export function useDeleteInteraction(personId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => interactionsService.remove(id),
    onSuccess: () => invalidatePersonScope(client, personId),
  });
}

/* ------------------------------ 最近近况 ------------------------------ */

export function useUpdates(personId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.updates(personId ?? ""),
    queryFn: ({ signal }) => updatesService.listByPerson(personId as string, signal),
    enabled: Boolean(personId),
  });
}

export function useCreateUpdate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PersonUpdateInput) => updatesService.create(input),
    onSuccess: (update) => invalidatePersonScope(client, update.personId),
  });
}

export function useUpdateUpdate(personId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PersonUpdatePatch }) =>
      updatesService.update(id, patch),
    onSuccess: () => invalidatePersonScope(client, personId),
  });
}

export function useDeleteUpdate(personId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => updatesService.remove(id),
    onSuccess: () => invalidatePersonScope(client, personId),
  });
}

/* ------------------------------ 未完待续 ------------------------------ */

export function useCommitments(
  filters?: { personId?: string; status?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.commitments(filters?.personId, filters?.status),
    queryFn: ({ signal }) => commitmentsService.list(filters, signal),
    enabled,
  });
}

export function useCreateCommitment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CommitmentInput) => commitmentsService.create(input),
    onSuccess: (commitment) => invalidatePersonScope(client, commitment.personId),
  });
}

export function useUpdateCommitment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CommitmentPatch }) =>
      commitmentsService.update(id, patch),
    onSuccess: (commitment) => invalidatePersonScope(client, commitment.personId),
  });
}

export function useCompleteCommitment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => commitmentsService.complete(id),
    onSuccess: (commitment) => {
      invalidatePersonScope(client, commitment.personId);
      // 规范 §54.1: 这件事告一段落了
      toast.show("这件事告一段落了");
    },
  });
}

export function usePostponeCommitment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => commitmentsService.postpone(id),
    onSuccess: (commitment) => invalidatePersonScope(client, commitment.personId),
  });
}

export function useDeleteCommitment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => commitmentsService.remove(id),
    onSuccess: () => invalidatePersonScope(client),
  });
}

/* ------------------------------ 重要日期 ------------------------------ */

export function useImportantDates(personId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.importantDates(personId),
    queryFn: ({ signal }) => importantDatesService.list(personId ? { personId } : undefined, signal),
    enabled,
  });
}

export function useCreateImportantDate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportantDateInput) => importantDatesService.create(input),
    onSuccess: (date) => {
      invalidatePersonScope(client, date.personId);
      void client.invalidateQueries({ queryKey: ["importantDates"] });
    },
  });
}

export function useUpdateImportantDate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ImportantDatePatch }) =>
      importantDatesService.update(id, patch),
    onSuccess: (date) => {
      invalidatePersonScope(client, date.personId);
      void client.invalidateQueries({ queryKey: ["importantDates"] });
    },
  });
}

export function useDeleteImportantDate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => importantDatesService.remove(id),
    onSuccess: () => {
      invalidatePersonScope(client);
      void client.invalidateQueries({ queryKey: ["importantDates"] });
    },
  });
}

/* -------------------------------- 偏好 -------------------------------- */

export function usePreferences(personId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.preferences(personId),
    queryFn: ({ signal }) => preferencesService.list(personId ? { personId } : undefined, signal),
    enabled,
  });
}

export function useCreatePreference() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PreferenceInput) => preferencesService.create(input),
    onSuccess: (preference) => invalidatePersonScope(client, preference.personId),
  });
}

export function useUpdatePreference() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PreferencePatch }) =>
      preferencesService.update(id, patch),
    onSuccess: (preference) => invalidatePersonScope(client, preference.personId),
  });
}

export function useDeletePreference() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => preferencesService.remove(id),
    onSuccess: () => invalidatePersonScope(client),
  });
}

/* -------------------------------- 借还 -------------------------------- */

export function useBorrowRecords(filters?: { personId?: string; status?: string }, enabled = true) {
  return useQuery({
    queryKey: queryKeys.borrowRecords(filters?.personId, filters?.status),
    queryFn: ({ signal }) => borrowRecordsService.list(filters, signal),
    enabled,
  });
}

export function useCreateBorrowRecord() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: BorrowRecordInput) => borrowRecordsService.create(input),
    onSuccess: (record) => invalidatePersonScope(client, record.personId),
  });
}

export function useUpdateBorrowRecord() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: BorrowRecordPatch }) =>
      borrowRecordsService.update(id, patch),
    onSuccess: (record) => invalidatePersonScope(client, record.personId),
  });
}

export function useDeleteBorrowRecord() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => borrowRecordsService.remove(id),
    onSuccess: () => invalidatePersonScope(client),
  });
}
