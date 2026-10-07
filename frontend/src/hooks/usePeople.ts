import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { galaxyService } from "@/services/galaxy";
import { queryKeys } from "@/services/keys";
import { groupsService, peopleService } from "@/services/people";
import { toast } from "@/stores/toastStore";
import type { GroupInput, PersonInput, PersonPatch } from "@/types";

/** 规范 §45 People / Groups */

/** 星图上"一起出现过"的人对 —— 只有真的同框过才会有线。 */
export function useGalaxyLinks() {
  return useQuery({
    queryKey: queryKeys.galaxyLinks,
    queryFn: ({ signal }) => galaxyService.links(signal),
    staleTime: 30_000,
  });
}

export function usePeople(filters?: { group?: string; search?: string }, enabled = true) {
  return useQuery({
    queryKey: queryKeys.people(filters),
    queryFn: ({ signal }) => peopleService.list(filters, signal),
    enabled,
  });
}

export function usePerson(personId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.person(personId ?? ""),
    queryFn: ({ signal }) => peopleService.get(personId as string, signal),
    enabled: Boolean(personId),
  });
}

export function useGroups(enabled = true) {
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: ({ signal }) => groupsService.list(signal),
    enabled,
  });
}

/** Every person-scoped mutation refreshes the star map, the person and 今天. */
export function invalidatePersonScope(client: ReturnType<typeof useQueryClient>, personId?: string) {
  void client.invalidateQueries({ queryKey: ["people"] });
  void client.invalidateQueries({ queryKey: queryKeys.today });
  void client.invalidateQueries({ queryKey: ["memories"] });
  if (personId) {
    void client.invalidateQueries({ queryKey: queryKeys.person(personId) });
  } else {
    void client.invalidateQueries({ queryKey: ["person"] });
  }
}

export function useCreatePerson() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PersonInput) => peopleService.create(input),
    onSuccess: (person) => {
      invalidatePersonScope(client, person.id);
      void client.invalidateQueries({ queryKey: queryKeys.groups });
    },
  });
}

export function useUpdatePerson(personId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: PersonPatch) => peopleService.update(personId, patch),
    onSuccess: () => {
      invalidatePersonScope(client, personId);
      void client.invalidateQueries({ queryKey: queryKeys.groups });
    },
  });
}

export function useDeletePerson() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (personId: string) => peopleService.remove(personId),
    onSuccess: () => {
      invalidatePersonScope(client);
      void client.invalidateQueries({ queryKey: queryKeys.groups });
      toast.success("已删除");
    },
  });
}

export function useCreateGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: GroupInput) => groupsService.create(input),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.groups }),
  });
}

export function useUpdateGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<GroupInput> }) =>
      groupsService.update(id, patch),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.groups }),
  });
}

export function useDeleteGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => groupsService.remove(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.groups });
      void client.invalidateQueries({ queryKey: ["people"] });
    },
  });
}
